import { defineConfig } from '@playwright/test';

// The regression project issues + serves REAL tickets in the live queue
// database through the production stack. It must never run silently, so it
// only participates when the operator explicitly sets E2E_ALLOW_LIVE=1.
// The `fullscan` project is a safe, GET-only sweep and needs no guard.
const allowLive = process.env.E2E_ALLOW_LIVE === '1';

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list']],
  timeout: 300_000,
  // Serial with one worker: the suite must be gentle with nginx rate limits
  // (see lib/pacing.ts) and shares live queue state in a single database.
  workers: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'https://rhu.queue',
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'fullscan', testMatch: /(fullscan|no-css)\.spec\.ts/ },
    { name: 'ui', testMatch: /tests\/e2e\/login\.spec\.ts$/ },
    ...(allowLive
      ? [{ name: 'regression', testMatch: /regression\/.*\.spec\.ts/ }]
      : []),
  ],
});