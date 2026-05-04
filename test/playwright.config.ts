import { defineConfig } from '@playwright/test';
import { defineBddConfig, cucumberReporter } from 'playwright-bdd';

const testDir = defineBddConfig({
  features: 'features/**/*.feature',
  steps: ['steps/**/*.ts', 'support/fixtures.ts', 'support/hooks.ts'],
});

export default defineConfig({
  testDir,
  outputDir: './test-results',
  fullyParallel: false,
  timeout: 30_000,
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:8080',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    headless: true,
  },
  reporter: [
    ['list'],
    ['html', { outputFolder: './reports/html', open: 'never' }],
    cucumberReporter('json', { outputFile: './reports/cucumber-report.json' }),
    cucumberReporter('html', { outputFile: './reports/cucumber-report.html' }),
  ],
});
