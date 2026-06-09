import { defineConfig, devices } from '@playwright/test';

const PORT = process.env.PORT || '5000';
const BASE_URL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`;
const isProductionTarget = !!process.env.E2E_BASE_URL;

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
