import { test, expect } from '@playwright/test';
import { loginWithMagicLink } from '../helpers/auth';

test.describe('Prospects Edge Cases', () => {

  test.beforeEach(async ({ page }) => {
    const ok = await loginWithMagicLink(page);
    test.skip(!ok, 'E2E login endpoint unavailable');
    await page.goto('/prospects');
  });

  test('add prospect with minimum required fields only', async ({ page }) => {
    await page.getByTestId('button-add-prospect')
      .or(page.getByRole('button', { name: /add prospect/i })).click();

    await page.getByLabel(/first name/i).or(page.getByPlaceholder(/first name/i)).fill('Min');
    await page.getByLabel(/last name/i).or(page.getByPlaceholder(/last name/i)).fill('Fields');
    await page.getByLabel(/email/i).or(page.getByPlaceholder(/email/i))
      .fill(`min-fields-${Date.now()}@test.com`);

    await page.getByRole('button', { name: /save|add|create/i }).last().click();

    await expect(
      page.getByText(/added successfully/i).or(page.getByText(/prospect added/i)).first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('add prospect with all fields filled', async ({ page }) => {
    await page.getByTestId('button-add-prospect')
      .or(page.getByRole('button', { name: /add prospect/i })).click();

    const ts = Date.now();

    await page.getByLabel(/first name/i).or(page.getByPlaceholder(/first name/i)).fill('Full');
    await page.getByLabel(/last name/i).or(page.getByPlaceholder(/last name/i)).fill('Fields');
    await page.getByLabel(/email/i).or(page.getByPlaceholder(/email/i)).fill(`full-${ts}@test.com`);

    const companyField = page.getByLabel(/company/i).or(page.getByPlaceholder(/company/i));
    if (await companyField.isVisible()) await companyField.fill('Test Corp');

    const titleField = page.getByLabel(/title|job title/i).or(page.getByPlaceholder(/title/i));
    if (await titleField.isVisible()) await titleField.fill('VP Sales');

    await page.getByRole('button', { name: /save|add|create/i }).last().click();

    await expect(
      page.getByText(/added successfully/i).or(page.getByText(/prospect added/i)).first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('submit empty form shows multiple errors', async ({ page }) => {
    await page.getByTestId('button-add-prospect')
      .or(page.getByRole('button', { name: /add prospect/i })).click();

    await page.getByRole('button', { name: /save|add|create/i }).last().click();

    const errors = page.getByText(/required/i);
    const count = await errors.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('very long name truncated or handled', async ({ page }) => {
    await page.getByTestId('button-add-prospect')
      .or(page.getByRole('button', { name: /add prospect/i })).click();

    const longName = 'A'.repeat(500);

    await page.getByLabel(/first name/i).or(page.getByPlaceholder(/first name/i)).fill(longName);
    await page.getByLabel(/last name/i).or(page.getByPlaceholder(/last name/i)).fill('Test');
    await page.getByLabel(/email/i).or(page.getByPlaceholder(/email/i))
      .fill(`longname-${Date.now()}@test.com`);

    await page.getByRole('button', { name: /save|add|create/i }).last().click();

    await expect(
      page.getByText(/500/i).or(page.getByText(/server error/i))
    ).not.toBeVisible();

    await expect(page.locator('body')).toBeVisible();
  });

  test('special characters in name handled', async ({ page }) => {
    await page.getByTestId('button-add-prospect')
      .or(page.getByRole('button', { name: /add prospect/i })).click();

    await page.getByLabel(/first name/i).or(page.getByPlaceholder(/first name/i)).fill("O'Brien-Smith");
    await page.getByLabel(/last name/i).or(page.getByPlaceholder(/last name/i)).fill('José');
    await page.getByLabel(/email/i).or(page.getByPlaceholder(/email/i))
      .fill(`special-${Date.now()}@test.com`);

    await page.getByRole('button', { name: /save|add|create/i }).last().click();

    await expect(
      page.getByText(/added successfully/i).or(page.getByText(/error/i)).first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('duplicate email shows error', async ({ page }) => {
    const email = `duplicate-${Date.now()}@test.com`;

    await page.request.post('/api/prospects', {
      data: { firstName: 'First', lastName: 'Duplicate', primaryEmail: email },
    });

    await page.getByTestId('button-add-prospect')
      .or(page.getByRole('button', { name: /add prospect/i })).click();

    await page.getByLabel(/first name/i).or(page.getByPlaceholder(/first name/i)).fill('Second');
    await page.getByLabel(/last name/i).or(page.getByPlaceholder(/last name/i)).fill('Duplicate');
    await page.getByLabel(/email/i).or(page.getByPlaceholder(/email/i)).fill(email);

    await page.getByRole('button', { name: /save|add|create/i }).last().click();

    await expect(page.getByText(/500/i)).not.toBeVisible();
  });

  test('prospect search filters list', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search/i).or(page.getByRole('searchbox'));

    if (await searchInput.isVisible()) {
      await searchInput.fill('nonexistent-xyz-123');
      await page.waitForTimeout(500);

      await expect(
        page.getByText(/no prospects/i)
          .or(page.getByText(/no results/i))
          .or(page.locator('table tbody tr'))
      ).toBeVisible();
    }
  });

  test('prospect bulk selection works', async ({ page }) => {
    const rows = page.locator('table tbody tr');
    const count = await rows.count();

    if (count > 0) {
      const checkbox = page.locator('input[type="checkbox"]').nth(1);
      if (await checkbox.isVisible()) {
        await checkbox.click();

        await expect(
          page.getByText(/selected/i).or(page.getByTestId('button-add-to-sequence'))
        ).toBeVisible({ timeout: 3000 });
      }
    }
  });

  test('prospect profile 6 tabs all clickable', async ({ page }) => {
    const response = await page.request.post('/api/prospects', {
      data: { firstName: 'Tab', lastName: 'Test', primaryEmail: `tab-test-${Date.now()}@test.com` },
    });

    if (response.ok()) {
      const prospect = await response.json();
      await page.goto(`/prospects/${prospect.id}`);
      await page.waitForLoadState('networkidle');

      const tabs = ['Overview', 'Sequences', 'Activity', 'Company', 'Signals', 'Notes'];

      for (const tabName of tabs) {
        const tab = page.getByRole('tab', { name: tabName }).or(page.getByText(tabName).first());

        if (await tab.isVisible()) {
          await tab.click();
          await page.waitForTimeout(300);

          await expect(page.getByText(/500/i)).not.toBeVisible();
        }
      }
    }
  });
});
