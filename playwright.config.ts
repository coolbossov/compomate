import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E config for CompoMate.
 *
 * Tests run against a locally running Next.js server.
 * In CI: production build (npm run build && npm run start).
 * Locally: dev server (npm run dev).
 *
 * Usage:
 *   npm run test:e2e              # runs against localhost:3000
 *   BASE_URL=https://app.sapicture.day npm run test:e2e
 */
export default defineConfig({
  testDir:       './tests/e2e',
  fullyParallel: false,
  forbidOnly:    !!process.env.CI,
  retries:       process.env.CI ? 2 : 0,
  workers:       1,
  reporter:      [['html', { open: 'never' }], ['list']],

  use: {
    baseURL:          process.env.BASE_URL ?? 'http://localhost:3000',
    trace:            'on-first-retry',
    screenshot:       'only-on-failure',
    actionTimeout:    15_000,
    navigationTimeout: 20_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // In CI: build then start the production server.
  // Locally: start the dev server (faster iteration).
  webServer: process.env.BASE_URL
    ? undefined
    : process.env.CI
    ? {
        command: 'npm run build && npm run start',
        url:     'http://localhost:3000',
        reuseExistingServer: false,
        timeout: 120_000,
      }
    : {
        command: 'npm run dev',
        url:     'http://localhost:3000',
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
