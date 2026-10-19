import { defineConfig, devices } from '@playwright/test';
const produccion = process.env.E2E_PRODUCTION === '1';
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
    baseURL: produccion ? 'https://localhost:8448' : 'http://127.0.0.1:5178',
    ignoreHTTPSErrors: produccion,
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
      command: produccion
        ? 'node scripts/servir-web-e2e.mjs'
        : 'npm run dev -w frontend -- --port 5178 --strictPort',
      url: produccion ? 'https://localhost:8448/login' : 'http://127.0.0.1:5178/login',
      ignoreHTTPSErrors: produccion,
      env: { VITE_PROXY_TARGET: 'http://127.0.0.1:3018' },
      reuseExistingServer: false,
      stdout: 'ignore',
    },
  ],
});
