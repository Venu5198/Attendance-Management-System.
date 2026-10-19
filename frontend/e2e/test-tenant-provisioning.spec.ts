import { test, expect } from '@playwright/test';

test('Provisioning a new tenant organization via UI modal in Chrome', async ({ page }) => {
  const runId = Date.now().toString().slice(-4);
  const tenantName = `Test Corp ${runId}`;
  const tenantSlug = `test-corp-${runId}`;

  // 1. Login as Admin
  await page.goto('/login');
  await page.fill('input#username', 'admin');
  await page.fill('input#password', 'AdminPass123!');
  await page.click('button[type="submit"]');

  await expect(page).toHaveURL(/.*\/dashboard/);

  // 2. Click the Tenant Switcher in the navbar
  const tenantSwitcherBtn = page.locator('button').filter({ hasText: /Global \/ Default|Org:/ }).first();
  await expect(tenantSwitcherBtn).toBeVisible();
  await tenantSwitcherBtn.click();

  // 3. Click "Provision New Tenant"
  const provisionBtn = page.locator('button:has-text("Provision New Tenant")');
  await expect(provisionBtn).toBeVisible();
  await provisionBtn.click();

  // 4. Fill in "Company / Organization Name"
  const nameInput = page.locator('input[placeholder="e.g. Acme Corporation"]');
  await expect(nameInput).toBeVisible();
  await nameInput.fill(tenantName);

  // 5. Verify auto-derived slug
  const slugInput = page.locator('input[placeholder="e.g. acme-corporation"]');
  await expect(slugInput).toHaveValue(tenantSlug);

  // 6. Click "Provision Partition"
  const submitBtn = page.locator('button[type="submit"]:has-text("Provision Partition")');
  await submitBtn.click();

  // 7. Verify page switches to the newly provisioned tenant
  await page.waitForLoadState('networkidle');
  const activeTenantPill = page.locator('button').filter({ hasText: new RegExp(tenantName + '|' + tenantSlug) }).first();
  await expect(activeTenantPill).toBeVisible({ timeout: 10000 });

  // 8. Capture proof screenshot
  await page.screenshot({ path: 'test-results/tenant_created_successfully.png' });
});
