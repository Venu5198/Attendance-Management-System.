import { test, expect } from '@playwright/test';

test.describe('End-to-End Attendance Management Platform Tests', () => {
  test('redirects unauthenticated visit to /login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/.*\/login/);
    await expect(page.locator('input#username')).toBeVisible();
    await expect(page.locator('input#password')).toBeVisible();
  });

  test('displays error alert on invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input#username', 'invalid_user');
    await page.fill('input#password', 'WrongPassword123!');
    await page.click('button[type="submit"]');

    const alert = page.locator('text=/Invalid (username or password|credentials)/');
    await expect(alert).toBeVisible();
  });

  test('admin login, dashboard metrics, and navigation flows', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input#username', 'admin');
    await page.fill('input#password', 'AdminPass123!');
    await page.click('button[type="submit"]');

    // Wait for redirection to dashboard and company overview heading
    await expect(page).toHaveURL(/.*\/dashboard/);
    await expect(page.locator('text=Company Overview & Compliance')).toBeVisible({ timeout: 15000 });

    // Verify admin navigation items
    await expect(page.locator('a[href="/employees"]').first()).toBeVisible();
    await expect(page.locator('a[href="/reports"]').first()).toBeVisible();
    await expect(page.locator('a[href="/violations"]').first()).toBeVisible();

    // Navigate to Employees page
    await page.locator('a[href="/employees"]').first().click();
    await expect(page).toHaveURL(/.*\/employees/);

    // Navigate to Reports page
    await page.locator('a[href="/reports"]').first().click();
    await expect(page).toHaveURL(/.*\/reports/);

    // Logout
    const logoutBtn = page.locator('button').filter({ hasText: 'Logout' });
    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
      await expect(page).toHaveURL(/.*\/login/);
    }
  });

  test('employee login, dashboard view, and role restriction', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input#username', 'emp001');
    await page.fill('input#password', 'EmpPass123!');
    await page.click('button[type="submit"]');

    // Wait for dashboard and employee greeting
    await expect(page).toHaveURL(/.*\/dashboard/);
    await expect(page.locator('text=Welcome back, emp001!')).toBeVisible({ timeout: 15000 });

    // Employee should see punch actions (Check In, Checked In, or Check Out)
    const punchButton = page.locator('button').filter({ hasText: /Check In|Checked In|Check Out/ });
    await expect(punchButton.first()).toBeVisible();

    // Restricted admin routes should not be in sidebar
    const adminLink = page.locator('a[href="/employees"]');
    await expect(adminLink).not.toBeVisible();

    // Direct URL access to /employees redirects away
    await page.goto('/employees');
    await expect(page).not.toHaveURL(/.*\/employees/);
  });
});
