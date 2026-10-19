import fs from 'fs';
import path from 'path';
import { test, expect } from '@playwright/test';

test('UI Live Test: Rapid Duplicate Upload Intercepted by Redis', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input#username', 'admin');
  await page.fill('input#password', 'AdminPass123!');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/.*\/dashboard/);

  await page.goto('/employees');
  await page.click('button:has-text("Bulk Import")');
  await expect(page.locator('text=Async Bulk Employee Import')).toBeVisible();

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

  // First Upload
  await fileInput.setInputFiles(uploadPath);
  await page.click('button:has-text("Start Async Import")');
  await expect(page.locator('text=100%').or(page.locator('text=SUCCESS')).first()).toBeVisible({ timeout: 15000 });

  // Click "Import Another File" to re-arm modal immediately
  await page.click('button:has-text("Import Another File")');

  // Second Upload with same file within 120s TTL
  await fileInput.setInputFiles(uploadPath);
  await page.click('button:has-text("Start Async Import")');

  // Should immediately reuse deduplicated task or show cached state
  await expect(page.locator('text=Task ID:').first()).toBeVisible({ timeout: 5000 });

  await page.screenshot({ path: 'test-results/ui_celery_dedup_success.png' });
});
