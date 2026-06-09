import { Page } from '@playwright/test';

/**
 * Logs in a Playwright `page` as a dedicated E2E test user.
 *
 * The product's real login is magic-link/OAuth based (no password form to
 * drive reliably in CI), so when E2E_TESTING=true the server exposes a
 * test-only POST /api/test/e2e-login endpoint (see server/routes/auth.routes.ts)
 * that creates/reuses a fixed E2E test user + org and sets the same
 * `auth_token` cookie the real flows use. This keeps the rest of the app
 * (RBAC, org-scoping, etc.) behaving exactly as it would for a real session.
 *
 * Falls back to walking the magic-link UI if the endpoint isn't available
 * (e.g. when running against a production target where E2E_TESTING is unset —
 * in that case callers should test.skip()).
 */
export const E2E_TEST_EMAIL = 'e2e-test@playwright.local';

export async function loginWithMagicLink(page: Page, email = E2E_TEST_EMAIL): Promise<boolean> {
  const resp = await page.request.post('/api/test/e2e-login', { data: { email } });

  if (resp.ok()) {
    const body = await resp.json().catch(() => ({} as any));

    // The SPA's AuthProvider reads its session token from localStorage (not the
    // auth_token cookie), so seed it before the app boots up.
    if (body?.token) {
      await page.addInitScript((token: string) => {
        window.localStorage.setItem('auth_token', token);
      }, body.token as string);

      // Also set the Bearer token as an extra HTTP header on the whole browser
      // context so that page.request.* API calls (which don't use localStorage)
      // include the Authorization header. Combined with E2E_TESTING=true on the
      // server, this bypasses the CSRF double-submit check for direct API calls.
      await page.context().setExtraHTTPHeaders({
        'Authorization': `Bearer ${body.token}`,
      });
    }

    await page.goto('/');
    await page.waitForLoadState('networkidle').catch(() => {});
    return true;
  }

  return false;
}

/** True when the test-only E2E login endpoint is available (i.e. E2E_TESTING=true server-side). */
export async function isE2ELoginAvailable(page: Page): Promise<boolean> {
  const resp = await page.request.post('/api/test/e2e-login', { data: { email: E2E_TEST_EMAIL } });
  return resp.ok();
}
