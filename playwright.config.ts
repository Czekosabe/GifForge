import { defineConfig, devices } from '@playwright/test'

/**
 * Real-browser regression coverage for GifForge. Kept deliberately small and
 * high-value: each test here exists because it once caught (or is designed
 * to catch) a bug that pure unit tests can't reach — see docs/PROGRESS.md
 * and docs/IMPLEMENTATION_STATUS.md for the specific incidents.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 45_000,
  use: {
    baseURL: 'http://localhost:5183',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --port 5183 --strictPort',
    url: 'http://localhost:5183',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
