import { test, expect, Page } from '@playwright/test';

async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.fill('input#username', 'admin');
  await page.fill('input#password', 'AdminPass123!');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/.*\/dashboard/);
  await page.waitForLoadState('networkidle');
}

async function loginAsEmployee(page: Page) {
  await page.goto('/login');
  await page.fill('input#username', 'emp001');
  await page.fill('input#password', 'EmpPass123!');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/.*\/dashboard/);
  await page.waitForLoadState('networkidle');
}

test.describe('Complete Live Frontend Features Verification (Chrome)', () => {

  test('1. Admin Full Navigation, Dashboard Metrics, and Health Scores', async ({ page }) => {
    await loginAsAdmin(page);

    // Verify Dashboard Cards
    await expect(page.locator('text=Company Overview & Compliance')).toBeVisible();
    await expect(page.locator('text=Total Active Employees')).toBeVisible();
    await expect(page.getByText('Compliant Weeks', { exact: true })).toBeVisible();
    await expect(page.locator('text=Non-Compliant Weeks')).toBeVisible();
    await expect(page.locator('text=Pending Violations')).toBeVisible();

    // Verify Continuous Compliance Rolling 4-Week Health Score
    await expect(page.locator('text=Continuous Compliance Health Score (Rolling 4-Week History)')).toBeVisible();

    // Verify Employee Attendance Breakdown Table
    await expect(page.locator('text=Employee Attendance Breakdown')).toBeVisible();
    await expect(page.locator('table')).toBeVisible();

    await page.screenshot({ path: 'test-results/live_01_dashboard.png' });
  });

  test('2. Employee Directory, Search Filter, and Add Employee Modal', async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto('/employees');
    await expect(page.locator('h1, h2, h3').filter({ hasText: /Employee/ }).first()).toBeVisible();

    // Test Search input
    const searchInput = page.locator('input[placeholder*="Search"], input[placeholder*="search"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill('Alice');
      await page.waitForTimeout(300);
      await searchInput.fill('');
    }

    // Test Add Employee Modal
    const addEmployeeBtn = page.locator('button:has-text("Add Employee"), button:has-text("New Employee")').first();
    if (await addEmployeeBtn.isVisible()) {
      await addEmployeeBtn.click();
      await expect(page.locator('input#employee_id, input[name="employee_id"], input[placeholder*="EMP"]').first()).toBeVisible({ timeout: 5000 });
      // Close modal
      const cancelBtn = page.locator('button:has-text("Cancel")').first();
      await cancelBtn.click();
    }

    // Test Bulk Upload Modal
    const bulkBtn = page.locator('button:has-text("Bulk Import")').first();
    if (await bulkBtn.isVisible()) {
      await bulkBtn.click();
      await expect(page.locator('text=Async Bulk Employee Import')).toBeVisible();
      await page.click('button:has-text("Cancel")');
    }

    await page.screenshot({ path: 'test-results/live_02_employees.png' });
  });

  test('3. Attendance Console: Calendar, Table View & Date Navigation', async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto('/attendance');
    await expect(page.locator('text=Attendance Console')).toBeVisible();

    // Verify Geofence indicator
    await expect(page.locator('text=/Geofence/')).toBeVisible();

    // Toggle Table View
    const tableBtn = page.locator('button:has-text("Table")');
    if (await tableBtn.isVisible()) {
      await tableBtn.click();
      await expect(page.locator('th:has-text("Office Hours"), th:has-text("Hours")').first()).toBeVisible();
    }

    // Toggle Calendar View
    const calBtn = page.locator('button:has-text("Calendar")');
    if (await calBtn.isVisible()) {
      await calBtn.click();
      await expect(page.locator('text=Sun').first()).toBeVisible();
    }

    await page.screenshot({ path: 'test-results/live_03_attendance.png' });
  });

  test('4. Leaves & Policy Exemptions Workflow', async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto('/leaves');
    await expect(page.locator('text=All Employee Leave Requests')).toBeVisible();
    await expect(page.locator('th:has-text("Employee")')).toBeVisible();

    await page.screenshot({ path: 'test-results/live_04_leaves.png' });
  });

  test('5. Central Compliance Reports & Audit Trail', async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto('/reports');
    await expect(page.locator('text=Central Attendance Reports')).toBeVisible();
    await expect(page.locator('button:has-text("Generate Report")')).toBeVisible();

    // Switch to Audit Trail Tab
    const auditTab = page.locator('button:has-text("Compliance Audit Trail")');
    await expect(auditTab).toBeVisible();
    await auditTab.click();
    await expect(page.locator('text=Immutable Compliance & Audit Trail')).toBeVisible();

    await page.screenshot({ path: 'test-results/live_05_reports.png' });
  });

  test('6. Policy Violations Dashboard & Breach Classifications', async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto('/violations');
    await expect(page.locator('text=Policy Violations & Notifications')).toBeVisible();
    await expect(page.locator('button:has-text("Evaluate Violations")')).toBeVisible();
    await expect(page.locator('button:has-text("Dispatch Email Alerts")')).toBeVisible();

    await page.screenshot({ path: 'test-results/live_06_violations.png' });
  });

  test('7. Multi-Tenant Organization Switcher & Partition Provisioning', async ({ page }) => {
    await loginAsAdmin(page);

    // Click tenant switcher
    const switcher = page.locator('button').filter({ hasText: /Global \/ Default|Org:|Test Corp/ }).first();
    await expect(switcher).toBeVisible();
    await switcher.click();

    // Verify dropdown items
    await expect(page.locator('text=Tenant Partition')).toBeVisible();
    await expect(page.locator('text=Provision New Tenant')).toBeVisible();

    await page.screenshot({ path: 'test-results/live_07_tenants.png' });
  });

  test('8. AI Compliance Assistant Widget Drawer', async ({ page }) => {
    await loginAsAdmin(page);

    // Find and open AI Assistant button
    const aiBtn = page.locator('button:has-text("AI Assistant"), button[title*="AI Assistant"]').first();
    await expect(aiBtn).toBeVisible();
    await aiBtn.click();

    // Verify Assistant HUD modal opened with heading and textbox
    await expect(page.locator('h3:has-text("Attendance AI")')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('input[placeholder*="Ask or command"]').first()).toBeVisible({ timeout: 5000 });

    await page.screenshot({ path: 'test-results/live_08_ai_assistant.png' });
  });

  test('9. Employee RBAC Lockdown View', async ({ page }) => {
    await loginAsEmployee(page);

    // Verify admin-only routes are hidden from employee navigation sidebar
    await expect(page.locator('a[href="/employees"]')).not.toBeVisible();
    await expect(page.locator('a[href="/violations"]')).not.toBeVisible();

    // Verify employee-specific navigation is visible
    await expect(page.locator('a[href="/attendance"]').first()).toBeVisible();
    await expect(page.locator('a[href="/leaves"]').first()).toBeVisible();
    await expect(page.locator('a[href="/reports"]').first()).toBeVisible();
    await expect(page.locator('text=My Attendance Report')).toBeVisible();

    await page.screenshot({ path: 'test-results/live_09_employee_rbac.png' });
  });

});
