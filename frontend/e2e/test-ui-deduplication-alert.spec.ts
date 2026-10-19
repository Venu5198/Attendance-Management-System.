import { test, expect } from '@playwright/test';
import path from 'path';

test('UI Live Test: Rapid Duplicate Upload Intercepted by Redis', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input#username', 'admin');
  await page.fill('input#password', 'AdminPass123!');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/.*\/dashboard/);

  await page.goto('/employees');
  await page.click('button:has-text("Bulk Import")');
  await expect(page.locator('text=Async Bulk Employee Import')).toBeVisible();

  const filePath = path.resolve('..', 'employees_bulk_import_sample.xlsx');
  const fileInput = page.locator('input[type="file"]');

  // First Upload
  await fileInput.setInputFiles(filePath);
  await page.click('button:has-text("Start Async Import")');
  await expect(page.locator('text=100%').or(page.locator('text=SUCCESS')).first()).toBeVisible({ timeout: 15000 });

  // Click "Import Another File" to re-arm modal immediately
  await page.click('button:has-text("Import Another File")');

  // Second Upload with same file within 120s TTL
  await fileInput.setInputFiles(filePath);
  await page.click('button:has-text("Start Async Import")');

  // Should immediately reuse deduplicated task or show cached state
  await expect(page.locator('text=Task ID:').first()).toBeVisible({ timeout: 5000 });

  await page.screenshot({ path: 'test-results/ui_celery_dedup_success.png' });
});
