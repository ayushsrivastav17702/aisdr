import { defineConfig, devices } from '@playwright/test';

const PORT = process.env.PORT || '5000';
const BASE_URL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`;
const isProductionTarget = !!process.env.E2E_BASE_URL;

// Hard block: prevent E2E tests from running against production unless
// E2E_ALLOW_PRODUCTION=true is explicitly set. Playwright tests create real
// DB rows via the HTTP API with no cleanup — running against production
// permanently pollutes customer data.
if (isProductionTarget && process.env.E2E_ALLOW_PRODUCTION !== 'true') {
  console.error('\n❌ BLOCKED: E2E_BASE_URL points to a remote target.');
  console.error('   Playwright tests create real DB rows with no cleanup.');
  console.error('   To run against a staging environment, set:');
  console.error('     E2E_ALLOW_PRODUCTION=true E2E_BASE_URL=<url> npx playwright test');
  console.error('   Never set E2E_ALLOW_PRODUCTION=true against the production URL.\n');
  process.exit(1);
}

export default defineConfig({
  testDir: './tests/e2e-browser',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'test-results/playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results/e2e-results.json' }],
  ],
  outputDir: 'test-results/e2e-artifacts',

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Only spin up a local dev server when we're not pointing at a remote/production URL.
  webServer: isProductionTarget ? undefined : {
    command: 'NODE_ENV=test E2E_TESTING=true npm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      E2E_TESTING: 'true',
      NODE_ENV: 'test',
    },
  },
});
