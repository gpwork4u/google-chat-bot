import * as path from 'path';
import { createBdd } from 'playwright-bdd';
import { test } from './fixtures';

const { Before, After } = createBdd(test);

// __dirname 指向 test/support/，截圖存到 test/screenshots/（絕對路徑）
const SCREENSHOTS_DIR = path.resolve(__dirname, '..', 'screenshots');

Before(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
});

After(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    const safeTitle = testInfo.title.replace(/[^a-z0-9]/gi, '_');
    const screenshotPath = path.join(SCREENSHOTS_DIR, `failure-${safeTitle}-${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  }
});
