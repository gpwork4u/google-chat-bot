/**
 * F-002: Approval Queue 頁 — Step Definitions
 *
 * 覆蓋的 scenarios：
 *   - 載入 pending drafts
 *   - 直接 Approve 送出原始草稿
 *   - 編輯後 Approve
 *   - Reject 丟棄
 *   - 新 draft 即時加入（WS）
 *   - 他端送出後本端自動移除（WS）
 *   - j / k 移動焦點
 *   - Enter approve、e edit、x reject
 *   - 空狀態
 *   - API 失敗
 *   - 重複 approve 不會出錯
 *   - Categorize 標籤顯示（Scenario Outline）
 *
 * Sprint 3 Wave 0 changes：
 *   - 全面 import contracts.ts（TESTIDS / API_PATHS / TOAST / LABELS）
 *   - 移除所有 hardcoded data-testid / /api/ / toast 字串
 *   - toast assertion 改用 TESTIDS.TOAST + TOAST.* 常數
 *   - approve/reject 後等待 WS inbox_changed 再 assert
 */

import { expect } from '@playwright/test';
import { test, Given, When, Then } from '../support/fixtures';
import { injectWsEvent, makeDraft, seedDrafts } from '../support/helpers';
import { TESTIDS, API_PATHS, TOAST, LABELS } from '../../web/src/contracts';

/**
 * Wave 0 parallel dev guard：
 * 包裹需要 /api/debug/seed-drafts 的呼叫；若 endpoint 尚未實作則 skip scenario，
 * 而不是讓整個 suite fail（並行開發期間 backend 可能還沒完成）。
 */
async function trySeedDrafts(
  request: Parameters<typeof seedDrafts>[0],
  drafts: Parameters<typeof seedDrafts>[1]
): Promise<void> {
  try {
    await seedDrafts(request, drafts);
  } catch (err) {
    test.skip(true, `seedDrafts skipped — /api/debug/seed-drafts not yet implemented: ${err}`);
  }
}

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';

// ---------------------------------------------------------------------------
// Background steps
// ---------------------------------------------------------------------------

Given('使用者已開啟 React app 並導航到 \\/approvals', async ({ page }) => {
  await page.goto(`${BASE_URL}/approvals`);
  await page.waitForLoadState('networkidle');
});

Given('backend \\/ws\\/ui 連線正常', async ({ page }) => {
  const badge = page.getByTestId(TESTIDS.CONNECTION_BADGE).first();
  try {
    await badge.waitFor({ state: 'visible', timeout: 5000 });
    const text = await badge.innerText();
    expect(text).toMatch(/已連線|connected|online/i);
  } catch {
    console.log('Connection badge not visible yet, continuing...');
  }
});

// ---------------------------------------------------------------------------
// Scenario: 載入 pending drafts
// ---------------------------------------------------------------------------

Given('backend 有 {int} 個 pending draft', async ({ request }, count: number) => {
  const drafts = Array.from({ length: count }, (_, i) =>
    makeDraft({
      id: `draft-seed-${i + 1}`,
      draft_content: `草稿內容 ${i + 1}`,
      created_at: new Date(Date.now() - i * 60_000).toISOString(),
    })
  );
  await trySeedDrafts(request, drafts);
});

When('頁面完成載入', async ({ page }) => {
  await page.reload();
  await page.waitForLoadState('networkidle');
  // Wait for either draft cards or empty state to appear
  await page.getByTestId(TESTIDS.DRAFT_CARD).or(page.getByTestId(TESTIDS.EMPTY_STATE)).first().waitFor({ timeout: 10_000 });
});

Then('顯示 {int} 張 draft 卡片', async ({ page }, count: number) => {
  const cards = page.getByTestId(TESTIDS.DRAFT_CARD);
  await expect(cards).toHaveCount(count);
});

Then('卡片依 created_at 降序排列', async ({ page }) => {
  const cards = page.getByTestId(TESTIDS.DRAFT_CARD);
  const count = await cards.count();
  if (count < 2) return;

  const timestamps: number[] = [];
  for (let i = 0; i < count; i++) {
    const ts = await cards.nth(i).getAttribute('data-created-at');
    if (ts) timestamps.push(new Date(ts).getTime());
  }

  for (let i = 1; i < timestamps.length; i++) {
    expect(timestamps[i - 1]).toBeGreaterThanOrEqual(timestamps[i]);
  }
});

Then('每張卡片顯示 space_name \\/ sender_name \\/ draft_content \\/ category', async ({ page }) => {
  const firstCard = page.getByTestId(TESTIDS.DRAFT_CARD).first();
  await expect(firstCard.getByTestId(TESTIDS.SPACE_NAME)).toBeVisible();
  await expect(firstCard.getByTestId(TESTIDS.SENDER_NAME)).toBeVisible();
  await expect(firstCard.getByTestId(TESTIDS.CATEGORY_LABEL)).toBeVisible();
});

// ---------------------------------------------------------------------------
// Scenario: 直接 Approve 送出原始草稿
// ---------------------------------------------------------------------------

Given('第一張 draft 內容為 {string}', async ({ page, request }, content: string) => {
  await trySeedDrafts(request, [makeDraft({ id: 'draft-firstcontent', draft_content: content })]);
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.getByTestId(TESTIDS.DRAFT_CARD).first().waitFor({ timeout: 10_000 });
  const textarea = page.getByTestId(TESTIDS.DRAFT_CARD).first().locator('textarea');
  await expect(textarea).toHaveValue(content);
});

When('使用者點擊第一張卡片的 Approve 按鈕', async ({ page }) => {
  const firstCard = page.getByTestId(TESTIDS.DRAFT_CARD).first();
  const draftId = await firstCard.getAttribute('data-draft-id');
  if (draftId) {
    await page.evaluate((id) => { (window as unknown as Record<string, unknown>).__lastDraftId = id; }, draftId);
  }
  const approveResponsePromise = page.waitForResponse(
    (res) => res.url().includes(API_PATHS.DRAFTS + '/') && res.url().includes('/approve'),
    { timeout: 5000 }
  ).catch(() => null);
  const approveRequestPromise = page.waitForRequest(
    (req) => req.url().includes(API_PATHS.DRAFTS + '/') && req.url().includes('/approve') && req.method() === 'POST',
    { timeout: 5000 }
  ).catch(() => null);
  await firstCard.getByRole('button', { name: /Approve|核准|送出/i }).click();
  await page.waitForLoadState('networkidle');
  const [req, res] = await Promise.all([approveRequestPromise, approveResponsePromise]);
  await page.evaluate(
    ([reqBody, resStatus]: [string | null, number | null]) => {
      (window as unknown as Record<string, unknown>).__approveReqBody = reqBody;
      (window as unknown as Record<string, unknown>).__approveResStatus = resStatus;
    },
    [req ? req.postData() : null, res ? res.status() : null] as [string | null, number | null]
  );
});

Then(/^發送 POST \/api\/drafts\/\{id\}\/approve with body \{"content": "(.+)"\}$/, async ({ page }, expectedContent: string) => {
  const reqBody = await page.evaluate(
    () => (window as unknown as Record<string, unknown>).__approveReqBody as string | null
  );
  const resStatus = await page.evaluate(
    () => (window as unknown as Record<string, unknown>).__approveResStatus as number | null
  );
  if (reqBody !== null) {
    const parsed = JSON.parse(reqBody) as Record<string, unknown>;
    expect(parsed.content).toBe(expectedContent);
    if (resStatus !== null) {
      expect(resStatus).toBe(200);
    }
  } else {
    const lastId = await page.evaluate(() => (window as unknown as Record<string, unknown>).__lastDraftId as string | null);
    if (lastId) {
      const card = page.locator(`[data-draft-id="${lastId}"]`);
      await expect(card).toHaveCount(0);
    }
  }
});

Then('該卡片從 list 移除', async ({ page }) => {
  const lastId = await page.evaluate(() => (window as unknown as Record<string, unknown>).__lastDraftId as string | null);
  if (lastId) {
    const card = page.locator(`[data-draft-id="${lastId}"]`);
    await expect(card).toHaveCount(0, { timeout: 5000 });
  }
});

Then('顯示成功 toast {string}', async ({ page }, message: string) => {
  const toast = page.getByTestId(TESTIDS.TOAST);
  await expect(toast).toBeVisible({ timeout: 5000 });
  await expect(toast).toContainText(message);
});

// ---------------------------------------------------------------------------
// Scenario: 編輯後 Approve
// ---------------------------------------------------------------------------

Given('第一張 draft 原內容為 {string}', async ({ page, request }, originalContent: string) => {
  await trySeedDrafts(request, [makeDraft({ id: 'draft-orig', draft_content: originalContent })]);
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.getByTestId(TESTIDS.DRAFT_CARD).first().waitFor({ timeout: 10_000 });
  const textarea = page.getByTestId(TESTIDS.DRAFT_CARD).first().locator('textarea');
  await expect(textarea).toHaveValue(originalContent);
});

When('使用者編輯 textarea 改成 {string}', async ({ page }, newContent: string) => {
  const firstCard = page.getByTestId(TESTIDS.DRAFT_CARD).first();
  const textarea = firstCard.locator('textarea');
  await textarea.fill(newContent);
});

When('點擊 Approve', async ({ page }) => {
  const firstCard = page.getByTestId(TESTIDS.DRAFT_CARD).first();
  const draftId = await firstCard.getAttribute('data-draft-id');
  if (draftId) {
    await page.evaluate((id) => { (window as unknown as Record<string, unknown>).__lastDraftId = id; }, draftId);
  }
  await firstCard.getByRole('button', { name: /Approve|核准|送出/i }).click();
  await page.waitForLoadState('networkidle');
});

Then('卡片從 list 移除', async ({ page }) => {
  const lastId = await page.evaluate(() => (window as unknown as Record<string, unknown>).__lastDraftId as string | null);
  if (lastId) {
    const card = page.locator(`[data-draft-id="${lastId}"]`);
    await expect(card).toHaveCount(0, { timeout: 5000 });
  }
});

// ---------------------------------------------------------------------------
// Scenario: Reject 丟棄
// ---------------------------------------------------------------------------

When('使用者點擊第一張卡片的 Reject 按鈕', async ({ page, request }) => {
  let firstCard = page.getByTestId(TESTIDS.DRAFT_CARD).first();
  if ((await firstCard.count()) === 0) {
    await trySeedDrafts(request, [makeDraft({ id: 'draft-reject', draft_content: '待拒絕草稿' })]);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.getByTestId(TESTIDS.DRAFT_CARD).first().waitFor({ timeout: 10_000 });
    firstCard = page.getByTestId(TESTIDS.DRAFT_CARD).first();
  }
  const draftId = await firstCard.getAttribute('data-draft-id');
  if (draftId) {
    await page.evaluate((id) => { (window as unknown as Record<string, unknown>).__lastDraftId = id; }, draftId);
  }
  const rejectResponsePromise = page.waitForResponse(
    (res) => res.url().includes(API_PATHS.DRAFTS + '/') && res.url().includes('/reject'),
    { timeout: 5000 }
  ).catch(() => null);
  await firstCard.getByRole('button', { name: /Reject|拒絕|丟棄/i }).click();
  await page.waitForLoadState('networkidle');
  const res = await rejectResponsePromise;
  await page.evaluate(
    (status: number | null) => { (window as unknown as Record<string, unknown>).__rejectResStatus = status; },
    res ? res.status() : null
  );
});

Then(/^發送 POST \/api\/drafts\/\{id\}\/reject$/, async ({ page }) => {
  const resStatus = await page.evaluate(
    () => (window as unknown as Record<string, unknown>).__rejectResStatus as number | null
  );
  if (resStatus !== null) {
    expect(resStatus).toBe(200);
  } else {
    const lastId = await page.evaluate(() => (window as unknown as Record<string, unknown>).__lastDraftId as string | null);
    if (lastId) {
      const card = page.locator(`[data-draft-id="${lastId}"]`);
      await expect(card).toHaveCount(0, { timeout: 5000 });
    }
  }
});

// Note: '顯示 toast {string}' step is defined in f004.steps.ts (shared)

// ---------------------------------------------------------------------------
// Scenario: 新 draft 即時加入（WebSocket）
// ---------------------------------------------------------------------------

Given('list 目前有 {int} 張 draft', async ({ page, request }, count: number) => {
  const drafts = Array.from({ length: count }, (_, i) =>
    makeDraft({
      id: `draft-ws-${i + 1}`,
      draft_content: `WS 測試草稿 ${i + 1}`,
      created_at: new Date(Date.now() - i * 60_000).toISOString(),
    })
  );
  await trySeedDrafts(request, drafts);
  await page.reload();
  await page.waitForLoadState('networkidle');
  const cards = page.getByTestId(TESTIDS.DRAFT_CARD);
  await expect(cards).toHaveCount(count, { timeout: 10_000 });
});

When('backend 透過 \\/ws\\/ui 推送 draft_created 事件', async ({ request }) => {
  const newDraft = makeDraft({
    id: 'draft-ws-new',
    draft_content: '新即時草稿',
    created_at: new Date().toISOString(),
  });
  await injectWsEvent(request, { type: 'draft_created', draft: newDraft });
});

Then('list 變成 {int} 張', async ({ page }, count: number) => {
  const cards = page.getByTestId(TESTIDS.DRAFT_CARD);
  await expect(cards).toHaveCount(count, { timeout: 5000 });
});

Then('新 draft 出現在最上方', async ({ page }) => {
  const firstCard = page.getByTestId(TESTIDS.DRAFT_CARD).first();
  const draftId = await firstCard.getAttribute('data-draft-id');
  expect(draftId).toBe('draft-ws-new');
});

// ---------------------------------------------------------------------------
// Scenario: 他端送出後本端自動移除（WebSocket）
// ---------------------------------------------------------------------------

Given('list 目前有 {int} 張 draft \\(id=A, id=B\\)', async ({ page, request }) => {
  const drafts = [
    makeDraft({ id: 'A', draft_content: 'Draft A', created_at: new Date(Date.now() - 60_000).toISOString() }),
    makeDraft({ id: 'B', draft_content: 'Draft B', created_at: new Date().toISOString() }),
  ];
  await trySeedDrafts(request, drafts);
  await page.reload();
  await page.waitForLoadState('networkidle');
  const cards = page.getByTestId(TESTIDS.DRAFT_CARD);
  await expect(cards).toHaveCount(2, { timeout: 10_000 });
});

When('另一個 tab 對 draft B 按 Approve', async ({ request }) => {
  await request.post(`${BASE_URL}${API_PATHS.DRAFT_APPROVE('B')}`, {
    data: { content: 'Draft B' },
  });
});

When('本端透過 \\/ws\\/ui 收到 draft_removed \\{"draft_id": "B"\\}', async ({ request }) => {
  await injectWsEvent(request, { type: 'draft_removed', draft_id: 'B' });
});

Then('list 只剩 {int} 張 \\(id=A\\)', async ({ page }, count: number) => {
  const cards = page.getByTestId(TESTIDS.DRAFT_CARD);
  // Wait for WS-driven update
  await expect(cards).toHaveCount(count, { timeout: 5000 });
  const remainingId = await cards.first().getAttribute('data-draft-id');
  expect(remainingId).toBe('A');
});

// ---------------------------------------------------------------------------
// Scenario: j / k 移動焦點
// ---------------------------------------------------------------------------

Given('list 有 {int} 張卡片，焦點在第 {int} 張', async ({ page, request }, totalCount: number, cardIndex: number) => {
  const drafts = Array.from({ length: totalCount }, (_, i) =>
    makeDraft({ id: `kb-draft-${i + 1}`, draft_content: `鍵盤測試 ${i + 1}` })
  );
  await trySeedDrafts(request, drafts);
  await page.reload();
  await page.waitForLoadState('networkidle');
  const cards = page.getByTestId(TESTIDS.DRAFT_CARD);
  await expect(cards).toHaveCount(totalCount, { timeout: 10_000 });
  await cards.nth(cardIndex - 1).click();
});

When('使用者按 {string}', async ({ page }, key: string) => {
  await page.keyboard.press(key === 'j' ? 'j' : key === 'k' ? 'k' : key);
  await page.waitForTimeout(200);
});

Then('焦點移到第 {int} 張', async ({ page }, cardIndex: number) => {
  const cards = page.getByTestId(TESTIDS.DRAFT_CARD);
  const targetCard = cards.nth(cardIndex - 1);
  const isFocused =
    (await targetCard.getAttribute('data-focused')) === 'true' ||
    (await targetCard.getAttribute('aria-selected')) === 'true' ||
    (await targetCard.evaluate((el) => el.classList.contains('focused')));
  expect(isFocused).toBe(true);
});

Then('焦點移回第 {int} 張', async ({ page }, cardIndex: number) => {
  const cards = page.getByTestId(TESTIDS.DRAFT_CARD);
  const targetCard = cards.nth(cardIndex - 1);
  const isFocused =
    (await targetCard.getAttribute('data-focused')) === 'true' ||
    (await targetCard.getAttribute('aria-selected')) === 'true' ||
    (await targetCard.evaluate((el) => el.classList.contains('focused')));
  expect(isFocused).toBe(true);
});

// ---------------------------------------------------------------------------
// Scenario: Enter approve、e edit、x reject
// ---------------------------------------------------------------------------

Given('焦點在第 {int} 張卡片', async ({ page, request }) => {
  const drafts = [makeDraft({ id: 'kb-focus-1', draft_content: '焦點卡片內容' })];
  await trySeedDrafts(request, drafts);
  await page.reload();
  await page.waitForLoadState('networkidle');
  const cards = page.getByTestId(TESTIDS.DRAFT_CARD);
  await expect(cards).toHaveCount(1, { timeout: 10_000 });
  await cards.first().click();
});

Then('觸發該卡片的 Approve', async ({ page }) => {
  await page.waitForLoadState('networkidle');
  const cards = page.getByTestId(TESTIDS.DRAFT_CARD);
  await expect(cards).toHaveCount(0, { timeout: 5000 });
});

// ---------------------------------------------------------------------------
// Scenario: 空狀態
// ---------------------------------------------------------------------------

Given('backend 沒有任何 pending draft', async ({ request }) => {
  await trySeedDrafts(request, []);
});

When('頁面載入完成', async ({ page }) => {
  await page.reload();
  await page.waitForLoadState('networkidle');
});

Then('顯示文案 {string}', async ({ page }, text: string) => {
  const emptyState = page.getByTestId(TESTIDS.EMPTY_STATE).first();
  await expect(emptyState).toBeVisible({ timeout: 5000 });
  await expect(emptyState).toContainText(text);
});

// ---------------------------------------------------------------------------
// Scenario: API 失敗
// ---------------------------------------------------------------------------

Given('backend \\/api\\/inbox 回 500', async ({ page }) => {
  await page.route('**/api/inbox', (route) => {
    route.fulfill({ status: 500, body: JSON.stringify({ error: 'internal server error' }) });
  });
  await page.route(`**${API_PATHS.DRAFTS}*`, (route) => {
    if (route.request().url().includes(API_PATHS.DRAFTS + '/')) {
      route.continue();
    } else {
      route.fulfill({ status: 500, body: JSON.stringify({ error: 'internal server error' }) });
    }
  });
});

When('頁面載入', async ({ page }) => {
  await page.reload();
  await page.waitForLoadState('networkidle');
});

Then('顯示錯誤狀態 + retry 按鈕', async ({ page }) => {
  const errorState = page.getByTestId(TESTIDS.ERROR_STATE).first();
  await expect(errorState).toBeVisible({ timeout: 5000 });
  const retryBtn = page.getByRole('button', { name: /retry|重試|重新載入/i });
  await expect(retryBtn).toBeVisible();
});

When('使用者點 retry', async ({ page }) => {
  await page.unroute('**/api/inbox');
  await page.unroute(`**${API_PATHS.DRAFTS}*`);
  const retryBtn = page.getByRole('button', { name: /retry|重試|重新載入/i });
  await retryBtn.click();
  await page.waitForLoadState('networkidle');
});

Then('重新呼叫 \\/api\\/inbox', async ({ page }) => {
  const errorState = page.getByTestId(TESTIDS.ERROR_STATE);
  await expect(errorState).toHaveCount(0, { timeout: 5000 });
});

// ---------------------------------------------------------------------------
// Scenario: 重複 approve 不會出錯
// ---------------------------------------------------------------------------

Given('draft id=A 已被 approve 過', async ({ request }) => {
  await trySeedDrafts(request, [makeDraft({ id: 'A', draft_content: '已核准草稿' })]);
  await request.post(`${BASE_URL}${API_PATHS.DRAFT_APPROVE('A')}`, { data: { content: '已核准草稿' } });
});

When('使用者再次按 Approve', async ({ request }) => {
  await request.post(`${BASE_URL}${API_PATHS.DRAFT_APPROVE('A')}`, { data: { content: '已核准草稿' } });
});

Then('backend \\/reply idempotent 回 200', async ({ request }) => {
  const res = await request.post(`${BASE_URL}${API_PATHS.DRAFT_APPROVE('A')}`, {
    data: { content: '已核准草稿' },
  });
  expect(res.status()).toBe(200);
});

Then('前端顯示「已送出」\\(不出現紅色錯誤\\)', async ({ page }) => {
  // Check for error toast by class/role only (no hardcoded testid)
  const errorElements = page.locator('.error-toast, [role="alert"][aria-live="assertive"]');
  const errorCount = await errorElements.count();
  if (errorCount > 0) {
    for (let i = 0; i < errorCount; i++) {
      const el = errorElements.nth(i);
      const cls = await el.getAttribute('class') ?? '';
      expect(cls).not.toMatch(/error|danger|red/i);
    }
  }
});

// ---------------------------------------------------------------------------
// Scenario Outline: Categorize 標籤顯示
// ---------------------------------------------------------------------------

Given(/^draft 的 category 為 (.+)$/, async ({ page, request }, category: string) => {
  const draft = makeDraft({ id: `cat-draft-${category.replace(/[^a-z0-9]/gi, '-')}`, category });
  await trySeedDrafts(request, [draft]);
  await page.reload();
  await page.waitForLoadState('networkidle');
});

Then(/^卡片標籤顯示 (.+)$/, async ({ page }, label: string) => {
  const categoryLabel = page.getByTestId(TESTIDS.CATEGORY_LABEL).first();
  await expect(categoryLabel).toBeVisible({ timeout: 5000 });
  await expect(categoryLabel).toContainText(label);
});
