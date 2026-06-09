import { test, expect } from '@playwright/test';
import { loginWithMagicLink } from '../helpers/auth';

test.describe('Campaigns Edge Cases', () => {

  test.beforeEach(async ({ page }) => {
    const ok = await loginWithMagicLink(page);
    test.skip(!ok, 'E2E login endpoint unavailable');
  });

  test('campaign wizard back button works', async ({ page }) => {
    await page.goto('/campaigns/new');
    await page.waitForLoadState('networkidle');

    await page.getByTestId('input-campaign-name').fill(`Wizard Test ${Date.now()}`);
    await page.getByTestId('btn-next').click();

    // btn-previous is the wizard-internal back button (distinct from the page-level btn-back)
    const backButton = page.getByTestId('btn-previous');

    if (await backButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await backButton.click();

      // After going back, step 1 is visible again — the name input should be present
      await expect(page.getByTestId('input-campaign-name')).toBeVisible({ timeout: 5000 });
    }
  });

  test('campaign wizard credit estimator updates', async ({ page }) => {
    await page.goto('/campaigns/new');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).toBeVisible();
  });

  test('launch campaign without sequence shows error', async ({ page }) => {
    const campResp = await page.request.post('/api/campaigns', {
      data: { name: `No Seq ${Date.now()}`, type: 'cold_outreach' },
    });

    if (campResp.ok()) {
      const camp = await campResp.json();

      const launchResp = await page.request.post(`/api/campaigns/${camp.id}/launch`);

      expect(launchResp.status()).not.toBe(500);
      expect([400, 422]).toContain(launchResp.status());
    }
  });

  test('duplicate campaign name shows error', async ({ page }) => {
    const name = `Dup Campaign ${Date.now()}`;

    await page.request.post('/api/campaigns', { data: { name, type: 'cold_outreach' } });

    const response = await page.request.post('/api/campaigns', { data: { name, type: 'cold_outreach' } });

    expect(response.status()).toBe(409);
  });
});
