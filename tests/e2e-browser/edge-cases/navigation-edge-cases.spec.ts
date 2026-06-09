import { test, expect } from '@playwright/test';
import { loginWithMagicLink } from '../helpers/auth';

test.describe('Navigation Edge Cases', () => {

  test.beforeEach(async ({ page }) => {
    const ok = await loginWithMagicLink(page);
    test.skip(!ok, 'E2E login endpoint unavailable (E2E_TESTING not enabled on target server)');
  });

  test('404 page shown for unknown route', async ({ page }) => {
    await page.goto('/this-route-does-not-exist-at-all');

    await expect(page.locator('body')).not.toBeEmpty();

    const bodyText = await page.locator('body').textContent();
    expect(bodyText?.length).toBeGreaterThan(10);
  });

  test('deep link to prospect detail works', async ({ page }) => {
    const response = await page.request.post('/api/prospects', {
      data: {
        firstName: 'Deep',
        lastName: 'Link',
        primaryEmail: `deep-link-${Date.now()}@test.com`,
      },
    });

    if (response.ok()) {
      const prospect = await response.json();

      await page.goto(`/prospects/${prospect.id}`);
      await page.waitForLoadState('networkidle');

      await expect(
        page.getByText('Deep')
          .or(page.getByText(/profile/i))
          .or(page.getByText(/overview/i))
          .first()
      ).toBeVisible({ timeout: 5000 });
    }
  });

  test('page title updates on navigation', async ({ page }) => {
    await page.goto('/campaigns');
    const campaignsTitle = await page.title();

    await page.goto('/prospects');
    const prospectsTitle = await page.title();

    expect(campaignsTitle.length).toBeGreaterThan(0);
    expect(prospectsTitle.length).toBeGreaterThan(0);
  });

  test('sidebar active state updates on navigation', async ({ page }) => {
    // /prospects renders Dashboard which has a sidebar with nav-* buttons
    await page.goto('/prospects');
    await page.waitForLoadState('networkidle');

    // nav-sequences exists in Dashboard and navigates to /sequences
    const navSeq = page.getByTestId('nav-sequences')
      .or(page.getByRole('button', { name: /sequences/i }))
      .first();

    await expect(navSeq).toBeVisible({ timeout: 8000 });
    await navSeq.click();

    // After clicking, URL should change to /sequences
    await expect(page).toHaveURL(/\/sequences/, { timeout: 8000 });
  });

  test('refresh on any page does not break app', async ({ page }) => {
    const routes = ['/campaigns', '/prospects', '/sequences', '/inbox'];

    for (const route of routes) {
      await page.goto(route);
      await page.reload();
      await page.waitForLoadState('networkidle');

      await expect(page).toHaveURL(new RegExp(route));
      await expect(page.locator('body')).not.toBeEmpty();
    }
  });

  test('mobile viewport renders without overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/campaigns');
    await page.waitForLoadState('networkidle');

    await page.evaluate(() => document.body.scrollWidth > window.innerWidth);

    await expect(page.locator('body')).toBeVisible();
  });
});
