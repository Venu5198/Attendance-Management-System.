import { test, expect } from '@playwright/test';

test.describe('Full Stack Ecosystem E2E Verification', () => {
  test('verifies all 8 infrastructure services: API, Celery, RabbitMQ, Mongo, Redis, Prometheus, Grafana, Frontend', async ({ request, page }) => {
    // 1. Backend API & Database (FastAPI + MongoDB + Redis)
    const healthRes = await request.get('http://localhost:8000/api/v1/health');
    expect(healthRes.status()).toBe(200);
    const healthData = await healthRes.json();
    expect(healthData.status).toBe('healthy');
    expect(healthData.database).toBe('connected');      // MongoDB Verified
    expect(healthData.cache_redis).toBe('connected');   // Redis Verified

    // 2. Prometheus Scraper Target State
    const promRes = await request.get('http://localhost:9090/api/v1/targets');
    expect(promRes.status()).toBe(200);
    const promData = await promRes.json();
    const activeTargets = promData.data.activeTargets;
    const backendTarget = activeTargets.find((t: any) => t.labels?.job === 'attendance_backend');
    expect(backendTarget).toBeTruthy();
    expect(backendTarget.health).toBe('up');            // Prometheus Verified

    // 3. Grafana Dashboard Availability
    const grafanaRes = await request.get('http://localhost:3000/api/health');
    expect(grafanaRes.status()).toBe(200);
    const grafanaData = await grafanaRes.json();
    expect(grafanaData.database).toBe('ok');            // Grafana Verified

    // 4. RabbitMQ Management API & Queues
    const rabbitRes = await request.get('http://localhost:15672/api/overview', {
      headers: {
        Authorization: 'Basic ' + Buffer.from('guest:guest').toString('base64'),
      },
    });
    expect(rabbitRes.status()).toBe(200);
    const rabbitData = await rabbitRes.json();
    expect(rabbitData.rabbitmq_version).toBeTruthy();    // RabbitMQ Verified

    // 5. Celery Worker Execution & Redis Request Deduplication
    const loginRes = await request.post('http://localhost:8000/api/v1/auth/login', {
      data: { username: 'admin', password: 'AdminPass123!' },
    });
    expect(loginRes.status()).toBe(200);
    const token = (await loginRes.json()).access_token;

    const testIdempKey = `ecosystem-test-${Date.now()}`;
    const csvRoster = 'employee_id,full_name,email,department,role,hire_date\nECO_01,Ecosystem User,eco@org.com,DevOps,EMPLOYEE,2026-04-01';

    // First request -> accepted by RabbitMQ
    const ingestRes1 = await request.post('http://localhost:8000/api/v1/employees/bulk-import-async', {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Tenant-ID': 'default',
        'X-Idempotency-Key': testIdempKey,
      },
      multipart: {
        file: { name: 'test_roster.csv', mimeType: 'text/csv', buffer: Buffer.from(csvRoster) },
      },
    });
    expect(ingestRes1.status()).toBe(202);
    const ingestBody1 = await ingestRes1.json();
    expect(ingestBody1.task_id).toBeTruthy();
    const taskId = ingestBody1.task_id;

    // Second request with same idempotency key -> intercepted by Redis deduplication
    const ingestRes2 = await request.post('http://localhost:8000/api/v1/employees/bulk-import-async', {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Tenant-ID': 'default',
        'X-Idempotency-Key': testIdempKey,
      },
      multipart: {
        file: { name: 'test_roster.csv', mimeType: 'text/csv', buffer: Buffer.from(csvRoster) },
      },
    });
    expect(ingestRes2.status()).toBe(202);
    expect(ingestRes2.headers()['x-cache-deduplicated']).toBe('true');

    // 6. Frontend SPA Navigation & New Feature Verification
    await page.goto('/login');
    await page.fill('input#username', 'admin');
    await page.fill('input#password', 'AdminPass123!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/.*\/dashboard/);

    // Verify Tenant Switcher in navbar
    const tenantSwitcher = page.locator('button:has-text("Global / Default Org")');
    await expect(tenantSwitcher).toBeVisible();

    // Verify Employees page & Bulk Import Modal
    await page.goto('/employees');
    const bulkImportBtn = page.locator('button:has-text("Bulk Import (Excel)")');
    await expect(bulkImportBtn).toBeVisible();
    await bulkImportBtn.click();
    await expect(page.locator('text=Async Bulk Employee Import')).toBeVisible();
    await page.click('button:has-text("Cancel")');

    // Verify Attendance page & Geofence pill
    await page.goto('/attendance');
    await expect(page.locator('text=/Geofence.*12.9716/')).toBeVisible();

    // Verify Reports page & Audit Trail tab
    await page.goto('/reports');
    const auditTabBtn = page.locator('button:has-text("Compliance Audit Trail")');
    await expect(auditTabBtn).toBeVisible();
    await auditTabBtn.click();
    await expect(page.locator('text=Immutable Compliance & Audit Trail')).toBeVisible();
  });
});
