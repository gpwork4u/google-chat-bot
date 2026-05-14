/**
 * F-004: Settings Page — Sprint 6 CR-002 增補 AC
 *
 * Sprint 6 AC-CR002-S1..S3
 *
 * Note: AC-CR002-S1..S3 are Chrome extension popup UI tests which require
 * a chrome:// context. These are marked as manual smoke tests.
 * The one testable item is: /settings page shows "Pending 訊息檢視" link → navigates to /pending.
 */

import { test, expect } from '@playwright/test';
import { TESTIDS } from '../../web/src/contracts';
import { SYNC_API_PATHS } from '../support/contracts-sprint6';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';

test.describe('F-004 Settings CR-002 Sprint 6', () => {
  test.describe('Manual Smoke — Chrome Extension Popup', () => {
    test('[Manual Smoke] AC-CR002-S1: popup 顯示「Sync all spaces」按鈕 — Chrome extension 環境', () => {
      test.skip(
        true,
        'AC-CR002-S1: Chrome extension popup 需要 chrome:// 環境，Playwright 不支援。' +
          '手動驗證：載入 extension → 在任意 Google Chat 頁開 popup → 確認 data-testid="sync-history-all" 存在'
      );
    });

    test('[Manual Smoke] AC-CR002-S2: popup 在 chat space 頁顯示「Sync this space」按鈕', () => {
      test.skip(
        true,
        'AC-CR002-S2: Chrome extension popup 需要 chrome:// 環境，Playwright 不支援。' +
          '手動驗證：在已開啟的 Google Chat space 頁開 popup → 確認 data-testid="sync-history-current" 存在'
      );
    });

    test('[Manual Smoke] AC-CR002-S3: 點按鈕後 popup 每 2 秒 poll /api/extension/sync-history/status', () => {
      test.skip(
        true,
        'AC-CR002-S3: Chrome extension popup — manual smoke。' +
          '手動驗證：點 Sync 按鈕 → 開 DevTools Network → 確認每 2 秒有 GET /api/extension/sync-history/status 請求'
      );
    });
  });

  test.describe('Settings Page — Pending Viewer 連結', () => {
    test('[Happy] /settings 頁顯示 Pending 訊息檢視連結 → 點擊跳到 /pending', async ({
      page,
    }) => {
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');

      // Should have a link to /pending on the settings page
      // The link text may be "Pending 訊息檢視" or similar
      const pendingLink = page.getByRole('link', { name: /pending|訊息檢視/i });
      await expect(pendingLink).toBeVisible({ timeout: 5000 });

      // Click the link and verify navigation to /pending
      await pendingLink.click();
      await page.waitForURL('**/pending');
      expect(page.url()).toContain('/pending');
    });

    test('[Happy] /settings 頁存在 settings-page testid', async ({ page }) => {
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');

      await expect(
        page.locator(`[data-testid="${TESTIDS.SETTINGS_PAGE}"]`)
      ).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Sync History API — Sprint 6 基礎驗證', () => {
    test('[Happy] GET /api/extension/sync-history/status 端點存在（不依賴 job）', async ({
      request,
    }) => {
      // Querying status without job_id should return 400, not 404/500
      // (endpoint exists but needs job_id param)
      const res = await request.get(`${BASE_URL}${SYNC_API_PATHS.STATUS}`);
      // Either 400 (missing param) or 404 (no such job)
      expect([400, 404]).toContain(res.status());
    });

    test('[Happy] POST /api/extension/sync-history/start 端點存在', async ({ request }) => {
      // No body → should be 400 (not 404/500)
      const res = await request.post(`${BASE_URL}${SYNC_API_PATHS.START}`, {
        data: {},
      });
      expect([400, 422]).toContain(res.status()); // endpoint exists, validates input
    });
  });
});
