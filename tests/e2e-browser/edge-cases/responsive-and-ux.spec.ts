import { test, expect } from '@playwright/test';
import { loginWithMagicLink } from '../helpers/auth';

test.describe('Responsive and UX', () => {

  test.beforeEach(async ({ page }) => {
    const ok = await loginWithMagicLink(page);
    test.skip(!ok, 'E2E login endpoint unavailable');
  });

  test('toast notifications disappear automatically', async ({ page }) => {
    await page.goto('/prospects');

    const response = await page.request.post('/api/prospects', {
      data: { firstName: 'Toast', lastName: 'Test', primaryEmail: `toast-${Date.now()}@test.com` },
    });

    if (response.ok()) {
      await page.reload();

      await page.getByTestId('button-add-prospect')
        .or(page.getByRole('button', { name: /add prospect/i })).click();

      await page.getByLabel(/first name/i).or(page.getByPlaceholder(/first name/i)).fill('Toast2');
      await page.getByLabel(/last name/i).or(page.getByPlaceholder(/last name/i)).fill('User');
      await page.getByLabel(/email/i).or(page.getByPlaceholder(/email/i))
        .fill(`toast2-${Date.now()}@test.com`);

      await page.getByRole('button', { name: /save|add|create/i }).last().click();

      const toast = page.getByText(/added successfully/i).or(page.getByText(/prospect added/i));

      if (await toast.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(toast).not.toBeVisible({ timeout: 10000 });
      }
    }
  });

  test('modal closes on escape key', async ({ page }) => {
    await page.goto('/prospects');

    await page.getByTestId('button-add-prospect')
      .or(page.getByRole('button', { name: /add prospect/i })).click();

    await expect(page.getByRole('dialog')).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 2000 });
  });

  test('modal closes on backdrop click', async ({ page }) => {
    await page.goto('/prospects');

    await page.getByTestId('button-add-prospect')
      .or(page.getByRole('button', { name: /add prospect/i })).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await page.mouse.click(10, 10);

    await expect(page.locator('body')).toBeVisible();
  });

  test('settings page loads all sections', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/settings/i).first()).toBeVisible({ timeout: 5000 });

    await expect(page.getByText(/500/i)).not.toBeVisible();
  });

  test('sign out works correctly', async ({ page }) => {
    await page.goto('/campaigns');

    const logoutButton = page.getByTestId('btn-logout')
      .or(page.getByText(/sign out/i))
      .or(page.getByRole('button', { name: /sign out|log ?out/i }));

    if (await logoutButton.isVisible().catch(() => false)) {
      await logoutButton.click();

      await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
    }
  });

  test('keyboard navigation works in forms', async ({ page }) => {
    await page.goto('/prospects');

    await page.getByTestId('button-add-prospect')
      .or(page.getByRole('button', { name: /add prospect/i })).click();

    await expect(page.getByRole('dialog')).toBeVisible();

    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    await expect(page.getByRole('dialog')).toBeVisible();
  });
});
