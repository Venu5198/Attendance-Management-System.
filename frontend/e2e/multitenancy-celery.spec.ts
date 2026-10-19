import { test, expect } from '@playwright/test';

test.describe('Multi-Tenancy, Redis Deduplication, & Celery E2E Tests', () => {
  test('login displays organization selector and tenant badge in navbar', async ({ page }) => {
    await page.goto('/login');

    // 1. Verify organization / tenant elements
    await expect(page.locator('text=Organization / Tenant ID')).toBeVisible();
    await expect(page.locator('input#tenant_id')).toHaveValue('default');

    // 2. Click quick tenant pill 'tenant_alpha'
    await page.click('button:has-text("tenant_alpha")');
    await expect(page.locator('input#tenant_id')).toHaveValue('tenant_alpha');

    // 3. Switch back to 'default' and use Quick Test Autofill
    await page.click('button:has-text("Admin (default)")');
    await expect(page.locator('input#username')).toHaveValue('admin');
    await expect(page.locator('input#tenant_id')).toHaveValue('default');

    // 4. Submit login
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/.*\/dashboard/);

    // 5. Verify Navbar displays the Org badge / Switcher
    const orgBadge = page.locator('text=/Global \\/ Default Org|Org: default/');
    await expect(orgBadge).toBeVisible();
  });

  test('asynchronous background task polling and Redis deduplication integration', async ({ request }) => {
    // 1. Authenticate as Admin to obtain JWT token
    const loginRes = await request.post('http://localhost:8000/api/v1/auth/login', {
      data: {
        username: 'admin',
        password: 'AdminPass123!',
      },
    });
    expect(loginRes.status()).toBe(200);
    const loginData = await loginRes.json();
    const token = loginData.access_token;
    expect(token).toBeTruthy();

    const idempotencyKey = `playwright-e2e-${Date.now()}`;
    const csvContent = 'employee_id,full_name,email,department,role,hire_date\nPW_EMP_01,Playwright User,pw_user@company.com,QA,EMPLOYEE,2026-03-01';

    // 2. Dispatch bulk import request to RabbitMQ via Celery
    const res1 = await request.post('http://localhost:8000/api/v1/employees/bulk-import-async', {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Tenant-ID': 'default',
        'X-Idempotency-Key': idempotencyKey,
      },
      multipart: {
        file: {
          name: 'pw_employees.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from(csvContent, 'utf-8'),
        },
      },
    });

    expect(res1.status()).toBe(202);
    const body1 = await res1.json();
    expect(body1.status).toBe('ACCEPTED');
    expect(body1.task_id).toBeTruthy();
    const taskId = body1.task_id;

    // 3. Test Redis Deduplication: send identical duplicate request
    const resDup = await request.post('http://localhost:8000/api/v1/employees/bulk-import-async', {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Tenant-ID': 'default',
        'X-Idempotency-Key': idempotencyKey,
      },
      multipart: {
        file: {
          name: 'pw_employees.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from(csvContent, 'utf-8'),
        },
      },
    });

    // Should return 202 with cached response and X-Cache-Deduplicated header
    expect(resDup.status()).toBe(202);
    expect(resDup.headers()['x-cache-deduplicated']).toBe('true');
    const bodyDup = await resDup.json();
    expect(bodyDup.task_id).toBe(taskId);

    // 4. Poll task status endpoint until Celery worker completes
    let isCompleted = false;
    for (let i = 0; i < 15; i++) {
      const taskRes = await request.get(`http://localhost:8000/api/v1/tasks/${taskId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      expect(taskRes.status()).toBe(200);
      const taskData = await taskRes.json();
      if (taskData.status === 'SUCCESS') {
        isCompleted = true;
        expect(taskData.result.status).toBe('COMPLETED');
        expect(taskData.result.total_rows).toBe(1);
        break;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }

    expect(isCompleted).toBe(true);
  });
});
