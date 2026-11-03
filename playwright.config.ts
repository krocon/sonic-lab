import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against the web build served by the Angular dev server.
 * Microphone scenarios use e2e/fixtures/fake-microphone.ts (a Web Audio generated MediaStream).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  // WebKit becomes flaky with many concurrent AudioContexts; two workers are stable.
  workers: process.env['CI'] ? 2 : undefined,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:1420',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        // headless Firefox has no real user activation for Web Audio; allow it like a click would
        launchOptions: { firefoxUserPrefs: { 'media.autoplay.default': 0, 'media.autoplay.block-webaudio': false } },
      },
    },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'pnpm start',
    url: 'http://localhost:1420',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
