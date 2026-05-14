/**
 * playwright.e2e.config.ts — Pure Playwright config for Sprint 6+ e2e tests
 *
 * 與既有 playwright.config.ts（playwright-bdd）並存。
 * 執行方式：npx playwright test --config=playwright.e2e.config.ts
 *
 * run-sprint-tests.sh 透過 SPRINT="Sprint N" 環境變數決定要跑哪些 spec。
 * Sprint 6 scope: f012, f013, f004-cr002, f011-cr002
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:8080',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.BASE_URL || 'http://localhost:8080',
      },
    },
  ],
  reporter: [
    ['list'],
    ['html', { outputFolder: './reports/playwright-report', open: 'never' }],
    ['json', { outputFile: './reports/playwright.json' }],
  ],
});
