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
    // 追蹤 WebSocket 實例，方便 BDD 測試主動關閉現有連線
    // (context.route 只擋新連線，不會 kill 已建立的 socket)
    const w = window as unknown as { __wsInstances?: WebSocket[] };
    w.__wsInstances = [];
    const OriginalWS = window.WebSocket;
    const Wrapped = function (this: WebSocket, url: string | URL, protocols?: string | string[]) {
      const ws = new OriginalWS(url, protocols);
      w.__wsInstances!.push(ws);
      return ws;
    } as unknown as typeof WebSocket;
    Wrapped.prototype = OriginalWS.prototype;
    Object.assign(Wrapped, OriginalWS);
    window.WebSocket = Wrapped;
  });
});

After(async ({ page, $testInfo }) => {
  if ($testInfo.status !== $testInfo.expectedStatus) {
    const safeTitle = $testInfo.title.replace(/[^a-z0-9]/gi, '_');
    const screenshotPath = path.join(SCREENSHOTS_DIR, `failure-${safeTitle}-${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
  }
});
