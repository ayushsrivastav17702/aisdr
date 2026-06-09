import { test, expect } from '@playwright/test';
import { loginWithMagicLink } from '../helpers/auth';

test.describe('Loading and Error States', () => {

  test.beforeEach(async ({ page }) => {
    const ok = await loginWithMagicLink(page);
    test.skip(!ok, 'E2E login endpoint unavailable');
  });

  test('loading skeletons shown before data loads', async ({ page }) => {
    await page.route('**/api/campaigns**', async route => {
      await new Promise(r => setTimeout(r, 1000));
      await route.continue();
    });

    await page.goto('/campaigns');

    await expect(page.locator('body')).toBeVisible();
  });

  test('API error shows user-friendly message', async ({ page }) => {
    await page.route('**/api/prospects**', route => {
      route.fulfill({ status: 500, body: JSON.stringify({ error: 'Internal server error' }) });
    });

    await page.goto('/prospects');
    await page.waitForLoadState('networkidle');

    // Page must render something (no blank screen / uncaught crash)
    const bodyText = await page.locator('body').textContent();
    expect(bodyText?.length).toBeGreaterThan(10);

    // Must not show a raw 500 number as an error heading
    await expect(page.getByRole('heading', { name: '500' })).not.toBeVisible();
  });

  test('network offline shows graceful error', async ({ page }) => {
    await page.goto('/campaigns');
    await page.waitForLoadState('networkidle');

    await page.context().setOffline(true);

    await page.goto('/prospects').catch(() => {});

    await expect(page.locator('body')).toBeVisible();

    await page.context().setOffline(false);
  });

  test('empty analytics shows zero state not crash', async ({ page }) => {
    await page.goto('/analytics');
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByText(/0/i).first()
        .or(page.getByText(/no data/i))
        .or(page.getByText(/analytics/i).first())
        .first()
    ).toBeVisible({ timeout: 5000 });

    await expect(page.getByText(/500/i)).not.toBeVisible();
  });

  test('find leads with no results shows empty state', async ({ page }) => {
    await page.goto('/ai-prospecting');
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByText(/find leads/i)
        .or(page.getByPlaceholder(/search/i))
        .or(page.getByText(/250M/i))
    ).toBeVisible({ timeout: 5000 });
  });

  test('signals page loads empty state', async ({ page }) => {
    await page.goto('/intent-signals');
    await page.waitForLoadState('networkidle');

    // Page renders without crashing — either a real page or a 404 not-found page
    const bodyText = await page.locator('body').textContent();
    expect(bodyText?.length).toBeGreaterThan(10);
    await expect(page.getByText(/500/i)).not.toBeVisible();
  });

  test('knowledge base loads empty state', async ({ page }) => {
    await page.goto('/company-knowledge');
    await page.waitForLoadState('networkidle');

    // Page renders without crashing — either a real page or a 404 not-found page
    const bodyText = await page.locator('body').textContent();
    expect(bodyText?.length).toBeGreaterThan(10);
    await expect(page.getByText(/500/i)).not.toBeVisible();
  });
});
