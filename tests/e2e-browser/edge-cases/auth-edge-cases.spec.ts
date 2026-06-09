import { test, expect } from '@playwright/test';

test.describe('Authentication Edge Cases', () => {

  test('unauthenticated user redirected to login', async ({ page }) => {
    await page.goto('/campaigns');
    await expect(page).toHaveURL(/\/login/);
  });

  test('unauthenticated user cannot access any protected route', async ({ page }) => {
    const protectedRoutes = [
      '/campaigns',
      '/sequences',
      '/prospects',
      '/inbox',
      '/analytics',
      '/mailboxes',
      '/ae-handoff',
      '/ai-prospecting',
    ];

    for (const route of protectedRoutes) {
      await page.goto(route);
      await page.waitForURL(/\/login/, { timeout: 10000 });
      await expect(page).toHaveURL(/\/login/);
    }
  });

  test('login page shows email input', async ({ page }) => {
    await page.goto('/login');
    await expect(
      page.getByPlaceholder(/email/i).or(page.getByLabel(/email/i))
    ).toBeVisible();
  });

  test('login with unknown email shows generic error message', async ({ page }) => {
    await page.goto('/login');

    await page.getByPlaceholder(/email/i).or(page.getByLabel(/email/i))
      .fill('definitely-not-registered@nowhere.com');
    await page.getByLabel(/password/i).or(page.getByPlaceholder(/password/i)).fill('wrongpassword123');

    await page.getByTestId('button-login').or(page.getByRole('button', { name: /log ?in|sign in/i })).click();

    // Should show a generic error — either invalid credentials or rate-limit message
    await expect(
      page.getByText(/invalid email or password/i)
        .or(page.getByText(/invalid credentials/i))
        .or(page.getByText(/too many/i))
        .or(page.getByText(/try again/i))
        .first()
    ).toBeVisible({ timeout: 5000 });

    // Should NOT reveal whether the account exists
    await expect(
      page.getByText(/not found/i)
        .or(page.getByText(/no account/i))
        .or(page.getByText(/does not exist/i))
    ).not.toBeVisible();
  });

  test('expired session redirects to login', async ({ page }) => {
    await page.context().addCookies([{
      name: 'auth_token',
      value: 'expired.invalid.token',
      domain: 'localhost',
      path: '/',
    }]);

    await page.goto('/campaigns');

    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });

  test('login page has no console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    const realErrors = errors.filter(e =>
      !e.includes('favicon') && !e.includes('404')
    );
    expect(realErrors).toHaveLength(0);
  });

  test('super admin login separate from user login', async ({ page }) => {
    await page.goto('/super-admin/login');

    await expect(page).toHaveURL(/\/super-admin\/login/);
  });

  test('super admin dashboard redirects without auth', async ({ page }) => {
    await page.goto('/super-admin');
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });
});
