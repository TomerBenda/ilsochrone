import { defineConfig, devices } from '@playwright/test';

/**
 * Stub Playwright config — keeps the `pnpm test:e2e` command alive.
 * The real smoke test lands in T-13.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
