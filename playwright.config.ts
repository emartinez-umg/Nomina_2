import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120000,
  expect: { timeout: 15000 },
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:5178',
    actionTimeout: 15000,
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  webServer: [
    {
      command: 'node node_modules/tsx/dist/cli.mjs backend/e2e/server.ts',
      url: 'http://127.0.0.1:3018/api/salud',
      timeout: 120000,
      reuseExistingServer: false,
      stdout: 'ignore',
    },
    {
      command: 'npm run dev -w frontend -- --port 5178 --strictPort',
      url: 'http://127.0.0.1:5178/login',
      env: { VITE_PROXY_TARGET: 'http://127.0.0.1:3018' },
      reuseExistingServer: false,
      stdout: 'ignore',
    },
  ],
});
