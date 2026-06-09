import { test, expect } from '@playwright/test';
import { loginWithMagicLink } from '../helpers/auth';

test.describe('Manage AI Edge Cases', () => {

  test.beforeEach(async ({ page }) => {
    const ok = await loginWithMagicLink(page);
    test.skip(!ok, 'E2E login endpoint unavailable');
    await page.goto('/ai-prospecting');
    await page.waitForLoadState('networkidle');
  });

  test('search tab loads without error', async ({ page }) => {
    await page.getByTestId('tab-search').or(page.getByRole('tab', { name: /search/i })).click();

    await page.waitForTimeout(500);

    await expect(page.getByText(/500/i)).not.toBeVisible();
    await expect(page.locator('body')).toBeVisible();
  });

  test('history tab loads without error', async ({ page }) => {
    await page.getByTestId('tab-history').or(page.getByRole('tab', { name: /history/i })).click();

    await page.waitForTimeout(500);

    await expect(page.getByText(/500/i)).not.toBeVisible();
  });

  test('usage tab loads without error', async ({ page }) => {
    await page.getByTestId('tab-usage').or(page.getByRole('tab', { name: /usage/i })).click();

    await page.waitForTimeout(500);

    await expect(page.getByText(/500/i)).not.toBeVisible();
  });

  test('settings tab loads without error', async ({ page }) => {
    await page.getByTestId('tab-settings').or(page.getByRole('tab', { name: /settings/i })).click();

    await page.waitForTimeout(500);

    await expect(page.getByText(/500/i)).not.toBeVisible();
    await expect(page.locator('body')).toBeVisible();
  });
});
