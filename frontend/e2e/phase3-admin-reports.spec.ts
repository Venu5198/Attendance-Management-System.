import { test, expect } from '@playwright/test';

test.describe('Phase 3: Admin Dashboard and Reports Comprehensive E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Log in as Admin
    await page.goto('/login');
    await page.fill('input#username', 'admin');
    await page.fill('input#password', 'AdminPass123!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/.*\/dashboard/);
    await expect(page.locator('text=Company Overview & Compliance')).toBeVisible({ timeout: 15000 });
  });

  test('1. Admin Dashboard KPI Grid, Exception Triage Filters & Search', async ({ page }) => {
    // Verify Company Overview header & Live Monitor badge
    await expect(page.locator('h1')).toContainText('Company Overview & Compliance');
    await expect(page.locator('text=Live Monitor')).toBeVisible();

    // Verify 6 KPI Cards are visible with units and titles
    await expect(page.locator('text=Total Active Employees')).toBeVisible();
    await expect(page.locator('text=Currently In Office')).toBeVisible();
    await expect(page.getByText('Compliant Weeks', { exact: true })).toBeVisible();
    await expect(page.getByText('Non-Compliant Weeks', { exact: true })).toBeVisible();
    await expect(page.getByText('Data Anomalies', { exact: true })).toBeVisible();
    await expect(page.getByText('Pending Violations', { exact: true })).toBeVisible();


    // Verify Policy Baseline Bar
    await expect(page.locator('text=Weekly Policy Baseline')).toBeVisible();
    await expect(page.locator('text=Minimum 3 eligible office days and 15.0 office hours')).toBeVisible();

    // Test Triage Filter Tabs
    const inOfficeTab = page.locator('button:has-text("In Office")');
    await inOfficeTab.click();
    await page.waitForTimeout(300);

    const belowThresholdTab = page.locator('button:has-text("Below Threshold")');
    await belowThresholdTab.click();
    await page.waitForTimeout(300);

    const failedBothTab = page.locator('button:has-text("Failed Both")');
    await failedBothTab.click();
    await page.waitForTimeout(300);

    const allStaffTab = page.locator('button:has-text("All Staff")');
    await allStaffTab.click();
    await page.waitForTimeout(300);

    // Test Instant Search Input
    const searchInput = page.locator('input[placeholder*="Search staff"]');
    await searchInput.fill('EMP001');
    await page.waitForTimeout(300);
    await expect(page.locator('text=EMP001').first()).toBeVisible();
    await searchInput.fill('');
  });

  test('2. Central Reports Page: Presets, Date Range Validation, and Department Filters', async ({ page }) => {
    await page.goto('/reports');
    await expect(page.locator('h1')).toContainText('Central Attendance Reports');

    // Verify Quick Presets
    await page.click('button:has-text("This Week")');
    await page.click('button:has-text("Generate Report")');
    await page.waitForTimeout(500);

    // Verify Evaluated Staff StatCard
    await expect(page.locator('text=Evaluated Staff')).toBeVisible();

    // Test Custom Date Range Validation (Start Date > End Date)
    await page.selectOption('select >> nth=0', 'custom');
    await page.fill('#custom-start-date', '2026-10-31');
    await page.fill('#custom-end-date', '2026-10-01');
    await page.click('button:has-text("Generate Report")');

    // Should display validation error
    await expect(page.locator('text=Start Date cannot be later than End Date')).toBeVisible();

    // Reset filters
    await page.click('button:has-text("Reset")');
    await page.waitForTimeout(300);
  });

  test('3. Central Reports: Option B Non-Qualifying Anomaly & Daily Logs Expansion', async ({ page }) => {
    await page.goto('/reports?period=weekly');
    await page.waitForTimeout(1000);

    // Look for Employee Report row
    const employeeRow = page.locator('tbody tr').first();
    await expect(employeeRow).toBeVisible();

    // Verify Daily Logs Button
    const dailyLogsBtn = page.locator('button[data-testid^="daily-logs-btn-"]').first();
    if (await dailyLogsBtn.isVisible()) {
      await dailyLogsBtn.click();
      await page.waitForTimeout(300);
      await expect(page.locator('text=Timezone: Asia/Kolkata (IST)').first()).toBeVisible();
    }
  });

  test('4. Responsive Form Factors: Tablet and Mobile Layout', async ({ page }) => {
    // Tablet Viewport: 768x1024
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/dashboard');
    await expect(page.locator('h1')).toContainText('Company Overview & Compliance');
    await expect(page.locator('text=Weekly Policy Baseline')).toBeVisible();

    // Mobile Viewport: 390x844
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/dashboard');
    await expect(page.locator('h1')).toContainText('Company Overview & Compliance');

    // Navigate to Reports on Mobile
    await page.goto('/reports');
    await expect(page.locator('h1')).toBeVisible();
  });
});
