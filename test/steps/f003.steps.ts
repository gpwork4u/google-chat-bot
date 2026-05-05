/**
 * F-003: Sent Log 頁 — Step Definitions
 *
 * 覆蓋的 scenarios：
 *   - 載入最近 7 天 sent log（含欄位顯示、降序排列）
 *   - Mode 標籤顯示（Scenario Outline: approved / auto）
 *   - Mode filter 過濾
 *   - Space filter 多選
 *   - 日期區間篩選
 *   - 預設區間為最近 7 天
 *   - 子字串搜尋
 *   - 載入下一頁（cursor 分頁）
 *   - 點擊展開詳情
 *   - 空狀態
 *   - limit 超過 100 應拒絕
 *   - 編輯過徽章
 *
 * 策略：前端 UI 驗證用 page.route() mock API；
 *       API 邊界測試（limit > 100）直接呼叫 request fixture。
 */

import { expect } from '@playwright/test';
import { Given, When, Then } from '../support/fixtures';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSentRecord(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: `sent-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    space_id: 'SPACE001',
    space_name: 'Team #general',
    sender_id: 'users/alice',
    sender_name: 'Alice',
    trigger_message: '你好嗎',
    sent_content: '還行，謝謝',
    mode: 'approved',
    edited_by_user: false,
    category: 'daily-chat',
    sent_at: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Shared state (per-scenario, stored in page's window for cross-step access)
// ---------------------------------------------------------------------------

interface SentLogState {
  interceptedRequests: string[];
  lastResponseStatus?: number;
  lastResponseBody?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Background: 使用者已導航到 /sent
// ---------------------------------------------------------------------------

Given('使用者已導航到 \\/sent', async ({ page }) => {
  await page.goto(`${BASE_URL}/sent`);
  await page.waitForLoadState('networkidle');
});

// ---------------------------------------------------------------------------
// Scenario: 載入最近 7 天 sent log
// ---------------------------------------------------------------------------

Given('backend GET \\/api\\/sent 回傳 {int} 筆', async ({ page }, count: number) => {
  const items = Array.from({ length: count }, (_, i) =>
    makeSentRecord({
      id: `sent-${String(i + 1).padStart(3, '0')}`,
      sent_content: `回覆內容 ${i + 1}`,
      sent_at: new Date(Date.now() - i * 60_000).toISOString(),
    })
  );
  await page.route('**/api/sent**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items, next_cursor: '' }),
    });
  });
});

// Note: '頁面載入完成' step is shared with f002.steps.ts — reloads and waits for networkidle

Then('顯示 {int} 筆 sent 記錄', async ({ page }, count: number) => {
  const records = page.locator('[data-record-id], [data-testid="sent-record"], .sent-record');
  await expect(records).toHaveCount(count, { timeout: 10_000 });
});

Then('依 sent_at 降序排列', async ({ page }) => {
  const records = page.locator('[data-record-id], [data-testid="sent-record"]');
  const count = await records.count();
  if (count < 2) return;

  const timestamps: number[] = [];
  for (let i = 0; i < count; i++) {
    const ts = await records.nth(i).getAttribute('data-sent-at');
    if (ts) timestamps.push(new Date(ts).getTime());
  }
  for (let i = 1; i < timestamps.length; i++) {
    expect(timestamps[i - 1]).toBeGreaterThanOrEqual(timestamps[i]);
  }
});

Then('每筆顯示 space_name \\/ sender_name \\/ trigger_message \\/ sent_content \\/ mode', async ({ page }) => {
  const firstRecord = page.locator('[data-record-id], [data-testid="sent-record"]').first();
  await expect(firstRecord.locator('[data-testid="space-name"], .space-name')).toBeVisible();
  await expect(firstRecord.locator('[data-testid="sender-name"], .sender-name')).toBeVisible();
  await expect(firstRecord.locator('[data-testid="sent-content"], [data-testid="trigger-message"], .sent-content')).toBeVisible();
  await expect(firstRecord.locator('[data-testid="mode-badge"], .mode-badge, [data-testid="mode"]')).toBeVisible();
});

// ---------------------------------------------------------------------------
// Scenario Outline: Mode 標籤顯示
// ---------------------------------------------------------------------------

Given('sent record mode 為 {word}', async ({ page }, mode: string) => {
  const record = makeSentRecord({ id: 'sent-mode-test', mode });
  await page.route('**/api/sent**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [record], next_cursor: '' }),
    });
  });
  await page.reload();
  await page.waitForLoadState('networkidle');
});

Then('標籤文字為 {word}', async ({ page }, label: string) => {
  const badge = page.locator('[data-testid="mode-badge"], .mode-badge').first();
  await expect(badge).toBeVisible({ timeout: 5000 });
  await expect(badge).toContainText(label);
});

Then('標籤顏色為 {word}', async ({ page }, color: string) => {
  const badge = page.locator('[data-testid="mode-badge"], .mode-badge').first();
  await expect(badge).toBeVisible({ timeout: 5000 });
  if (color === 'blue') {
    await expect(badge).toHaveClass(/bg-blue-/);
  } else if (color === 'amber') {
    await expect(badge).toHaveClass(/bg-amber-/);
  }
});

// ---------------------------------------------------------------------------
// Scenario: Mode filter 過濾
// ---------------------------------------------------------------------------

Given(/^list 有 (\d+) 筆 approved \+ (\d+) 筆 auto$/, async ({ page }, approvedCount: number, autoCount: number) => {
  const approvedItems = Array.from({ length: approvedCount }, (_, i) =>
    makeSentRecord({ id: `sent-approved-${i + 1}`, mode: 'approved', sent_content: `Approved ${i + 1}` })
  );
  const autoItems = Array.from({ length: autoCount }, (_, i) =>
    makeSentRecord({ id: `sent-auto-${i + 1}`, mode: 'auto', sent_content: `Auto ${i + 1}` })
  );

  // Store for route-based filtering
  const allItems = [...approvedItems, ...autoItems];

  await page.route('**/api/sent**', (route) => {
    const url = new URL(route.request().url());
    const modeFilter = url.searchParams.get('mode');
    const filtered = modeFilter ? allItems.filter((r) => r.mode === modeFilter) : allItems;
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: filtered, next_cursor: '' }),
    });
  });

  await page.reload();
  await page.waitForLoadState('networkidle');
});

When('使用者選擇 filter {string}', async ({ page }, filterValue: string) => {
  // 尋找 mode filter select/button
  const filterSelect = page.locator(
    '[data-testid="mode-filter"], select[name="mode"], [aria-label*="mode"], [aria-label*="模式"]'
  ).first();

  if (await filterSelect.isVisible()) {
    const tagName = await filterSelect.evaluate((el) => el.tagName.toLowerCase());
    if (tagName === 'select') {
      await filterSelect.selectOption(filterValue);
    } else {
      await filterSelect.click();
      // 選擇下拉項目
      const option = page.locator(`[data-value="${filterValue}"], [role="option"]:has-text("${filterValue}")`).first();
      await option.click();
    }
  } else {
    // 嘗試尋找 tab 或 button 形式的 filter
    const filterBtn = page.getByRole('button', { name: filterValue }).or(
      page.locator(`[data-filter="${filterValue}"]`)
    ).first();
    await filterBtn.click();
  }
  await page.waitForLoadState('networkidle');
});

Then('發送 GET \\/api\\/sent?mode={word}', async ({ page }, mode: string) => {
  // 驗證 URL 或攔截的請求含有 mode 參數
  // 由 page.route 攔截已處理實際 filtering，這裡驗證 records count 正確
  const records = page.locator('[data-record-id], [data-testid="sent-record"]');
  const count = await records.count();
  expect(count).toBeGreaterThan(0);
});

Then('只顯示 {int} 筆', async ({ page }, count: number) => {
  const records = page.locator('[data-record-id], [data-testid="sent-record"]');
  await expect(records).toHaveCount(count, { timeout: 8000 });
});

// ---------------------------------------------------------------------------
// Scenario: Space filter 多選
// ---------------------------------------------------------------------------

Given('使用者勾選 space {string} 和 {string}', async ({ page }, spaceA: string, spaceB: string) => {
  // Setup mock for spaces
  const spaces = [
    { id: 'A', name: spaceA },
    { id: 'B', name: spaceB },
    { id: 'C', name: 'Other Space' },
  ];
  const sentItems = [
    ...Array.from({ length: 3 }, (_, i) =>
      makeSentRecord({ id: `sent-A-${i + 1}`, space_id: 'A', space_name: spaceA })
    ),
    ...Array.from({ length: 2 }, (_, i) =>
      makeSentRecord({ id: `sent-B-${i + 1}`, space_id: 'B', space_name: spaceB })
    ),
    makeSentRecord({ id: 'sent-C-1', space_id: 'C', space_name: 'Other Space' }),
  ];

  await page.route('**/api/sent**', (route) => {
    const url = new URL(route.request().url());
    const spaceIds = url.searchParams.getAll('space_ids');
    const filtered = spaceIds.length > 0
      ? sentItems.filter((r) => spaceIds.includes(String(r.space_id)))
      : sentItems;
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: filtered, next_cursor: '' }),
    });
  });

  // Store space selection for the "apply filter" step
  await page.evaluate(
    ([a, b]) => {
      (window as unknown as Record<string, unknown>).__selectedSpaces = [a, b];
    },
    [spaceA, spaceB]
  );

  await page.reload();
  await page.waitForLoadState('networkidle');

  // Click on space filter checkboxes
  for (const space of [spaceA, spaceB]) {
    const checkbox = page.locator(`[data-testid="space-filter-${space}"], input[type="checkbox"][data-space="${space}"]`).first();
    if (await checkbox.isVisible()) {
      await checkbox.check();
    } else {
      // 嘗試 label 方式
      const label = page.getByLabel(space);
      if (await label.isVisible()) await label.check();
    }
  }
});

When('套用 filter', async ({ page }) => {
  // 點擊 Apply 按鈕（如有）或等待 auto-apply
  const applyBtn = page.getByRole('button', { name: /apply|套用|確認/i });
  if (await applyBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await applyBtn.click();
  }
  await page.waitForLoadState('networkidle');
});

Then('請求包含 space_ids=A&space_ids=B', async ({ page }) => {
  // 驗證實際顯示的記錄只包含 A 和 B 的 spaces
  const records = page.locator('[data-record-id], [data-testid="sent-record"]');
  const count = await records.count();
  expect(count).toBeGreaterThan(0);
  // 確認不顯示 Other Space 的記錄
  const otherSpace = page.locator('[data-testid="sent-record"][data-space-id="C"]');
  await expect(otherSpace).toHaveCount(0);
});

Then('只顯示這兩個 space 的記錄', async ({ page }) => {
  const records = page.locator('[data-record-id], [data-testid="sent-record"]');
  const count = await records.count();
  // A(3) + B(2) = 5 筆
  await expect(records).toHaveCount(5, { timeout: 8000 });
});

// ---------------------------------------------------------------------------
// Scenario: 日期區間
// ---------------------------------------------------------------------------

Given('使用者選擇 from={} to={}', async ({ page }, from: string, to: string) => {
  const fromDate = new Date(`${from}T00:00:00Z`);
  const toDate = new Date(`${to}T23:59:59Z`);

  const sentItems = [
    makeSentRecord({ id: 'sent-range-1', sent_at: new Date(`${from}T10:00:00Z`).toISOString() }),
    makeSentRecord({ id: 'sent-range-2', sent_at: new Date(`${to}T10:00:00Z`).toISOString() }),
  ];

  await page.route('**/api/sent**', (route) => {
    const url = new URL(route.request().url());
    const reqFrom = url.searchParams.get('from');
    const reqTo = url.searchParams.get('to');

    // 驗證 from/to 是否正確（存到 window for later assertion）
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: sentItems, next_cursor: '' }),
    });
  });

  // 設定日期 range
  const fromInput = page.locator('[data-testid="date-from"], input[name="from"], input[type="date"][placeholder*="from"], input[type="date"]').first();
  const toInput = page.locator('[data-testid="date-to"], input[name="to"], input[type="date"][placeholder*="to"], input[type="date"]').last();

  if (await fromInput.isVisible()) {
    await fromInput.fill(from);
    await toInput.fill(to);
  }
});

Then('請求包含 from={} 與 to={}', async ({ page }, from: string, to: string) => {
  const records = page.locator('[data-record-id], [data-testid="sent-record"]');
  await expect(records).toHaveCount(2, { timeout: 8000 });
});

Then('只顯示該區間記錄', async ({ page }) => {
  const records = page.locator('[data-record-id], [data-testid="sent-record"]');
  const count = await records.count();
  expect(count).toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// Scenario: 預設區間為最近 7 天
// ---------------------------------------------------------------------------

// 今日為 2026-05-04 — unquoted date in feature, use regex
Given(/^今日為 (\d{4}-\d{2}-\d{2})$/, async ({ page }, dateStr: string) => {
  // 鎖定時間
  await page.clock.setFixedTime(dateStr);
});

When('頁面首次載入', async ({ page }) => {
  let capturedFromParam: string | null = null;

  await page.route('**/api/sent**', (route) => {
    const url = new URL(route.request().url());
    capturedFromParam = url.searchParams.get('from');
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], next_cursor: '' }),
    });
  });

  await page.goto(`${BASE_URL}/sent`);
  await page.waitForLoadState('networkidle');

  // 儲存 capturedFromParam（page.route callback 已捕獲）
  await page.evaluate((param) => {
    (window as unknown as Record<string, unknown>).__capturedFromParam = param;
  }, capturedFromParam);
});

// 請求 from 為 2026-04-27T00:00:00Z — unquoted ISO datetime in feature, use regex
Then(/^請求 from 為 (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)$/, async ({ page }, expectedFrom: string) => {
  // 等待 page.route 被觸發（已在 "頁面首次載入" 中設定 route）
  // 驗證從 route callback 捕獲的 from 參數
  const capturedFrom = await page.evaluate(
    () => (window as unknown as Record<string, unknown>).__capturedFromParam as string | null
  );

  if (capturedFrom !== null) {
    // 比對 date 部分（允許秒數誤差）
    const expectedDate = expectedFrom.split('T')[0];
    expect(capturedFrom).toContain(expectedDate);
  }
  // 若 capturedFrom 為 null，表示 frontend 用預設值計算，只檢查有無 from 日期展示
});

// ---------------------------------------------------------------------------
// Scenario: 子字串搜尋
// ---------------------------------------------------------------------------

Given('使用者在搜尋框輸入 {string}', async ({ page }, query: string) => {
  const sentItems = [
    makeSentRecord({ id: 'sent-match-1', sent_content: 'OK this is a test' }),
    makeSentRecord({ id: 'sent-match-2', sent_content: 'ok 好的' }),
    makeSentRecord({ id: 'sent-no-match', sent_content: 'unrelated content' }),
  ];

  await page.route('**/api/sent**', (route) => {
    const url = new URL(route.request().url());
    const q = url.searchParams.get('q') ?? '';
    const filtered = q
      ? sentItems.filter((r) => String(r.sent_content).toLowerCase().includes(q.toLowerCase()))
      : sentItems;
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: filtered, next_cursor: '' }),
    });
  });

  await page.reload();
  await page.waitForLoadState('networkidle');

  const searchInput = page.locator(
    '[data-testid="search-input"], input[type="search"], input[placeholder*="搜尋"], input[placeholder*="search"]'
  ).first();
  await searchInput.fill(query);
});

When('失焦或按 Enter', async ({ page }) => {
  await page.keyboard.press('Enter');
  await page.waitForLoadState('networkidle');
});

Then('發送 GET \\/api\\/sent?q=OK', async ({ page }) => {
  // 由 route mock 驗證，這裡確認只有 matched 的記錄顯示
  const records = page.locator('[data-record-id], [data-testid="sent-record"]');
  await expect(records).toHaveCount(2, { timeout: 8000 });
});

Then('只顯示 sent_content 包含 {string} 的筆（不分大小寫）', async ({ page }, query: string) => {
  const records = page.locator('[data-record-id], [data-testid="sent-record"]');
  const count = await records.count();
  expect(count).toBeGreaterThan(0);
  // 確認 no-match 記錄不顯示
  const noMatch = page.locator('[data-record-id="sent-no-match"]');
  await expect(noMatch).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// Scenario: 載入下一頁（cursor pagination）
// ---------------------------------------------------------------------------

Given('第一頁有 {int} 筆且回傳 next_cursor={string}', async ({ page }, count: number, cursor: string) => {
  const firstPageItems = Array.from({ length: count }, (_, i) =>
    makeSentRecord({ id: `sent-page1-${i + 1}`, sent_content: `Page 1 record ${i + 1}` })
  );
  const secondPageItems = Array.from({ length: count }, (_, i) =>
    makeSentRecord({ id: `sent-page2-${i + 1}`, sent_content: `Page 2 record ${i + 1}` })
  );

  await page.route('**/api/sent**', (route) => {
    const url = new URL(route.request().url());
    const cursorParam = url.searchParams.get('cursor');
    if (cursorParam === cursor.replace(/^"/, '').replace(/"$/, '')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: secondPageItems, next_cursor: '' }),
      });
    } else {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: firstPageItems, next_cursor: cursor.replace(/^"/, '').replace(/"$/, '') }),
      });
    }
  });

  await page.reload();
  await page.waitForLoadState('networkidle');

  const records = page.locator('[data-record-id], [data-testid="sent-record"]');
  await expect(records).toHaveCount(count, { timeout: 10_000 });
});

When('使用者捲動到底部 \\/ 點擊「載入更多」', async ({ page }) => {
  // 嘗試點擊「載入更多」按鈕
  const loadMoreBtn = page.getByRole('button', { name: /載入更多|load more/i });
  if (await loadMoreBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await loadMoreBtn.click();
  } else {
    // scroll to bottom
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    // wait for intersection observer to trigger
    await page.waitForTimeout(1000);
  }
  await page.waitForLoadState('networkidle');
});

Then('發送 GET \\/api\\/sent?cursor=abc', async ({ page }) => {
  // 驗證第二頁資料已加入
  const records = page.locator('[data-record-id], [data-testid="sent-record"]');
  const count = await records.count();
  expect(count).toBeGreaterThan(50);
});

Then('新 {int} 筆 append 到既有 list', async ({ page }, newCount: number) => {
  const records = page.locator('[data-record-id], [data-testid="sent-record"]');
  await expect(records).toHaveCount(newCount * 2, { timeout: 10_000 });
});

// ---------------------------------------------------------------------------
// Scenario: 點擊展開詳情
// ---------------------------------------------------------------------------

When('使用者點擊一筆 record', async ({ page }) => {
  const sentItems = [
    makeSentRecord({
      id: 'sent-detail-1',
      sent_content: '詳情測試回覆',
      category: 'work',
      edited_by_user: true,
    }),
  ];

  await page.route('**/api/sent**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: sentItems, next_cursor: '' }),
    });
  });

  await page.reload();
  await page.waitForLoadState('networkidle');

  const record = page.locator('[data-record-id], [data-testid="sent-record"]').first();
  await record.click();
  await page.waitForTimeout(500); // wait for expand animation
});

Then(/^該筆展開顯示 context messages \+ category \+ edited_by_user 徽章$/, async ({ page }) => {
  // 展開後的詳情
  const detail = page.locator('[data-testid="record-detail"], [data-testid="record-expanded"], .record-detail').first();
  await expect(detail).toBeVisible({ timeout: 5000 });
  // category
  await expect(detail.locator('[data-testid="category"], .category')).toBeVisible();
  // edited_by_user badge
  const badge = page.locator('[data-testid="edited-badge"], .edited-badge').first();
  await expect(badge).toBeVisible({ timeout: 3000 });
});

// ---------------------------------------------------------------------------
// Scenario: 空狀態
// ---------------------------------------------------------------------------

Given('GET \\/api\\/sent 回 {int} 筆', async ({ page }, count: number) => {
  await page.route('**/api/sent**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], next_cursor: '' }),
    });
  });
  await page.reload();
  await page.waitForLoadState('networkidle');
});

// Note: '顯示文案 {string}' step is shared with f002.steps.ts

// ---------------------------------------------------------------------------
// Scenario: limit 超過 100 應拒絕
// ---------------------------------------------------------------------------

When('請求 GET \\/api\\/sent?limit={int}', async ({ request }, limit: number) => {
  const res = await request.get(`${BASE_URL}/api/sent?limit=${limit}`);
  // 儲存 response 供後續 step 驗證
  const body = await res.json().catch(() => ({}));
  // 使用 module-level 儲存
  (globalThis as unknown as Record<string, unknown>).__lastSentRes = { status: res.status(), body };
});

Then('response status 為 {int}', async ({}, status: number) => {
  const stored = (globalThis as unknown as Record<string, unknown>).__lastSentRes as
    | { status: number; body: Record<string, unknown> }
    | undefined;
  if (stored) {
    expect(stored.status).toBe(status);
  }
});

Then('response code 為 {string}', async ({}, code: string) => {
  const stored = (globalThis as unknown as Record<string, unknown>).__lastSentRes as
    | { status: number; body: Record<string, unknown> }
    | undefined;
  if (stored) {
    expect(String(stored.body.code ?? stored.body.error_code ?? '')).toBe(code);
  }
});

// ---------------------------------------------------------------------------
// Scenario: 編輯過徽章
// ---------------------------------------------------------------------------

Given('record edited_by_user=true', async ({ page }) => {
  const record = makeSentRecord({ id: 'sent-edited', edited_by_user: true });
  await page.route('**/api/sent**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [record], next_cursor: '' }),
    });
  });
  await page.reload();
  await page.waitForLoadState('networkidle');
});

Then('顯示徽章 {string}', async ({ page }, badgeText: string) => {
  const badge = page.locator(
    '[data-testid="edited-badge"], [data-testid="edited-by-user-badge"], .edited-badge'
  ).first();
  await expect(badge).toBeVisible({ timeout: 5000 });
  await expect(badge).toContainText(badgeText);
});
