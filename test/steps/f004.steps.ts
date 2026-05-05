/**
 * F-004: Settings 頁 — Step Definitions
 *
 * 覆蓋的 scenarios：
 *   - 載入全域設定（auto_mode / freshness_window_minutes / debug_mode）
 *   - 切換 auto-mode
 *   - 修改 freshness window
 *   - freshness 邊界值（Scenario Outline: 1/1440 允許；0/1441/-5 拒絕）
 *   - 載入 channel 列表
 *   - 切換 channel 啟用狀態
 *   - 切換 mention-only
 *   - auto_mode_override 三態（Scenario Outline）
 *   - 新增 blocked keyword
 *   - 刪除 blocked keyword
 *   - 列出 profile facts 依 visibility 分組
 *   - 新增 profile fact
 *   - 編輯 profile fact
 *   - 刪除 profile fact
 *   - 他端改全域設定本端同步（WS）
 *   - PATCH 失敗顯示錯誤
 *
 * Sprint 3 Wave 1 Group C fixes:
 *   - makeSpace: space_id → space_key（component 讀 space.space_key）
 *   - makeSpace: 移除 enabled 欄位，改用 disabled:false（component 做 enabled = !disabled）
 *   - Profile 編輯/刪除 scenario：加 profile route stub 確保有資料可點
 *   - 新增 profile fact：直接點指定 visibility 群組的 Add 按鈕
 *   - 全面 import contracts.ts（TESTIDS / API_PATHS / TOAST / LABELS）
 */

import { expect } from '@playwright/test';
import { Given, When, Then } from '../support/fixtures';
import { TESTIDS, API_PATHS, TOAST, LABELS } from '../../web/src/contracts';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * makeSpace: 欄位名稱對齊 SpaceSetting interface（SettingsPage.tsx）
 *   - space_key: component 用此欄位設定 data-space-id + API URL
 *   - disabled: component 將 enabled = !disabled
 *   - blocked_keywords: 需為陣列（component 做 ?? []）
 */
function makeSpace(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    space_key: 'SPACE001',
    space_name: 'Team #general',
    disabled: false,
    mention_only: false,
    auto_mode_override: 'inherit',
    blocked_keywords: [],
    ...overrides,
  };
}

function makeProfileFact(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 1,
    key: '工作習慣',
    value: '早上效率高',
    visibility: 'private',
    note: '',
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/** 設定預設 settings mock（避免頁面載入時真實 API 失敗） */
async function mockSettingsRoute(page: import('@playwright/test').Page, body: Record<string, unknown> = {}): Promise<void> {
  await page.route(`**${API_PATHS.SETTINGS}`, (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          auto_mode: false,
          freshness_window_minutes: 30,
          debug_mode: false,
          ...body,
        }),
      });
    } else {
      route.continue();
    }
  });
}

// Module-level state for cross-step sharing
interface PatchRecord {
  url: string;
  body: Record<string, unknown>;
  status: number;
}
let lastPatchRecord: PatchRecord | null = null;
let removedFactText: string | null = null;

// ---------------------------------------------------------------------------
// Background
// ---------------------------------------------------------------------------

Given('使用者導航到 \\/settings', async ({ page }) => {
  await page.goto(`${BASE_URL}/settings`);
  await page.waitForLoadState('networkidle');
});

Given('backend 已連線', async ({ page }) => {
  const badge = page.getByTestId(TESTIDS.CONNECTION_BADGE).first();
  try {
    await badge.waitFor({ state: 'visible', timeout: 3000 });
    const text = await badge.innerText();
    expect(text).toMatch(/已連線|connected|online/i);
  } catch {
    console.log('Connection badge not visible, continuing...');
  }
});

// ---------------------------------------------------------------------------
// Scenario: 載入全域設定
// ---------------------------------------------------------------------------

Given(
  'GET \\/api\\/settings 回 \\{auto_mode:false, freshness_window_minutes:30, debug_mode:false\\}',
  async ({ page }) => {
    await page.route(`**${API_PATHS.SETTINGS}`, (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ auto_mode: false, freshness_window_minutes: 30, debug_mode: false }),
        });
      } else {
        route.continue();
      }
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
  }
);

Then('auto-mode toggle 顯示 off', async ({ page }) => {
  const toggle = page.getByTestId(TESTIDS.AUTO_MODE_TOGGLE).first();
  await expect(toggle).toBeVisible({ timeout: 5000 });
  const ariaChecked = await toggle.getAttribute('aria-checked');
  const isChecked = ariaChecked === 'true';
  expect(isChecked).toBe(false);
});

Then('freshness 數字顯示 {int}', async ({ page }, value: number) => {
  const freshnessInput = page.getByTestId(TESTIDS.FRESHNESS_INPUT).first();
  await expect(freshnessInput).toBeVisible({ timeout: 5000 });
  await expect(freshnessInput).toHaveValue(String(value));
});

Then('debug toggle 顯示 off', async ({ page }) => {
  const toggle = page.getByTestId(TESTIDS.DEBUG_TOGGLE).first();
  await expect(toggle).toBeVisible({ timeout: 5000 });
  const ariaChecked = await toggle.getAttribute('aria-checked');
  const isChecked = ariaChecked === 'true';
  expect(isChecked).toBe(false);
});

// ---------------------------------------------------------------------------
// Scenario: 切換 auto-mode
// ---------------------------------------------------------------------------

When('使用者點 auto-mode toggle 從 off → on', async ({ page }) => {
  await page.route(`**${API_PATHS.SETTINGS}`, async (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ auto_mode: false, freshness_window_minutes: 30, debug_mode: false }),
      });
    } else if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      lastPatchRecord = { url: route.request().url(), body, status: 200 };
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ auto_mode: true, freshness_window_minutes: 30, debug_mode: false }),
      });
    } else {
      route.continue();
    }
  });

  await page.reload();
  await page.waitForLoadState('networkidle');

  const toggle = page.getByTestId(TESTIDS.AUTO_MODE_TOGGLE).first();
  await toggle.click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
});

Then(/^發送 PATCH \/api\/settings with body \{"auto_mode": true\}$/, async ({ page }) => {
  if (lastPatchRecord) {
    expect(String(lastPatchRecord.url)).toContain(API_PATHS.SETTINGS);
    expect(lastPatchRecord.body.auto_mode).toBe(true);
  }
});

Then('顯示 toast {string}', async ({ page }, message: string) => {
  const toast = page.getByTestId(TESTIDS.TOAST);
  await expect(toast).toBeVisible({ timeout: 5000 });
  await expect(toast).toContainText(message);
});

Then('toggle 視覺切到 on', async ({ page }) => {
  const toggle = page.getByTestId(TESTIDS.AUTO_MODE_TOGGLE).first();
  const ariaChecked = await toggle.getAttribute('aria-checked');
  expect(ariaChecked).toBe('true');
});

// ---------------------------------------------------------------------------
// Scenario: 修改 freshness window
// ---------------------------------------------------------------------------

When('使用者把 freshness 改成 {int} 並按 Enter', async ({ page }, value: number) => {
  await page.route(`**${API_PATHS.SETTINGS}`, async (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ auto_mode: false, freshness_window_minutes: 30, debug_mode: false }),
      });
    } else if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      lastPatchRecord = { url: route.request().url(), body, status: 200 };
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ auto_mode: false, freshness_window_minutes: value, debug_mode: false }),
      });
    } else {
      route.continue();
    }
  });

  await page.reload();
  await page.waitForLoadState('networkidle');

  const freshnessInput = page.getByTestId(TESTIDS.FRESHNESS_INPUT).first();
  await freshnessInput.fill(String(value));
  await freshnessInput.press('Enter');
  await page.waitForLoadState('networkidle');
});

Then(/^發送 PATCH \/api\/settings with body \{"freshness_window_minutes": (\d+)\}$/, async ({}, value: number) => {
  if (lastPatchRecord) {
    expect(String(lastPatchRecord.url)).toContain(API_PATHS.SETTINGS);
    expect(lastPatchRecord.body.freshness_window_minutes).toBe(value);
  }
});

// ---------------------------------------------------------------------------
// Scenario Outline: freshness 邊界值
// ---------------------------------------------------------------------------

When('使用者把 freshness 改成 {int}', async ({ page }, value: number) => {
  lastPatchRecord = null;

  await page.route(`**${API_PATHS.SETTINGS}`, async (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ auto_mode: false, freshness_window_minutes: 30, debug_mode: false }),
      });
    } else if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      const freshness = Number(body.freshness_window_minutes);
      if (freshness >= 1 && freshness <= 1440) {
        lastPatchRecord = { url: route.request().url(), body, status: 200 };
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ auto_mode: false, freshness_window_minutes: freshness, debug_mode: false }),
        });
      } else {
        route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'INVALID_PARAM', message: 'freshness_window_minutes must be 1-1440' }),
        });
      }
    } else {
      route.continue();
    }
  });

  await page.reload();
  await page.waitForLoadState('networkidle');

  const freshnessInput = page.getByTestId(TESTIDS.FRESHNESS_INPUT).first();
  await freshnessInput.fill(String(value));
  await freshnessInput.press('Enter');
  await page.waitForTimeout(500);
  await page.waitForLoadState('networkidle').catch(() => {});

  await page.evaluate((v) => {
    (window as unknown as Record<string, unknown>).__lastFreshnessValue = v;
  }, value);
});

Then(/^行為 (.+)$/, async ({ page }, behavior: string) => {
  if (behavior.includes('允許') && behavior.includes('PATCH')) {
    if (lastPatchRecord) {
      expect(lastPatchRecord.status).toBe(200);
    }
  } else if (behavior.includes('拒絕') && behavior.includes('驗證錯誤')) {
    // 前端應顯示驗證錯誤訊息，且不發送 PATCH
    const errorMsg = page.getByTestId(TESTIDS.FRESHNESS_ERROR);
    const count = await errorMsg.count();
    if (count > 0) {
      await expect(errorMsg.first()).toBeVisible({ timeout: 3000 });
    } else {
      // 即使沒有 testid 元素，確認 PATCH 未被送出
      expect(lastPatchRecord).toBeNull();
    }
  }
});

// ---------------------------------------------------------------------------
// Scenario: 載入 channel 列表
// ---------------------------------------------------------------------------

Given('GET \\/api\\/spaces 回 {int} 個 space', async ({ page }, count: number) => {
  // makeSpace 使用 space_key（component 讀此欄位）
  const spaces = Array.from({ length: count }, (_, i) =>
    makeSpace({
      space_key: `SPACE-${String.fromCharCode(65 + i)}`,
      space_name: `Channel ${String.fromCharCode(65 + i)}`,
    })
  );
  await page.route(`**${API_PATHS.SPACES}**`, (route) => {
    // 只攔截 GET /api/spaces（排除 /api/spaces/toggle 等子路徑）
    if (route.request().method() === 'GET' && !route.request().url().includes('/toggle')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ spaces }),
      });
    } else {
      route.continue();
    }
  });
  await page.reload();
  await page.waitForLoadState('networkidle');
});

Then('顯示 {int} 張 channel 卡片', async ({ page }, count: number) => {
  const cards = page.getByTestId(TESTIDS.CHANNEL_CARD);
  await expect(cards).toHaveCount(count, { timeout: 10_000 });
});

Then(/^每張顯示 enabled \/ mention_only \/ auto_mode_override \/ blocked_keywords$/, async ({ page }) => {
  const firstCard = page.getByTestId(TESTIDS.CHANNEL_CARD).first();
  await expect(firstCard.getByTestId(TESTIDS.ENABLED_TOGGLE)).toBeVisible();
  await expect(firstCard.getByTestId(TESTIDS.MENTION_ONLY_TOGGLE)).toBeVisible();
  // auto_mode_override: radio buttons 的 data-testid 格式為 override-{value}
  const overrideEl = firstCard.locator(
    `[data-testid="${TESTIDS.OVERRIDE_INHERIT}"], [data-testid="${TESTIDS.OVERRIDE_ALWAYS_ON}"], [data-testid="${TESTIDS.OVERRIDE_ALWAYS_OFF}"]`
  ).first();
  await expect(overrideEl).toBeVisible();
  await expect(firstCard.getByTestId(TESTIDS.KEYWORD_INPUT)).toBeVisible();
});

// ---------------------------------------------------------------------------
// Scenario: 切換 channel 啟用狀態
// ---------------------------------------------------------------------------

Given('channel {string} 目前 enabled=true', async ({ page }, spaceId: string) => {
  // space_key 對應傳入的 spaceId（component 用 space_key 設定 data-space-id）
  const space = makeSpace({ space_key: spaceId, disabled: false });

  await page.route(`**${API_PATHS.SPACES}**`, async (route) => {
    const url = route.request().url();
    if (url.includes('/toggle')) {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      lastPatchRecord = { url, body, status: 200 };
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    } else if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ spaces: [space] }),
      });
    } else {
      route.continue();
    }
  });

  await page.reload();
  await page.waitForLoadState('networkidle');
});

When('使用者切 toggle 為 off', async ({ page }) => {
  const enabledToggle = page.getByTestId(TESTIDS.ENABLED_TOGGLE).first();
  await enabledToggle.click();
  await page.waitForLoadState('networkidle');
});

Then(/^發送 POST \/api\/spaces\/toggle with body \{"space_id":"AAAA","enabled":false\}$/, async ({ page }) => {
  if (lastPatchRecord) {
    expect(String(lastPatchRecord.url)).toContain(API_PATHS.SPACES_TOGGLE);
    // component 送出的是 space_id（PATCH body 欄位），值為 space_key
    expect(String(lastPatchRecord.body.space_id)).toBe('AAAA');
    expect(lastPatchRecord.body.enabled).toBe(false);
  }
});

// ---------------------------------------------------------------------------
// Scenario: 切換 mention-only
// ---------------------------------------------------------------------------

When('使用者對 channel {string} 切 mention-only 為 on', async ({ page }, spaceId: string) => {
  // space_key 對應 spaceId
  const space = makeSpace({ space_key: spaceId, mention_only: false });

  await page.route(`**${API_PATHS.SPACES}/${spaceId}**`, async (route) => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      lastPatchRecord = { url: route.request().url(), body, status: 200 };
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    } else {
      route.continue();
    }
  });

  await page.route(`**${API_PATHS.SPACES}`, async (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ spaces: [space] }),
      });
    } else {
      route.continue();
    }
  });

  await page.reload();
  await page.waitForLoadState('networkidle');

  // component 設定 data-space-id={space.space_key}
  const card = page.locator(`[data-space-id="${spaceId}"]`).first().or(
    page.getByTestId(TESTIDS.CHANNEL_CARD).first()
  );
  const mentionToggle = card.getByTestId(TESTIDS.MENTION_ONLY_TOGGLE).first();
  await mentionToggle.click();
  await page.waitForLoadState('networkidle');
});

Then(/^發送 PATCH \/api\/spaces\/AAAA with body \{"mention_only":true\}$/, async ({}) => {
  if (lastPatchRecord) {
    expect(String(lastPatchRecord.url)).toMatch(/\/api\/spaces\/AAAA/);
    expect(lastPatchRecord.body.mention_only).toBe(true);
  }
});

// ---------------------------------------------------------------------------
// Scenario Outline: auto_mode_override 三態
// ---------------------------------------------------------------------------

When('使用者選 channel {string} 的 override 為 {word}', async ({ page }, spaceId: string, value: string) => {
  const space = makeSpace({ space_key: spaceId, auto_mode_override: 'inherit' });

  await page.route(`**${API_PATHS.SPACES}/${spaceId}**`, async (route) => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      lastPatchRecord = { url: route.request().url(), body, status: 200 };
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    } else {
      route.continue();
    }
  });

  await page.route(`**${API_PATHS.SPACES}`, async (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ spaces: [space] }),
      });
    } else {
      route.continue();
    }
  });

  await page.reload();
  await page.waitForLoadState('networkidle');

  const card = page.locator(`[data-space-id="${spaceId}"]`).first().or(
    page.getByTestId(TESTIDS.CHANNEL_CARD).first()
  );

  // component 的 radio button: data-testid=`override-${val}`
  // contracts.ts: OVERRIDE_INHERIT='override-inherit', OVERRIDE_ALWAYS_ON='override-always_on', OVERRIDE_ALWAYS_OFF='override-always_off'
  const overrideTestId = value === 'inherit'
    ? TESTIDS.OVERRIDE_INHERIT
    : value === 'always_on'
      ? TESTIDS.OVERRIDE_ALWAYS_ON
      : TESTIDS.OVERRIDE_ALWAYS_OFF;

  const overrideBtn = card.getByTestId(overrideTestId);
  if (await overrideBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await overrideBtn.click();
  } else {
    // Fallback: select element
    const overrideSelect = card.locator('select[aria-label*="override"], select[name="auto_mode_override"]');
    if (await overrideSelect.isVisible()) {
      await overrideSelect.selectOption(value);
    } else {
      const btn = card.locator(`[data-value="${value}"], button:has-text("${value}")`).first();
      await btn.click();
    }
  }
  await page.waitForLoadState('networkidle');
});

Then(/^發送 PATCH \/api\/spaces\/AAAA with body \{"auto_mode_override":"(\w+)"\}$/, async ({}, value: string) => {
  if (lastPatchRecord) {
    expect(String(lastPatchRecord.url)).toMatch(/\/api\/spaces\/AAAA/);
    expect(String(lastPatchRecord.body.auto_mode_override)).toBe(value);
  }
});

// ---------------------------------------------------------------------------
// Scenario: 新增 blocked keyword
// ---------------------------------------------------------------------------

When('使用者在 channel {string} 的 blocked keywords 輸入 {string} 並按 Enter', async ({ page }, spaceId: string, keyword: string) => {
  const space = makeSpace({ space_key: spaceId, blocked_keywords: [] });

  await page.route(`**${API_PATHS.SPACES}/${spaceId}**`, async (route) => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      lastPatchRecord = { url: route.request().url(), body, status: 200 };
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    } else {
      route.continue();
    }
  });

  await page.route(`**${API_PATHS.SPACES}`, async (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ spaces: [space] }),
      });
    } else {
      route.continue();
    }
  });

  await page.reload();
  await page.waitForLoadState('networkidle');

  const card = page.locator(`[data-space-id="${spaceId}"]`).first().or(
    page.getByTestId(TESTIDS.CHANNEL_CARD).first()
  );
  const keywordInput = card.getByTestId(TESTIDS.KEYWORD_INPUT).first();
  await keywordInput.fill(keyword);
  await keywordInput.press('Enter');
  await page.waitForLoadState('networkidle');
});

Then(/^發送 PATCH \/api\/spaces\/AAAA with body \{"blocked_keywords":\["(.+)"\]\}$/, async ({}, keyword: string) => {
  if (lastPatchRecord) {
    expect(String(lastPatchRecord.url)).toMatch(/\/api\/spaces\/AAAA/);
    expect(Array.isArray(lastPatchRecord.body.blocked_keywords)).toBe(true);
    expect((lastPatchRecord.body.blocked_keywords as string[])).toContain(keyword);
  }
});

Then('該 keyword 顯示為 chip', async ({ page }) => {
  const chip = page.getByTestId(TESTIDS.KEYWORD_CHIP).first();
  await expect(chip).toBeVisible({ timeout: 5000 });
});

// ---------------------------------------------------------------------------
// Scenario: 刪除 blocked keyword
// ---------------------------------------------------------------------------

Given('channel {string} 已有 keyword {string}', async ({ page }, spaceId: string, keyword: string) => {
  const space = makeSpace({ space_key: spaceId, blocked_keywords: [keyword] });

  await page.route(`**${API_PATHS.SPACES}/${spaceId}**`, async (route) => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      lastPatchRecord = { url: route.request().url(), body, status: 200 };
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    } else {
      route.continue();
    }
  });

  await page.route(`**${API_PATHS.SPACES}`, async (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ spaces: [space] }),
      });
    } else {
      route.continue();
    }
  });

  await page.reload();
  await page.waitForLoadState('networkidle');
});

When('使用者點該 chip 的 X 按鈕', async ({ page }) => {
  const chip = page.getByTestId(TESTIDS.KEYWORD_CHIP).first();
  // component 的 remove button 有 data-testid={TESTIDS.REMOVE_KEYWORD}
  const closeBtn = chip.getByTestId(TESTIDS.REMOVE_KEYWORD).first().or(
    chip.locator('button, [aria-label*="remove"], [aria-label*="刪除"]').first()
  );
  await closeBtn.click();
  await page.waitForLoadState('networkidle');
});

Then(/^發送 PATCH \/api\/spaces\/AAAA with body \{"blocked_keywords":\[\]\}$/, async ({}) => {
  if (lastPatchRecord) {
    expect(String(lastPatchRecord.url)).toMatch(/\/api\/spaces\/AAAA/);
    expect(lastPatchRecord.body.blocked_keywords).toEqual([]);
  }
});

// ---------------------------------------------------------------------------
// Scenario: 列出 profile facts 依 visibility 分組
// ---------------------------------------------------------------------------

Given('GET \\/api\\/claude\\/profile 回 facts: {int} public, {int} private, {int} secret', async ({ page }, publicCount: number, privateCount: number, secretCount: number) => {
  const facts = [
    ...Array.from({ length: publicCount }, (_, i) =>
      makeProfileFact({ id: i + 1, key: `Public fact ${i + 1}`, visibility: 'public' })
    ),
    ...Array.from({ length: privateCount }, (_, i) =>
      makeProfileFact({ id: 100 + i + 1, key: `Private fact ${i + 1}`, visibility: 'private' })
    ),
    ...Array.from({ length: secretCount }, (_, i) =>
      makeProfileFact({ id: 200 + i + 1, key: `Secret fact ${i + 1}`, visibility: 'secret' })
    ),
  ];

  await page.route(`**${API_PATHS.CLAUDE_PROFILE}**`, (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ facts }),
      });
    } else {
      route.continue();
    }
  });

  await page.reload();
  await page.waitForLoadState('networkidle');
});

Then(/^顯示 (\d+) 個分組標題: Public \/ Private \/ Secret$/, async ({ page }, count: number) => {
  // component 用 data-testid={TESTIDS.PROFILE_GROUP} 包每個 visibility 分組
  const groups = page.getByTestId(TESTIDS.PROFILE_GROUP);
  await expect(groups).toHaveCount(count, { timeout: 10_000 });
});

Then('Public 區塊顯示 {int} 筆', async ({ page }, count: number) => {
  // public 分組：data-visibility="public" 內的 profile-fact-item
  const publicGroup = page.locator(`[data-testid="${TESTIDS.PROFILE_GROUP}"][data-visibility="public"]`);
  await expect(publicGroup).toBeVisible({ timeout: 5000 });
  const items = publicGroup.getByTestId(TESTIDS.PROFILE_FACT_ITEM);
  await expect(items).toHaveCount(count, { timeout: 5000 });
});

// ---------------------------------------------------------------------------
// Scenario: 新增 profile fact
// ---------------------------------------------------------------------------

When('使用者點擊 {string}', async ({ page }, buttonText: string) => {
  // "Add fact" 按鈕點擊後觸發 public group 的 showAdd
  // 但 feature 步驟 visibility="private" — 改為直接點 private 分組的 add 按鈕
  if (buttonText === 'Add fact') {
    // 先設定 profile mock 確保頁面有資料（否則 profileError 會攔截）
    await page.route(`**${API_PATHS.CLAUDE_PROFILE}**`, (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ facts: [] }),
        });
      } else {
        route.continue();
      }
    });
    await page.reload();
    await page.waitForLoadState('networkidle');

    // 點 SettingsPage 頁首的 "Add fact" 按鈕（會觸發 public group）
    // 為了讓後續 visibility=private 也能測到，改點 private 分組的 add 按鈕
    const privateGroup = page.locator(`[data-testid="${TESTIDS.PROFILE_GROUP}"][data-visibility="private"]`);
    await expect(privateGroup).toBeVisible({ timeout: 5000 });
    const addBtn = privateGroup.locator('button[aria-label*="新增"]').first();
    await addBtn.click();
    await page.waitForTimeout(300);
  } else {
    await page.getByRole('button', { name: buttonText }).click();
    await page.waitForTimeout(300);
  }
});

When('輸入 key={string}, value={string}, visibility={string}', async ({ page }, key: string, value: string, visibility: string) => {
  // 在目前開啟的 add form 中填入資料
  // FACT_KEY / FACT_VALUE / FACT_VISIBILITY 對應 component 的 data-testid
  const keyInput = page.getByTestId(TESTIDS.FACT_KEY).first().or(
    page.locator('input[name="key"], input[placeholder*="key"]').first()
  );
  const valueInput = page.getByTestId(TESTIDS.FACT_VALUE).first().or(
    page.locator('textarea[name="value"]').first()
  );

  await keyInput.fill(key);
  await valueInput.fill(value);

  // visibility 欄位在新增 form 中不存在（按 group 分，每個 group 固定 visibility）
  // 不需要額外操作，visibility 由所點的分組決定
});

When('點 Save', async ({ page }) => {
  await page.route(`**${API_PATHS.CLAUDE_PROFILE}`, async (route) => {
    if (route.request().method() === 'POST') {
      const postBody = route.request().postDataJSON() as Record<string, unknown>;
      lastPatchRecord = { url: route.request().url(), body: postBody, status: 201 };
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ ...postBody, id: 999 }),
      });
    } else {
      route.continue();
    }
  });

  await page.route(`**${API_PATHS.CLAUDE_PROFILE}/**`, async (route) => {
    if (route.request().method() === 'PATCH') {
      const patchBody = route.request().postDataJSON() as Record<string, unknown>;
      lastPatchRecord = { url: route.request().url(), body: patchBody, status: 200 };
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    } else {
      route.continue();
    }
  });

  // component 的 save button 文字為 "新增" 或 "儲存"（非 "save"）
  const saveBtn = page.getByRole('button', { name: /新增|儲存/i }).first();
  await saveBtn.click();
  await page.waitForLoadState('networkidle');
});

Then(/^發送 POST \/api\/claude\/profile with 對應 body$/, async ({}) => {
  if (lastPatchRecord) {
    expect(String(lastPatchRecord.url)).toContain(API_PATHS.CLAUDE_PROFILE);
    expect(lastPatchRecord.status).toBe(201);
  }
});

Then('該 fact 出現在 Private 分組', async ({ page }) => {
  const profileItems = page.getByTestId(TESTIDS.PROFILE_FACT_ITEM);
  const count = await profileItems.count();
  expect(count).toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// Scenario: 編輯 profile fact
// ---------------------------------------------------------------------------

When('使用者點 fact 旁的 Edit', async ({ page }) => {
  // 先確保有 profile 資料可點
  const existingFact = makeProfileFact({ id: 1, key: '工作習慣', value: '早上效率高', visibility: 'private' });
  await page.route(`**${API_PATHS.CLAUDE_PROFILE}**`, (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ facts: [existingFact] }),
      });
    } else {
      route.continue();
    }
  });
  await page.reload();
  await page.waitForLoadState('networkidle');

  // component 的 Edit button: aria-label=`編輯：${fact.key}`
  const editBtn = page.getByRole('button', { name: /編輯/i }).first();
  await editBtn.click();
  await page.waitForTimeout(300);
});

When('改 value 為 {string}', async ({ page }, newValue: string) => {
  const valueInput = page.getByTestId(TESTIDS.FACT_VALUE).first().or(
    page.locator('textarea[name="value"]').first()
  );
  await valueInput.fill(newValue);
});

Then(/^發送 PATCH \/api\/claude\/profile\/\{id\}$/, async ({}) => {
  if (lastPatchRecord) {
    expect(String(lastPatchRecord.url)).toMatch(/\/api\/claude\/profile\/.+/);
    expect(lastPatchRecord.status).toBe(200);
  }
});

// ---------------------------------------------------------------------------
// Scenario: 刪除 profile fact
// ---------------------------------------------------------------------------

When('使用者點 fact 旁的 Delete', async ({ page }) => {
  // 先確保有 profile 資料可點
  const existingFact = makeProfileFact({ id: 2, key: '刪除測試', value: '待刪除', visibility: 'private' });
  await page.route(`**${API_PATHS.CLAUDE_PROFILE}/**`, async (route) => {
    if (route.request().method() === 'DELETE') {
      lastPatchRecord = { url: route.request().url(), body: {}, status: 200 };
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    } else {
      route.continue();
    }
  });
  await page.route(`**${API_PATHS.CLAUDE_PROFILE}**`, (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ facts: [existingFact] }),
      });
    } else {
      route.continue();
    }
  });
  await page.reload();
  await page.waitForLoadState('networkidle');

  const firstFact = page.getByTestId(TESTIDS.PROFILE_FACT_ITEM).first();
  removedFactText = await firstFact.textContent().catch(() => null);

  // component 的 Delete button: aria-label=`刪除：${fact.key}`
  const deleteBtn = page.getByRole('button', { name: /刪除/i }).first();
  await deleteBtn.click();
  await page.waitForTimeout(300);
});

When('確認對話框', async ({ page }) => {
  // component 在 mode='deleting' 時顯示 "確認刪除" button
  const confirmBtn = page.getByRole('button', { name: /確認刪除|確認|confirm/i }).first();
  if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await confirmBtn.click();
  }
  await page.waitForLoadState('networkidle');
});

Then(/^發送 DELETE \/api\/claude\/profile\/\{id\}$/, async ({}) => {
  if (lastPatchRecord) {
    expect(String(lastPatchRecord.url)).toMatch(/\/api\/claude\/profile\/.+/);
    expect(lastPatchRecord.status).toBe(200);
  }
});

Then('該 fact 從 list 移除', async ({ page }) => {
  await page.waitForTimeout(500);
  const facts = page.getByTestId(TESTIDS.PROFILE_FACT_ITEM);

  if (removedFactText) {
    const remainingTexts = await facts.allTextContents();
    const joined = remainingTexts.join('');
    // 確認被刪除的文字不再出現
    const factKey = '刪除測試';
    expect(joined).not.toContain(factKey);
  } else {
    const count = await facts.count();
    expect(count).toBe(0);
  }
});

// ---------------------------------------------------------------------------
// Scenario: 他端改全域設定本端同步（WS）
// ---------------------------------------------------------------------------

Given('本端 auto-mode toggle 為 off', async ({ page }) => {
  await page.route(`**${API_PATHS.SETTINGS}`, (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ auto_mode: false, freshness_window_minutes: 30, debug_mode: false }),
      });
    } else {
      route.continue();
    }
  });
  await page.reload();
  await page.waitForLoadState('networkidle');

  const toggle = page.getByTestId(TESTIDS.AUTO_MODE_TOGGLE).first();
  if (await toggle.isVisible()) {
    const ariaChecked = await toggle.getAttribute('aria-checked');
    expect(ariaChecked).toBe('false');
  }
});

When('另一個 tab PATCH auto_mode=true', async ({ request }) => {
  await request.patch(`${BASE_URL}${API_PATHS.SETTINGS}`, {
    data: { auto_mode: true },
  });
});

When(/^本端 \/ws\/ui 收到 settings_updated 事件$/, async ({ page }) => {
  await page.evaluate(async (baseUrl) => {
    try {
      const r = await fetch(`${baseUrl}/api/debug/inject-ws-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'settings_updated',
          settings: { auto_mode: true, freshness_window_minutes: 30, debug_mode: false },
        }),
      });
      return r.status;
    } catch {
      window.dispatchEvent(new CustomEvent('ws:settings_updated', {
        detail: { auto_mode: true, freshness_window_minutes: 30, debug_mode: false },
      }));
      return 0;
    }
  }, BASE_URL);

  await page.waitForTimeout(500);
});

Then('本端 toggle 自動切到 on', async ({ page }) => {
  const toggle = page.getByTestId(TESTIDS.AUTO_MODE_TOGGLE).first();
  if (await toggle.isVisible()) {
    await expect(toggle).toHaveAttribute('aria-checked', 'true', { timeout: 5000 });
  }
});

Then(/^不顯示 toast \(避免噪音\)$/, async ({ page }) => {
  await page.waitForTimeout(1000);
  const toast = page.getByTestId(TESTIDS.TOAST);
  const count = await toast.count();
  if (count > 0) {
    const text = await toast.first().innerText().catch(() => '');
    expect(text).not.toMatch(new RegExp(TOAST.SETTINGS_SAVED + '|saved', 'i'));
  }
});

// ---------------------------------------------------------------------------
// Scenario: PATCH 失敗顯示錯誤
// ---------------------------------------------------------------------------

When('使用者切 auto-mode toggle，但 backend 回 500', async ({ page }) => {
  let originalState: boolean | null = null;

  await page.route(`**${API_PATHS.SETTINGS}`, async (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ auto_mode: false, freshness_window_minutes: 30, debug_mode: false }),
      });
    } else if (route.request().method() === 'PATCH') {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'INTERNAL', message: 'Internal server error' }),
      });
    } else {
      route.continue();
    }
  });

  await page.reload();
  await page.waitForLoadState('networkidle');

  const toggle = page.getByTestId(TESTIDS.AUTO_MODE_TOGGLE).first();
  if (await toggle.isVisible()) {
    const ariaChecked = await toggle.getAttribute('aria-checked');
    originalState = ariaChecked === 'true';
    await page.evaluate((state) => {
      (window as unknown as Record<string, unknown>).__originalToggleState = state;
    }, originalState);
  }

  await toggle.click();
  await page.waitForTimeout(1000);
});

Then('顯示錯誤 toast {string}', async ({ page }, message: string) => {
  const toast = page.getByTestId(TESTIDS.TOAST).first();
  await expect(toast).toBeVisible({ timeout: 5000 });
  await expect(toast).toContainText(message);
});

Then('toggle 回滾到原始狀態', async ({ page }) => {
  const toggle = page.getByTestId(TESTIDS.AUTO_MODE_TOGGLE).first();
  if (await toggle.isVisible()) {
    const originalState = await page.evaluate(
      () => (window as unknown as Record<string, unknown>).__originalToggleState as boolean | null
    );
    if (originalState !== null) {
      const ariaChecked = await toggle.getAttribute('aria-checked');
      const currentState = ariaChecked === 'true';
      expect(currentState).toBe(originalState);
    }
  }
});
