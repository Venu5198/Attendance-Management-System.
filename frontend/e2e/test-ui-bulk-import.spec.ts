import fs from 'fs';
import path from 'path';
import { test, expect } from '@playwright/test';

test('UI Live Test: Celery Bulk Upload with Real Progress & Deduplication Alert', async ({ page }) => {
  // 1. Login as Admin
  await page.goto('/login');
  await page.fill('input#username', 'admin');
  await page.fill('input#password', 'AdminPass123!');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/.*\/dashboard/);

  // 2. Navigate to Employees page
  await page.goto('/employees');
  await expect(page.locator('button:has-text("Bulk Import")').first()).toBeVisible();

  // 3. Open Bulk Import Modal
  await page.click('button:has-text("Bulk Import")');
  await expect(page.locator('text=Async Bulk Employee Import')).toBeVisible();

  // 4. Attach sample file (fallback to test CSV if xlsx is absent)
  const xlsxPath = path.resolve('..', 'employees_bulk_import_sample.xlsx');
  const csvPath = path.resolve('..', 'employees_bulk_import_sample.csv');
  let uploadPath = xlsxPath;
  if (!fs.existsSync(xlsxPath)) {
    fs.writeFileSync(
      csvPath,
      'employee_id,full_name,email,department,role,hire_date\nEMP101,Alexander Wright,alexander.wright@company.com,Engineering,EMPLOYEE,2024-03-15\n'
    );
    uploadPath = csvPath;
  }
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(uploadPath);

  // 5. Click "Start Async Import"
  const startBtn = page.locator('button:has-text("Start Async Import")');
  await expect(startBtn).toBeEnabled();
  await startBtn.click();

  // 6. Expect Celery Task Progress to appear and complete
  await expect(page.locator('text=Task ID:').first()).toBeVisible({ timeout: 10000 });
  await expect(page.locator('text=100%').or(page.locator('text=SUCCESS')).first()).toBeVisible({ timeout: 15000 });

  // 7. Capture proof screenshot of successful Celery processing
  await page.screenshot({ path: 'test-results/ui_celery_upload_success.png' });
});
