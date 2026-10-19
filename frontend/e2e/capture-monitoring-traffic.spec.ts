import { test, expect } from '@playwright/test';

test('Capture live Prometheus and Grafana traffic monitoring', async ({ page }) => {
  test.skip(!!process.env.CI, 'Skip Prometheus and Grafana screenshot captures in headless CI pipeline');
  // 1. Prometheus Expression Browser
  await page.goto('http://localhost:9090/graph?g0.expr=sum(http_requests_total)&g0.tab=0&g0.stacked=0&g0.show_exemplars=0&g0.range_input=15m');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-results/prometheus_traffic_graph.png', fullPage: true });

  // 2. Grafana Dashboard Login
  await page.goto('http://localhost:3000/login');
  await page.fill('input[placeholder*="email or username"]', 'admin');
  await page.fill('input[type="password"]', 'admin');
  await page.click('button:has-text("Log in")');

  // If prompted to change password, skip
  try {
    const skipBtn = page.locator('button:has-text("Skip"), a:has-text("Skip")');
    await skipBtn.waitFor({ state: 'visible', timeout: 3000 });
    await skipBtn.click();
  } catch {}

  // Wait for session to settle
  await page.waitForTimeout(1500);

  // Navigate to Attendance Observability Dashboard
  await page.goto('http://localhost:3000/d/attendance-prod-metrics/attendance-management-production-observability?orgId=1&refresh=5s');
  await page.waitForTimeout(4000);
  await page.screenshot({ path: 'test-results/grafana_traffic_dashboard.png', fullPage: true });
});
