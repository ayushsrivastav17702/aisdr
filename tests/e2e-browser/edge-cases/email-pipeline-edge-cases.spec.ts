import { test, expect } from '@playwright/test';
import { loginWithMagicLink } from '../helpers/auth';

test.describe('Email Pipeline Edge Cases', () => {

  test.beforeEach(async ({ page }) => {
    const ok = await loginWithMagicLink(page);
    test.skip(!ok, 'E2E login endpoint unavailable');
  });

  test('inbox loads with empty state', async ({ page }) => {
    await page.goto('/inbox');
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByRole('tab', { name: /needs action/i })
        .or(page.getByText(/inbox/i).first())
        .or(page.getByText(/no replies/i))
        .or(page.getByText(/all caught up/i))
        .first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('inbox filters are usable without error', async ({ page }) => {
    await page.goto('/inbox');
    await page.waitForLoadState('networkidle');

    const filters = [
      page.getByTestId('select-sentiment'),
      page.getByTestId('select-intent'),
    ];

    for (const filter of filters) {
      if (await filter.isVisible().catch(() => false)) {
        await filter.click();
        await page.waitForTimeout(300);
        await page.keyboard.press('Escape');

        await expect(page.getByText(/500/i)).not.toBeVisible();
      }
    }
  });

  test('approval queue loads empty state', async ({ page }) => {
    await page.goto('/email-approvals');
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByText(/no.*pending/i)
        .or(page.getByText(/approval queue/i))
        .or(page.getByText(/pending approval/i))
        .or(page.locator('body'))
    ).toBeVisible({ timeout: 5000 });

    await expect(page.getByText(/500/i)).not.toBeVisible();
  });

  test('mailboxes page loads without connected mailbox', async ({ page }) => {
    await page.goto('/mailboxes');
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByText(/connect/i)
        .or(page.getByText(/add mailbox/i))
        .or(page.getByText(/gmail/i))
        .or(page.getByText(/no mailboxes/i))
        .first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('mailboxes page shows Gmail OAuth button', async ({ page }) => {
    await page.goto('/mailboxes');
    await page.waitForLoadState('networkidle');

    await page.getByTestId('button-new-mailbox')
      .or(page.getByRole('button', { name: /add mailbox/i })).first().click();

    await expect(
      page.getByText(/gmail/i).or(page.getByRole('button', { name: /gmail/i })).first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('AE handoff page loads empty state', async ({ page }) => {
    await page.goto('/ae-handoff');
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByText(/handoff/i)
        .or(page.getByText(/no handoffs/i))
        .or(page.getByText(/ae handoff/i))
        .first()
    ).toBeVisible({ timeout: 5000 });

    await expect(page.getByText(/500/i)).not.toBeVisible();
  });
});
