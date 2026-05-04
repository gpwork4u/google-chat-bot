import { createBdd } from 'playwright-bdd';
import { test } from './fixtures';

const { Before, After } = createBdd(test);

Before(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
});

After(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    const screenshotPath = `screenshots/failure-${testInfo.title.replace(/[^a-z0-9]/gi, '_')}-${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
  }
});
