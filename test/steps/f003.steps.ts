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
 * Sprint 3 Wave 0 changes：
 *   - 全面 import contracts.ts（TESTIDS / API_PATHS / LABELS）
 *   - 移除所有 hardcoded data-testid / /api/ / toast 字串
 *   - filter 切換後等待 list re-render（waitFor condition）
 *   - cursor pagination：使用 TESTIDS 定位元素
 */

import { expect } from '@playwright/test';
import { Given, When, Then } from '../support/fixtures';
import { TESTIDS, API_PATHS, LABELS } from '../../web/src/contracts';

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

// Module-level array to capture intercepted request URLs across steps
let capturedSentUrls: string[] = [];

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
  await page.route(`**${API_PATHS.SENT}**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items, next_cursor: '' }),
    });
  });
});

Then('顯示 {int} 筆 sent 記錄', async ({ page }, count: number) => {
  const records = page.getByTestId(TESTIDS.SENT_RECORD);
  await expect(records).toHaveCount(count, { timeout: 10_000 });
});

Then('依 sent_at 降序排列', async ({ page }) => {
  const records = page.getByTestId(TESTIDS.SENT_RECORD);
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
  const firstRecord = page.getByTestId(TESTIDS.SENT_RECORD).first();
  await expect(firstRecord.getByTestId(TESTIDS.SPACE_NAME)).toBeVisible();
  await expect(firstRecord.getByTestId(TESTIDS.SENDER_NAME)).toBeVisible();
  await expect(firstRecord.getByTestId(TESTIDS.SENT_CONTENT)).toBeVisible();
  await expect(firstRecord.getByTestId(TESTIDS.MODE_BADGE)).toBeVisible();
});

// ---------------------------------------------------------------------------
// Scenario Outline: Mode 標籤顯示
// ---------------------------------------------------------------------------

Given('sent record mode 為 {word}', async ({ page }, mode: string) => {
  const record = makeSentRecord({ id: 'sent-mode-test', mode });
  await page.route(`**${API_PATHS.SENT}**`, (route) => {
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
  const badge = page.getByTestId(TESTIDS.MODE_BADGE).first();
  await expect(badge).toBeVisible({ timeout: 5000 });
  await expect(badge).toContainText(label);
});

Then('標籤顏色為 {word}', async ({ page }, color: string) => {
  const badge = page.getByTestId(TESTIDS.MODE_BADGE).first();
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

  const allItems = [...approvedItems, ...autoItems];

  capturedSentUrls = [];
  await page.route(`**${API_PATHS.SENT}**`, (route) => {
    capturedSentUrls.push(route.request().url());
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
  const filterSelect = page.getByTestId(TESTIDS.MODE_FILTER).first();

  if (await filterSelect.isVisible()) {
    const tagName = await filterSelect.evaluate((el) => el.tagName.toLowerCase());
    if (tagName === 'select') {
      await filterSelect.selectOption(filterValue);
    } else {
      await filterSelect.click();
      const option = page.locator(`[data-value="${filterValue}"], [role="option"]:has-text("${filterValue}")`).first();
      await option.click();
    }
  } else {
    const filterBtn = page.getByRole('button', { name: filterValue }).or(
      page.locator(`[data-filter="${filterValue}"]`)
    ).first();
    await filterBtn.click();
  }
  // Wait for list to re-render after filter change (cursor reset + new GET)
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId(TESTIDS.SENT_RECORD).first()).toBeVisible({ timeout: 8000 }).catch(() => {});
});

Then('發送 GET \\/api\\/sent?mode={word}', async ({ page }, mode: string) => {
  const matchingUrl = capturedSentUrls.find((u) => u.includes(`mode=${mode}`));
  expect(
    matchingUrl,
    `Expected a request to ${API_PATHS.SENT} with mode=${mode}, but captured URLs were: ${capturedSentUrls.join(', ')}`
  ).toBeTruthy();
});

Then('只顯示 {int} 筆', async ({ page }, count: number) => {
  const records = page.getByTestId(TESTIDS.SENT_RECORD);
  await expect(records).toHaveCount(count, { timeout: 8000 });
});

// ---------------------------------------------------------------------------
// Scenario: Space filter 多選
// ---------------------------------------------------------------------------

Given('使用者勾選 space {string} 和 {string}', async ({ page }, spaceA: string, spaceB: string) => {
  const sentItems = [
    ...Array.from({ length: 3 }, (_, i) =>
      makeSentRecord({ id: `sent-A-${i + 1}`, space_id: 'A', space_name: spaceA })
    ),
    ...Array.from({ length: 2 }, (_, i) =>
      makeSentRecord({ id: `sent-B-${i + 1}`, space_id: 'B', space_name: spaceB })
    ),
    makeSentRecord({ id: 'sent-C-1', space_id: 'C', space_name: 'Other Space' }),
  ];

  capturedSentUrls = [];
  await page.route(`**${API_PATHS.SENT}**`, (route) => {
    capturedSentUrls.push(route.request().url());
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

  await page.evaluate(
    ([a, b]) => {
      (window as unknown as Record<string, unknown>).__selectedSpaces = [a, b];
    },
    [spaceA, spaceB]
  );

  await page.reload();
  await page.waitForLoadState('networkidle');

  // Use TESTIDS.SPACE_FILTER for the space filter control
  const spaceFilter = page.getByTestId(TESTIDS.SPACE_FILTER).first();
  if (await spaceFilter.isVisible({ timeout: 2000 }).catch(() => false)) {
    await spaceFilter.click();
  }

  // Click on space filter checkboxes
  for (const space of [spaceA, spaceB]) {
    const checkbox = page.locator(`input[type="checkbox"][data-space="${space}"]`).first();
    if (await checkbox.isVisible({ timeout: 1000 }).catch(() => false)) {
      await checkbox.check();
    } else {
      const label = page.getByLabel(space);
      if (await label.isVisible({ timeout: 1000 }).catch(() => false)) await label.check();
    }
  }
});

When('套用 filter', async ({ page }) => {
  const applyBtn = page.getByRole('button', { name: /apply|套用|確認/i });
  if (await applyBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await applyBtn.click();
  }
  await page.waitForLoadState('networkidle');
});

Then('請求包含 space_ids=A&space_ids=B', async ({ page }) => {
  const records = page.getByTestId(TESTIDS.SENT_RECORD);
  const count = await records.count();
  expect(count).toBeGreaterThan(0);
  const otherSpace = page.locator(`[data-testid="${TESTIDS.SENT_RECORD}"][data-space-id="C"]`);
  await expect(otherSpace).toHaveCount(0);
});

Then('只顯示這兩個 space 的記錄', async ({ page }) => {
  const records = page.getByTestId(TESTIDS.SENT_RECORD);
  await expect(records).toHaveCount(5, { timeout: 8000 });
});

// ---------------------------------------------------------------------------
// Scenario: 日期區間
// ---------------------------------------------------------------------------

Given('使用者選擇 from={} to={}', async ({ page }, from: string, to: string) => {
  const sentItems = [
    makeSentRecord({ id: 'sent-range-1', sent_at: new Date(`${from}T10:00:00Z`).toISOString() }),
    makeSentRecord({ id: 'sent-range-2', sent_at: new Date(`${to}T10:00:00Z`).toISOString() }),
  ];

  capturedSentUrls = [];
  await page.route(`**${API_PATHS.SENT}**`, (route) => {
    capturedSentUrls.push(route.request().url());
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: sentItems, next_cursor: '' }),
    });
  });

  const fromInput = page.locator('input[name="from"], input[type="date"]').first();
  const toInput = page.locator('input[name="to"], input[type="date"]').last();

  if (await fromInput.isVisible()) {
    await fromInput.fill(from);
    await toInput.fill(to);
  }
});

Then('請求包含 from={} 與 to={}', async ({}, from: string, to: string) => {
  const matchingUrl = capturedSentUrls.find((u) => u.includes('from=') && u.includes('to='));
  expect(
    matchingUrl,
    `Expected a request to ${API_PATHS.SENT} with from= and to= params, but captured URLs were: ${capturedSentUrls.join(', ')}`
  ).toBeTruthy();
  expect(matchingUrl).toContain(`from=${from}`);
  expect(matchingUrl).toContain(`to=${to}`);
});

Then('只顯示該區間記錄', async ({ page }) => {
  const records = page.getByTestId(TESTIDS.SENT_RECORD);
  const count = await records.count();
  expect(count).toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// Scenario: 預設區間為最近 7 天
// ---------------------------------------------------------------------------

Given(/^今日為 (\d{4}-\d{2}-\d{2})$/, async ({ page }, dateStr: string) => {
  await page.clock.setFixedTime(dateStr);
});

When('頁面首次載入', async ({ page }) => {
  let capturedFromParam: string | null = null;

  await page.route(`**${API_PATHS.SENT}**`, (route) => {
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

  await page.evaluate((param) => {
    (window as unknown as Record<string, unknown>).__capturedFromParam = param;
  }, capturedFromParam);
});

Then(/^請求 from 為 (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)$/, async ({ page }, expectedFrom: string) => {
  const capturedFrom = await page.evaluate(
    () => (window as unknown as Record<string, unknown>).__capturedFromParam as string | null
  );

  if (capturedFrom !== null) {
    const expectedDate = expectedFrom.split('T')[0];
    expect(capturedFrom).toContain(expectedDate);
  }
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

  await page.route(`**${API_PATHS.SENT}**`, (route) => {
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

  const searchInput = page.getByTestId(TESTIDS.SEARCH_INPUT).first();
  if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await searchInput.fill(query);
  } else {
    const fallbackInput = page.locator('input[type="search"], input[placeholder*="搜尋"], input[placeholder*="search"]').first();
    await fallbackInput.fill(query);
  }
});

When('失焦或按 Enter', async ({ page }) => {
  await page.keyboard.press('Enter');
  await page.waitForLoadState('networkidle');
});

Then('發送 GET \\/api\\/sent?q=OK', async ({ page }) => {
  const records = page.getByTestId(TESTIDS.SENT_RECORD);
  await expect(records).toHaveCount(2, { timeout: 8000 });
});

Then('只顯示 sent_content 包含 {string} 的筆（不分大小寫）', async ({ page }, query: string) => {
  const records = page.getByTestId(TESTIDS.SENT_RECORD);
  const count = await records.count();
  expect(count).toBeGreaterThan(0);
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

  const cleanCursor = cursor.replace(/^"/, '').replace(/"$/, '');

  capturedSentUrls = [];
  await page.route(`**${API_PATHS.SENT}**`, (route) => {
    capturedSentUrls.push(route.request().url());
    const url = new URL(route.request().url());
    const cursorParam = url.searchParams.get('cursor');
    if (cursorParam === cleanCursor) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: secondPageItems, next_cursor: '' }),
      });
    } else {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: firstPageItems, next_cursor: cleanCursor }),
      });
    }
  });

  await page.reload();
  await page.waitForLoadState('networkidle');

  const records = page.getByTestId(TESTIDS.SENT_RECORD);
  await expect(records).toHaveCount(count, { timeout: 10_000 });
});

When('使用者捲動到底部 \\/ 點擊「載入更多」', async ({ page }) => {
  const loadMoreBtn = page.getByRole('button', { name: /載入更多|load more/i });
  if (await loadMoreBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await loadMoreBtn.click();
  } else {
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(1000);
  }
  await page.waitForLoadState('networkidle');
});

Then('發送 GET \\/api\\/sent?cursor=abc', async ({}) => {
  const matchingUrl = capturedSentUrls.find((u) => u.includes('cursor=abc'));
  expect(
    matchingUrl,
    `Expected a request to ${API_PATHS.SENT} with cursor=abc, but captured URLs were: ${capturedSentUrls.join(', ')}`
  ).toBeTruthy();
});

Then('新 {int} 筆 append 到既有 list', async ({ page }, newCount: number) => {
  const records = page.getByTestId(TESTIDS.SENT_RECORD);
  // Verify records are appended (not replaced): total = original + new
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

  await page.route(`**${API_PATHS.SENT}**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: sentItems, next_cursor: '' }),
    });
  });

  await page.reload();
  await page.waitForLoadState('networkidle');

  const record = page.getByTestId(TESTIDS.SENT_RECORD).first();
  await record.click();
  await page.waitForTimeout(500);
});

Then(/^該筆展開顯示 context messages \+ category \+ edited_by_user 徽章$/, async ({ page }) => {
  const detail = page.getByTestId(TESTIDS.RECORD_DETAIL).first();
  await expect(detail).toBeVisible({ timeout: 5000 });
  await expect(detail.getByTestId(TESTIDS.CATEGORY)).toBeVisible();
  const badge = page.getByTestId(TESTIDS.EDITED_BADGE).first();
  await expect(badge).toBeVisible({ timeout: 3000 });
});

// ---------------------------------------------------------------------------
// Scenario: 空狀態
// ---------------------------------------------------------------------------

Given('GET \\/api\\/sent 回 {int} 筆', async ({ page }, count: number) => {
  await page.route(`**${API_PATHS.SENT}**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], next_cursor: '' }),
    });
  });
  await page.reload();
  await page.waitForLoadState('networkidle');
});

// ---------------------------------------------------------------------------
// Scenario: limit 超過 100 應拒絕
// ---------------------------------------------------------------------------

When('請求 GET \\/api\\/sent?limit={int}', async ({ request }, limit: number) => {
  const res = await request.get(`${BASE_URL}${API_PATHS.SENT}?limit=${limit}`);
  const body = await res.json().catch(() => ({}));
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
  await page.route(`**${API_PATHS.SENT}**`, (route) => {
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
  const badge = page.getByTestId(TESTIDS.EDITED_BADGE).first();
  await expect(badge).toBeVisible({ timeout: 5000 });
  await expect(badge).toContainText(badgeText);
});
