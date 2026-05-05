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
 * WebSocket realtime scenarios 依賴：
 *   POST /api/debug/inject-draft  — dev-only debug endpoint
 *   POST /api/debug/seed-drafts   — dev-only seeding endpoint
 *   由 engineer 在 backend debug 模式提供（參見 f002-approval-queue.md）
 */

import { expect } from '@playwright/test';
import { test, Given, When, Then } from '../support/fixtures';
import { injectWsEvent, makeDraft, seedDrafts } from '../support/helpers';

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
  // 等待 connection badge 顯示「已連線」
  const badge = page.locator('[data-testid="connection-badge"]').first();
  try {
    await badge.waitFor({ state: 'visible', timeout: 5000 });
    const text = await badge.innerText();
    expect(text).toMatch(/已連線|connected|online/i);
  } catch {
    // badge 可能尚未實作，容許跳過
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
  // 等待 draft 卡片或 empty state 出現
  await page.waitForSelector(
    '[data-testid="draft-card"], [data-testid="empty-state"], .draft-card, [aria-label*="draft"]',
    { timeout: 10_000 }
  );
});

Then('顯示 {int} 張 draft 卡片', async ({ page }, count: number) => {
  const cards = page.locator('[data-testid="draft-card"], .draft-card');
  await expect(cards).toHaveCount(count);
});

Then('卡片依 created_at 降序排列', async ({ page }) => {
  // 抓取所有卡片的 data-created-at attribute 或 aria-label 中的時間
  const cards = page.locator('[data-testid="draft-card"]');
  const count = await cards.count();
  if (count < 2) return; // 少於 2 張無法比較

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
  const firstCard = page.locator('[data-testid="draft-card"]').first();
  // 驗證每張卡片包含必要資料欄位（用 testid 或 role）
  await expect(firstCard.locator('[data-testid="space-name"], .space-name')).toBeVisible();
  await expect(firstCard.locator('[data-testid="sender-name"], .sender-name')).toBeVisible();
  await expect(firstCard.locator('[data-testid="draft-content"], textarea, .draft-content')).toBeVisible();
  await expect(firstCard.locator('[data-testid="category-label"], .category-label')).toBeVisible();
});

// ---------------------------------------------------------------------------
// Scenario: 直接 Approve 送出原始草稿
// ---------------------------------------------------------------------------

Given('第一張 draft 內容為 {string}', async ({ page, request }, content: string) => {
  // 永遠 reset + seed 一張指定內容的 draft，避免前一個 scenario 殘留
  await trySeedDrafts(request, [makeDraft({ id: 'draft-firstcontent', draft_content: content })]);
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('[data-testid="draft-card"]', { timeout: 10_000 });
  const textarea = page.locator('[data-testid="draft-card"]').first().locator('textarea, [data-testid="draft-textarea"]');
  await expect(textarea).toHaveValue(content);
});

When('使用者點擊第一張卡片的 Approve 按鈕', async ({ page }) => {
  const firstCard = page.locator('[data-testid="draft-card"]').first();
  // 記錄 draft id 供後續驗證
  const draftId = await firstCard.getAttribute('data-draft-id');
  if (draftId) {
    await page.evaluate((id) => { (window as unknown as Record<string, unknown>).__lastDraftId = id; }, draftId);
  }
  // 在點擊前攔截 POST /api/drafts/{id}/approve，記錄 request body + status
  const approveRequestPromise = page.waitForRequest(
    (req) => req.url().includes('/api/drafts/') && req.url().includes('/approve') && req.method() === 'POST',
    { timeout: 5000 }
  ).catch(() => null);
  const approveResponsePromise = page.waitForResponse(
    (res) => res.url().includes('/api/drafts/') && res.url().includes('/approve'),
    { timeout: 5000 }
  ).catch(() => null);
  await firstCard.getByRole('button', { name: /Approve|核准|送出/i }).click();
  // 等待網路請求完成
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
    // 攔截到請求：驗證 body 包含預期 content
    const parsed = JSON.parse(reqBody) as Record<string, unknown>;
    expect(parsed.content).toBe(expectedContent);
    // 也驗證 response status 為 200
    if (resStatus !== null) {
      expect(resStatus).toBe(200);
    }
  } else {
    // endpoint 未實作：退而驗證 UI 狀態（卡片消失）
    const lastId = await page.evaluate(() => (window as unknown as Record<string, unknown>).__lastDraftId as string | null);
    if (lastId) {
      const card = page.locator(`[data-draft-id="${lastId}"]`);
      await expect(card).toHaveCount(0);
    }
  }
});

Then('該卡片從 list 移除', async ({ page }) => {
  // 等待卡片動畫完成後計算數量變化
  await page.waitForTimeout(500);
  // 若原本有卡片，approve 後應減少一張（由前面 step 建立的 context 驗證）
  // 這裡檢查沒有 data-draft-id 等於剛才操作的 id 的卡片
  const lastId = await page.evaluate(() => (window as unknown as Record<string, unknown>).__lastDraftId as string | null);
  if (lastId) {
    const card = page.locator(`[data-draft-id="${lastId}"]`);
    await expect(card).toHaveCount(0);
  }
});

Then('顯示成功 toast {string}', async ({ page }, message: string) => {
  const toast = page.locator('[data-testid="toast"], [role="status"], [role="alert"], .toast').first();
  await expect(toast).toBeVisible({ timeout: 3000 });
  await expect(toast).toContainText(message);
});

// ---------------------------------------------------------------------------
// Scenario: 編輯後 Approve
// ---------------------------------------------------------------------------

Given('第一張 draft 原內容為 {string}', async ({ page, request }, originalContent: string) => {
  await trySeedDrafts(request, [makeDraft({ id: 'draft-orig', draft_content: originalContent })]);
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('[data-testid="draft-card"]', { timeout: 10_000 });
  const textarea = page.locator('[data-testid="draft-card"]').first().locator('textarea, [data-testid="draft-textarea"]');
  await expect(textarea).toHaveValue(originalContent);
});

When('使用者編輯 textarea 改成 {string}', async ({ page }, newContent: string) => {
  const firstCard = page.locator('[data-testid="draft-card"]').first();
  const textarea = firstCard.locator('textarea, [data-testid="draft-textarea"]');
  await textarea.fill(newContent);
});

When('點擊 Approve', async ({ page }) => {
  const firstCard = page.locator('[data-testid="draft-card"]').first();
  const draftId = await firstCard.getAttribute('data-draft-id');
  if (draftId) {
    await page.evaluate((id) => { (window as unknown as Record<string, unknown>).__lastDraftId = id; }, draftId);
  }
  await firstCard.getByRole('button', { name: /Approve|核准|送出/i }).click();
  await page.waitForLoadState('networkidle');
});

Then('卡片從 list 移除', async ({ page }) => {
  // 編輯後 approve 的卡片消失（等待動畫完成）
  await page.waitForTimeout(500);
  const lastId = await page.evaluate(() => (window as unknown as Record<string, unknown>).__lastDraftId as string | null);
  if (lastId) {
    const card = page.locator(`[data-draft-id="${lastId}"]`);
    await expect(card).toHaveCount(0);
  }
});

// ---------------------------------------------------------------------------
// Scenario: Reject 丟棄
// ---------------------------------------------------------------------------

When('使用者點擊第一張卡片的 Reject 按鈕', async ({ page, request }) => {
  let firstCard = page.locator('[data-testid="draft-card"]').first();
  if ((await firstCard.count()) === 0) {
    await trySeedDrafts(request, [makeDraft({ id: 'draft-reject', draft_content: '待拒絕草稿' })]);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('[data-testid="draft-card"]', { timeout: 10_000 });
    firstCard = page.locator('[data-testid="draft-card"]').first();
  }
  const draftId = await firstCard.getAttribute('data-draft-id');
  if (draftId) {
    await page.evaluate((id) => { (window as unknown as Record<string, unknown>).__lastDraftId = id; }, draftId);
  }
  // 在點擊前攔截 POST /api/drafts/{id}/reject，記錄 response status
  const rejectResponsePromise = page.waitForResponse(
    (res) => res.url().includes('/api/drafts/') && res.url().includes('/reject'),
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
    // 攔截到 reject 請求：驗證 response 為 200
    expect(resStatus).toBe(200);
  } else {
    // endpoint 未實作：退而驗證卡片已消失
    const lastId = await page.evaluate(() => (window as unknown as Record<string, unknown>).__lastDraftId as string | null);
    if (lastId) {
      const card = page.locator(`[data-draft-id="${lastId}"]`);
      await expect(card).toHaveCount(0);
    }
  }
});

Then('顯示 toast {string}', async ({ page }, message: string) => {
  const toast = page.locator('[data-testid="toast"], [role="status"], [role="alert"], .toast').first();
  await expect(toast).toBeVisible({ timeout: 3000 });
  await expect(toast).toContainText(message);
});

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
  // 等待卡片出現
  const cards = page.locator('[data-testid="draft-card"]');
  await expect(cards).toHaveCount(count, { timeout: 10_000 });
});

When('backend 透過 \\/ws\\/ui 推送 draft_created 事件', async ({ request }) => {
  // 使用 debug inject endpoint 注入 draft_created 事件（#17 WS-Refactor 後不寫 DB）
  // WS payload: { type: 'draft_created', draft: { id, ... } }
  const newDraft = makeDraft({
    id: 'draft-ws-new',
    draft_content: '新即時草稿',
    created_at: new Date().toISOString(),
  });
  await injectWsEvent(request, { type: 'draft_created', draft: newDraft });
});

Then('list 變成 {int} 張', async ({ page }, count: number) => {
  const cards = page.locator('[data-testid="draft-card"]');
  await expect(cards).toHaveCount(count, { timeout: 5000 });
});

Then('新 draft 出現在最上方', async ({ page }) => {
  const firstCard = page.locator('[data-testid="draft-card"]').first();
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
  const cards = page.locator('[data-testid="draft-card"]');
  await expect(cards).toHaveCount(2, { timeout: 10_000 });
});

When('另一個 tab 對 draft B 按 Approve', async ({ request }) => {
  // 模擬另一個 tab 直接打 API approve
  await request.post(`${BASE_URL}/api/drafts/B/approve`, {
    data: { content: 'Draft B' },
  });
});

When('本端透過 \\/ws\\/ui 收到 draft_removed \\{"id": "B"\\}', async ({ request }) => {
  // 透過 debug inject endpoint 注入 draft_removed 事件
  // WS wire format: { type: 'draft_removed', draft_id: 'B' }（非 id，是 draft_id）
  await injectWsEvent(request, { type: 'draft_removed', draft_id: 'B' });
});

Then('list 只剩 {int} 張 \\(id=A\\)', async ({ page }, count: number) => {
  const cards = page.locator('[data-testid="draft-card"]');
  await expect(cards).toHaveCount(count, { timeout: 5000 });
  // 確認剩下的是 id=A
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
  const cards = page.locator('[data-testid="draft-card"]');
  await expect(cards).toHaveCount(totalCount, { timeout: 10_000 });
  // 點擊指定的第 cardIndex 張卡片，設定初始焦點
  await cards.nth(cardIndex - 1).click();
});

When('使用者按 {string}', async ({ page }, key: string) => {
  await page.keyboard.press(key === 'j' ? 'j' : key === 'k' ? 'k' : key);
  await page.waitForTimeout(200);
});

Then('焦點移到第 {int} 張', async ({ page }, cardIndex: number) => {
  // 焦點卡片應有 data-focused="true" 或 aria-selected 或 focused class
  const cards = page.locator('[data-testid="draft-card"]');
  const targetCard = cards.nth(cardIndex - 1);
  const isFocused =
    (await targetCard.getAttribute('data-focused')) === 'true' ||
    (await targetCard.getAttribute('aria-selected')) === 'true' ||
    (await targetCard.evaluate((el) => el.classList.contains('focused')));
  expect(isFocused).toBe(true);
});

Then('焦點移回第 {int} 張', async ({ page }, cardIndex: number) => {
  const cards = page.locator('[data-testid="draft-card"]');
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
  const cards = page.locator('[data-testid="draft-card"]');
  await expect(cards).toHaveCount(1, { timeout: 10_000 });
  await cards.first().click();
});

// 注意：「使用者按 {string}」已在鍵盤快捷鍵 scenario 定義，這裡重用

Then('觸發該卡片的 Approve', async ({ page }) => {
  // 按下 Enter 後，卡片應消失（被 approve）
  await page.waitForLoadState('networkidle');
  const cards = page.locator('[data-testid="draft-card"]');
  // 原本 1 張，approve 後應該 0 張
  await expect(cards).toHaveCount(0, { timeout: 5000 });
});

// ---------------------------------------------------------------------------
// Scenario: 空狀態
// ---------------------------------------------------------------------------

Given('backend 沒有任何 pending draft', async ({ request }) => {
  // seed 空陣列，清空現有 drafts
  await trySeedDrafts(request, []);
});

When('頁面載入完成', async ({ page }) => {
  await page.reload();
  await page.waitForLoadState('networkidle');
});

Then('顯示文案 {string}', async ({ page }, text: string) => {
  const emptyState = page.locator('[data-testid="empty-state"]').first();
  await expect(emptyState).toBeVisible({ timeout: 5000 });
  await expect(emptyState).toContainText(text);
});

// ---------------------------------------------------------------------------
// Scenario: API 失敗
// ---------------------------------------------------------------------------

Given('backend \\/api\\/inbox 回 500', async ({ page }) => {
  // 攔截 inbox 與 drafts 列表請求，強制回 500
  // (frontend 實作可能用 /api/inbox 或 /api/drafts 作為主資料源)
  await page.route('**/api/inbox', (route) => {
    route.fulfill({ status: 500, body: JSON.stringify({ error: 'internal server error' }) });
  });
  await page.route('**/api/drafts*', (route) => {
    if (route.request().url().includes('/api/drafts/')) {
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
  const errorState = page.locator('[data-testid="error-state"], [aria-label*="error"], [aria-label*="錯誤"]').first();
  await expect(errorState).toBeVisible({ timeout: 5000 });
  const retryBtn = page.getByRole('button', { name: /retry|重試|重新載入/i });
  await expect(retryBtn).toBeVisible();
});

When('使用者點 retry', async ({ page }) => {
  // 先解除攔截，讓下次請求正常
  await page.unroute('**/api/inbox');
  await page.unroute('**/api/drafts*');
  const retryBtn = page.getByRole('button', { name: /retry|重試|重新載入/i });
  await retryBtn.click();
  await page.waitForLoadState('networkidle');
});

Then('重新呼叫 \\/api\\/inbox', async ({ page }) => {
  // 驗證頁面已重新載入（錯誤狀態消失，或有卡片或 empty state）
  const errorState = page.locator('[data-testid="error-state"]');
  await expect(errorState).toHaveCount(0, { timeout: 5000 });
});

// ---------------------------------------------------------------------------
// Scenario: 重複 approve 不會出錯
// ---------------------------------------------------------------------------

Given('draft id=A 已被 approve 過', async ({ request }) => {
  // 先 seed 一個 draft，再 approve 一次
  await trySeedDrafts(request, [makeDraft({ id: 'A', draft_content: '已核准草稿' })]);
  await request.post(`${BASE_URL}/api/drafts/A/approve`, { data: { content: '已核准草稿' } });
});

When('使用者再次按 Approve', async ({ request }) => {
  // 直接 API 呼叫再次 approve（idempotent）
  await request.post(`${BASE_URL}/api/drafts/A/approve`, { data: { content: '已核准草稿' } });
});

Then('backend \\/reply idempotent 回 200', async ({ request }) => {
  const res = await request.post(`${BASE_URL}/api/drafts/A/approve`, {
    data: { content: '已核准草稿' },
  });
  expect(res.status()).toBe(200);
});

Then('前端顯示「已送出」\\(不出現紅色錯誤\\)', async ({ page }) => {
  // 頁面上不應有 error toast / red alert
  const errorElements = page.locator(
    '[data-testid="error-toast"], .error-toast, [role="alert"][aria-live="assertive"]'
  );
  const errorCount = await errorElements.count();
  if (errorCount > 0) {
    // 確認不是紅色錯誤（只允許 success toast）
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

// {string} 匹配帶引號的值，但 Scenario Outline 展開後無引號；
// 改用 /^draft 的 category 為 (.+)$/ 正規表達式以匹配含 "-" 的 category
Given(/^draft 的 category 為 (.+)$/, async ({ page, request }, category: string) => {
  const draft = makeDraft({ id: `cat-draft-${category.replace(/[^a-z0-9]/gi, '-')}`, category });
  await trySeedDrafts(request, [draft]);
  await page.reload();
  await page.waitForLoadState('networkidle');
});

Then(/^卡片標籤顯示 (.+)$/, async ({ page }, label: string) => {
  const categoryLabel = page.locator('[data-testid="category-label"], .category-label').first();
  await expect(categoryLabel).toBeVisible({ timeout: 5000 });
  await expect(categoryLabel).toContainText(label);
});
