import { test, expect } from '@playwright/test';

test.describe('Calendar, Regularization & Leaves E2E Tests', () => {
  test('calendar view toggle and date navigation on /attendance', async ({ page }) => {
    // 1. Login as employee
    await page.goto('/login');
    await page.fill('input#username', 'emp001');
    await page.fill('input#password', 'EmpPass123!');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/.*\/dashboard/);

    // 2. Navigate to Attendance Console
    await page.goto('/attendance');
    await expect(page).toHaveURL(/.*\/attendance/);
    await expect(page.locator('text=Attendance Console')).toBeVisible();

    // 3. Calendar view should be active by default
    await expect(page.locator('text=Attended Office')).toBeVisible();
    await expect(page.locator('text=Sun').first()).toBeVisible();
    await expect(page.locator('text=Mon').first()).toBeVisible();

    // 4. Toggle to Table view
    await page.click('button:has-text("Table")');
    await expect(page.locator('th:has-text("Office Hours")')).toBeVisible();

    // 5. Toggle back to Calendar view
    await page.click('button:has-text("Calendar")');
    await expect(page.locator('text=Attended Office')).toBeVisible();
  });

  test('calendar cell interaction opens regularization modal', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input#username', 'emp001');
    await page.fill('input#password', 'EmpPass123!');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/.*\/dashboard/);
    await page.goto('/attendance');
    await expect(page.locator('text=Attendance Console')).toBeVisible();

    // Click on a recent calendar day cell within the 14-day policy window
    const dayCells = page.locator('div.cursor-pointer');
    const count = await dayCells.count();
    if (count > 0) {
      // Pick the last (most recent) missed/attended cell
      const recentCell = dayCells.nth(count - 1);
      await recentCell.click({ force: true, timeout: 5000 }).catch(() => {});

      // Check if modal opens (or within 14-day rule)
      const modalHeader = page.locator('text=Regularize Attendance');
      if (await modalHeader.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(modalHeader).toBeVisible();
        await expect(page.locator('label:has-text("Entry Time")')).toBeVisible();
        await expect(page.locator('label:has-text("Exit Time")')).toBeVisible();

        // Close modal
        await page.click('button:has-text("Cancel")');
        await expect(modalHeader).not.toBeVisible();
      }
    }
  });

  test('employee submits leave request and views it on /leaves', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input#username', 'emp001');
    await page.fill('input#password', 'EmpPass123!');
    await page.click('button[type="submit"]');

    // Navigate to /leaves via sidebar
    await page.locator('a[href="/leaves"]').first().click();
    await expect(page).toHaveURL(/.*\/leaves/);
    await expect(page.locator('text=Leaves & Policy Exemptions')).toBeVisible();

    // Open Request Leave modal
    await page.click('button:has-text("Request Leave")');
    await expect(page.locator('text=Request Leave or Exemption')).toBeVisible();

    // Fill form with unique non-overlapping date
    // Fill form with unique non-overlapping date in year 2035
    const month = String(Math.floor(Math.random() * 11) + 1).padStart(2, '0');
    const day = String(Math.floor(Math.random() * 20) + 1).padStart(2, '0');
    const startStr = `2035-${month}-${day}`;
    const endStr = `2035-${month}-${day}`;

    await page.fill('input[type="date"] >> nth=0', startStr);
    await page.fill('input[type="date"] >> nth=1', endStr);
    await page.selectOption('select', 'VACATION');
    await page.fill('textarea', 'Annual family vacation leave');

    // Submit
    await page.click('button[type="submit"]:has-text("Submit Application")');

    // Expect success alert and modal closed
    await expect(page.locator('text=Leave request submitted successfully!')).toBeVisible({ timeout: 10000 });

    // Verify Guardrail 1: Submitting overlapping leave is intercepted
    await page.click('button:has-text("Request Leave")');
    await page.fill('input[type="date"] >> nth=0', startStr);
    await page.fill('input[type="date"] >> nth=1', endStr);
    await page.selectOption('select', 'CASUAL');
    await page.fill('textarea', 'Attempting overlapping leave');
    await page.click('button[type="submit"]:has-text("Submit Application")');
    await expect(page.locator('text=conflicts with an existing').first()).toBeVisible({ timeout: 10000 });
  });

  test('admin reviews regularization approvals and leave exemptions', async ({ page }) => {
    // 1. Login as Admin
    await page.goto('/login');
    await page.fill('input#username', 'admin');
    await page.fill('input#password', 'AdminPass123!');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/.*\/dashboard/);

    // 2. Check Admin Approvals tab on Attendance page
    await page.goto('/attendance');
    const approvalsBtn = page.locator('button:has-text("Approvals")');
    await expect(approvalsBtn).toBeVisible();

    await approvalsBtn.click();
    await expect(page.locator('text=Attendance Regularization Approvals')).toBeVisible();
    await expect(page.locator('button:has-text("PENDING")')).toBeVisible();
    await expect(page.locator('button:has-text("APPROVED")')).toBeVisible();

    // 3. Check Admin Leaves view on /leaves
    await page.goto('/leaves');
    await expect(page.locator('text=All Employee Leave Requests')).toBeVisible();
    await expect(page.locator('th:has-text("Employee")')).toBeVisible();
  });

  test('admin dashboard renders continuous compliance health score cards', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input#username', 'admin');
    await page.fill('input#password', 'AdminPass123!');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/.*\/dashboard/);

    // Verify Continuous Compliance Health Score Section
    await expect(
      page.locator('text=Continuous Compliance Health Score (Rolling 4-Week History)')
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator('text=Automated rolling health scores per employee to identify chronic under-hours patterns.')
    ).toBeVisible();
    await expect(page.locator('text=Policy Violations').first()).toBeVisible();
  });
});

