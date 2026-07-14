import { defineConfig, devices } from '@playwright/test'

const live = process.env.PLAYWRIGHT_LIVE === 'true'
const port = Number(process.env.ADMIN_PORT || (live ? 4173 : 4174))
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: live ? /admin-live\.spec\.ts/ : /admin-core\.spec\.ts/,
  timeout: 30_000,
  retries: 0,
  workers: live ? 1 : undefined,
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `${live ? 'VITE_OPS_API_MOCK=false' : 'VITE_OPS_API_MOCK=true'} npm run dev -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
  ],
})
