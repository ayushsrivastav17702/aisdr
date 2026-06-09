# E2E Browser Test Report (Playwright)

Run target: `http://localhost:5057` (local server, `NODE_ENV=development E2E_TESTING=true`)
Auth: test-only bypass endpoint `/api/test/e2e-login` (cookie-based session, mirrors real `auth_token` flow)

## Summary

1. **Total tests: 62**
2. **Passed: 27**
3. **Failed: 35**
4. **Skipped: 0**

## 5. Coverage by area

| Area              | Pass/Total | Notes |
|-------------------|-----------|-------|
| Authentication    | 3/8  | redirect-to-login, login page render, expired session pass; protected-route/console/super-admin checks fail |
| Navigation        | 3/6  | 404, deep-link, mobile viewport pass; title/sidebar-active/refresh fail |
| Prospects         | 3/9  | search, bulk-select, profile-tabs pass; all "Add Prospect" form flows time out |
| Sequences         | 3/6  | canvas-load, status-badges, no-mailbox-activation pass; name validation/duplication fail |
| Campaigns         | 2/4  | credit estimator, launch-without-sequence pass; wizard-back & duplicate-name fail |
| Email pipeline    | 3/6  | inbox-tabs, approval-queue, mailboxes-empty pass; inbox-empty-state, OAuth-button, AE-handoff fail |
| Security          | 5/6  | SQLi, XSS, cross-tenant, CSRF, rate-limit pass; **super-admin API isolation FAILS (real bug)** |
| UX/Responsive     | 2/6  | toast auto-dismiss, sign-out pass; modal escape/backdrop, settings, keyboard-nav fail |
| Loading/Error states | 3/7 | skeletons, API-error-message, offline-mode pass; analytics/find-leads/signals/knowledge-base empty states time out |
| Manage AI         | 0/4  | all 4 time out (30s) — guardrails/outbound/autonomous/overview tabs never resolve expected selectors |

(Sums to 27/62 — loading-and-error-states and manage-ai are reported separately above and also folded into the requested 8-area table where applicable.)

## 6. Bugs found during E2E testing

### Confirmed product bugs (high confidence)
1. **Super-admin API not blocked for regular users** (`security-edge-cases.spec.ts:44`)
   - Expected: `401` when a regular user calls a super-admin-only API endpoint
   - Actual: `200` — the endpoint returned data to a non-super-admin session
   - This is a genuine authorization/RBAC gap and should be treated as a security issue.

2. **Unauthenticated access to protected routes does not redirect to `/login`** (`auth-edge-cases.spec.ts:10` "cannot access any protected route")
   - Expected: navigating to `/manage-ai` while logged out redirects to a URL matching `/\/login/`
   - Actual: `expect(page).toHaveURL(/\/login/)` failed — received `http://localhost:5057/manage-ai` (page stayed on the protected route, presumably rendering a client-side gate rather than a hard redirect)
   - Worth checking whether the SPA performs an in-place auth-gate render vs. a true route redirect — if the gate doesn't fully block API calls/data fetches, this could leak data.

3. **Console error / 403 on the login page** (`auth-edge-cases.spec.ts:75` "login page has no console errors")
   - The login page logs a `Failed to load resource: the server responded with a status of 403 (Forbidden)` console error — indicates an unauthenticated request being made from `/login` that the server correctly rejects but the client doesn't suppress/handle gracefully.

### Likely UX issue worth product review
4. **"Cookie Preferences" consent banner intercepts pointer events on app pages**
   - Page snapshots captured during failures on `/prospects` show a "Cookie Preferences" dialog/banner overlay ("We use essential cookies… Learn more about our cookies → /cookie-policy") rendered on top of the authenticated app UI.
   - This banner can sit above interactive elements and may be contributing to some click-timeout failures below (in addition to selector mismatches). Recommend verifying the banner auto-dismisses or doesn't block clicks on authenticated app routes (it would be unusual to show a cookie-consent banner to a logged-in app user on every page load).

### Spec/selector mismatches (NOT product bugs — test assumptions don't match actual UI)
The remaining ~30 failures are dominated by `Test timeout of 30000ms exceeded` / `locator.click: Test timeout` / `element(s) not found` errors where the spec's generic selectors (e.g. `getByTestId('button-add-prospect')`, `getByTestId('tab-manage-ai-guardrails')`, `getByTestId('tab-manage-ai-outbound')`, etc., chained with `.or(getByRole(...))` text-based fallbacks) never resolve against the real DOM:
- `prospects-edge-cases.spec.ts` (6 failures): no `button-add-prospect` testid / matching role+name combo found — actual "Add Prospect" trigger likely uses a different label/testid or lives behind a different UI affordance.
- `manage-ai-edge-cases.spec.ts` (4 failures): `tab-manage-ai-*` testids and `/guardrails|outbound|autonomous|overview/i` tab roles not found — actual Manage AI page tab structure differs from spec assumptions.
- `responsive-and-ux.spec.ts` modal/keyboard tests (3 failures): depend on the same `button-add-prospect` selector to open a dialog.
- `sequences-edge-cases.spec.ts` (3), `loading-and-error-states.spec.ts` (4), `email-pipeline-edge-cases.spec.ts` (3), `navigation-edge-cases.spec.ts` (3), `campaigns-edge-cases.spec.ts` (2), `auth-edge-cases.spec.ts` super-admin-login/dashboard (2): similar pattern — generic text/role/testid selectors (`/banned phrases/i`, `/super.?admin/i`, page-title `expect`, sidebar `aria-current` checks, empty-state copy assumptions) don't match the actual rendered copy, route names, or test IDs in this build.

These should be treated as **spec calibration issues** (selectors need to be updated to match real `data-testid`/labels in the app) rather than functional defects — recommend a follow-up pass where the actual `data-testid` attributes are inventoried from the rendered DOM and the specs updated accordingly.

## 7. Screenshots of failures

All failure artifacts (screenshot, trace, video, error-context) are under `test-results/e2e-artifacts/<test-name>/`. Representative paths (one per failing spec area):

- `test-results/e2e-artifacts/edge-cases-auth-edge-cases-8cc4d--access-any-protected-route-chromium/test-failed-1.png`
- `test-results/e2e-artifacts/edge-cases-auth-edge-cases-d50a7--page-has-no-console-errors-chromium/test-failed-1.png`
- `test-results/e2e-artifacts/edge-cases-auth-edge-cases-00f55-in-separate-from-user-login-chromium/test-failed-1.png`
- `test-results/e2e-artifacts/edge-cases-auth-edge-cases-f3c5c-oard-redirects-without-auth-chromium/test-failed-1.png`
- `test-results/e2e-artifacts/edge-cases-auth-edge-cases-60e8b-email-shows-generic-message-chromium/test-failed-1.png`
- `test-results/e2e-artifacts/edge-cases-navigation-edge-11a6f-title-updates-on-navigation-chromium/test-failed-1.png`
- `test-results/e2e-artifacts/edge-cases-navigation-edge-1aded-state-updates-on-navigation-chromium/test-failed-1.png`
- `test-results/e2e-artifacts/edge-cases-navigation-edge-b0741-any-page-does-not-break-app-chromium/test-failed-1.png`
- `test-results/e2e-artifacts/edge-cases-prospects-edge--3a3b8-inimum-required-fields-only-chromium/test-failed-1.png`
- `test-results/e2e-artifacts/edge-cases-prospects-edge--7c547-pect-with-all-fields-filled-chromium/test-failed-1.png`
- `test-results/e2e-artifacts/edge-cases-prospects-edge--f3be0--form-shows-multiple-errors-chromium/test-failed-1.png`
- `test-results/e2e-artifacts/edge-cases-prospects-edge--96ae5-g-name-truncated-or-handled-chromium/test-failed-1.png`
- `test-results/e2e-artifacts/edge-cases-prospects-edge--3955b--characters-in-name-handled-chromium/test-failed-1.png`
- `test-results/e2e-artifacts/edge-cases-prospects-edge--cca32-duplicate-email-shows-error-chromium/test-failed-1.png`
- `test-results/e2e-artifacts/edge-cases-sequences-edge--74b01-ce-with-empty-name-rejected-chromium/test-failed-1.png`
- `test-results/e2e-artifacts/edge-cases-sequences-edge--b1436-e-sequence-name-shows-error-chromium/test-failed-1.png`
- `test-results/e2e-artifacts/edge-cases-sequences-edge--d3a1f--long-sequence-name-handled-chromium/test-failed-1.png`
- `test-results/e2e-artifacts/edge-cases-campaigns-edge--86cd4-gn-wizard-back-button-works-chromium/test-failed-1.png`
- `test-results/e2e-artifacts/edge-cases-campaigns-edge--15ef7-e-campaign-name-shows-error-chromium/test-failed-1.png`
- `test-results/e2e-artifacts/edge-cases-email-pipeline--2b4d8-nbox-loads-with-empty-state-chromium/test-failed-1.png`
- `test-results/e2e-artifacts/edge-cases-email-pipeline--ba4c7-ge-shows-Gmail-OAuth-button-chromium/test-failed-1.png`
- `test-results/e2e-artifacts/edge-cases-email-pipeline--d8228-doff-page-loads-empty-state-chromium/test-failed-1.png`
- `test-results/e2e-artifacts/edge-cases-loading-and-err-7988c--shows-zero-state-not-crash-chromium/test-failed-1.png`
- `test-results/e2e-artifacts/edge-cases-loading-and-err-7b7f7-o-results-shows-empty-state-chromium/test-failed-1.png`
- `test-results/e2e-artifacts/edge-cases-loading-and-err-3ff9a-nals-page-loads-empty-state-chromium/test-failed-1.png`
- `test-results/e2e-artifacts/edge-cases-loading-and-err-5e1c3-edge-base-loads-empty-state-chromium/test-failed-1.png`
- `test-results/e2e-artifacts/edge-cases-manage-ai-edge--ce8f4-banned-phrase-shows-in-list-chromium/test-failed-1.png`
- `test-results/e2e-artifacts/edge-cases-manage-ai-edge--33eca-und-tab-loads-without-error-chromium/test-failed-1.png`
- `test-results/e2e-artifacts/edge-cases-manage-ai-edge--f8b2d-ies-tab-loads-without-error-chromium/test-failed-1.png`
- `test-results/e2e-artifacts/edge-cases-manage-ai-edge--610a6-ompletion-tracked-correctly-chromium/test-failed-1.png`
- `test-results/e2e-artifacts/edge-cases-responsive-and--15d25--modal-closes-on-escape-key-chromium/test-failed-1.png`
- `test-results/e2e-artifacts/edge-cases-responsive-and--cc935-al-closes-on-backdrop-click-chromium/test-failed-1.png`
- `test-results/e2e-artifacts/edge-cases-responsive-and--790da-ngs-page-loads-all-sections-chromium/test-failed-1.png`
- `test-results/e2e-artifacts/edge-cases-responsive-and--ce60e-d-navigation-works-in-forms-chromium/test-failed-1.png`
- `test-results/e2e-artifacts/edge-cases-security-edge-c-36b52-I-blocked-for-regular-users-chromium/test-failed-1.png`

An interactive HTML report (with traces/videos for every failure) is also available via `playwright-report/index.html` (open with `npx playwright show-report`).

## How to reproduce

```bash
PORT=5057 NODE_ENV=development E2E_TESTING=true REDIS_DISABLED=true npx tsx server/index.ts &
E2E_BASE_URL=http://localhost:5057 npx playwright test tests/e2e-browser/edge-cases --reporter=list
```
