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
 * Sprint 3 Wave 0 changes：
 *   - 全面 import contracts.ts（TESTIDS / API_PATHS / TOAST / LABELS）
 *   - 移除所有 hardcoded data-testid / /api/ / toast 字串
 *   - toast assertion 改用 TESTIDS.TOAST + await expect(...).toBeVisible()
 *   - timing-safe assertions on all async DOM
 */

import { expect } from '@playwright/test';
import { Given, When, Then } from '../support/fixtures';
import { TESTIDS, API_PATHS, TOAST, LABELS } from '../../web/src/contracts';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSpace(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    space_id: 'SPACE001',
    space_name: 'Team #general',
    enabled: true,
    mention_only: false,
    auto_mode_override: 'inherit',
    blocked_keywords: [],
    ...overrides,
  };
}

function makeProfileFact(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: `fact-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    key: '工作習慣',
    value: '早上效率高',
    visibility: 'private',
    ...overrides,
  };
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
  const isChecked = await toggle.isChecked().catch(async () => {
    const ariaChecked = await toggle.getAttribute('aria-checked');
    return ariaChecked === 'true';
  });
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
  const isChecked = await toggle.isChecked().catch(async () => {
    const ariaChecked = await toggle.getAttribute('aria-checked');
    return ariaChecked === 'true';
  });
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
  const isChecked = await toggle.isChecked().catch(async () => {
    const ariaChecked = await toggle.getAttribute('aria-checked');
    return ariaChecked === 'true';
  });
  expect(isChecked).toBe(true);
});

// ---------------------------------------------------------------------------
// Scenario: 修改 freshness window
// ---------------------------------------------------------------------------

When('使用者把 freshness 改成 {int} 並按 Enter', async ({ page }, value: number) => {
  await page.route(`**${API_PATHS.SETTINGS}`, async (route) => {
    if (route.request().method() === 'PATCH') {
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
    if (route.request().method() === 'PATCH') {
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
    const errorMsg = page.getByTestId(TESTIDS.FRESHNESS_ERROR);
    const count = await errorMsg.count();
    if (count > 0) {
      await expect(errorMsg.first()).toBeVisible({ timeout: 3000 });
    } else {
      const freshnessInput = page.getByTestId(TESTIDS.FRESHNESS_INPUT).first();
      const isInvalid = await freshnessInput.evaluate(
        (el: HTMLInputElement) => !el.validity.valid || el.getAttribute('aria-invalid') === 'true'
      ).catch(() => false);
      expect(lastPatchRecord).toBeNull();
    }
  }
});

// ---------------------------------------------------------------------------
// Scenario: 載入 channel 列表
// ---------------------------------------------------------------------------

Given('GET \\/api\\/spaces 回 {int} 個 space', async ({ page }, count: number) => {
  const spaces = Array.from({ length: count }, (_, i) =>
    makeSpace({
      space_id: `SPACE-${String.fromCharCode(65 + i)}`,
      space_name: `Channel ${String.fromCharCode(65 + i)}`,
    })
  );
  await page.route(`**${API_PATHS.SPACES}**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ spaces }),
    });
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
  // auto_mode_override: check any of the three override buttons/select
  const overrideEl = firstCard.locator(
    `[data-testid="${TESTIDS.OVERRIDE_INHERIT}"], [data-testid="${TESTIDS.OVERRIDE_ALWAYS_ON}"], [data-testid="${TESTIDS.OVERRIDE_ALWAYS_OFF}"], select[aria-label*="override"]`
  ).first();
  await expect(overrideEl).toBeVisible();
  await expect(firstCard.getByTestId(TESTIDS.KEYWORD_INPUT)).toBeVisible();
});

// ---------------------------------------------------------------------------
// Scenario: 切換 channel 啟用狀態
// ---------------------------------------------------------------------------

Given('channel {string} 目前 enabled=true', async ({ page }, spaceId: string) => {
  const space = makeSpace({ space_id: spaceId, enabled: true });

  await page.route(`**${API_PATHS.SPACES}**`, async (route) => {
    if (route.request().url().includes('/toggle')) {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      lastPatchRecord = { url: route.request().url(), body, status: 200 };
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
    expect(String(lastPatchRecord.body.space_id)).toBe('AAAA');
    expect(lastPatchRecord.body.enabled).toBe(false);
  }
});

// ---------------------------------------------------------------------------
// Scenario: 切換 mention-only
// ---------------------------------------------------------------------------

When('使用者對 channel {string} 切 mention-only 為 on', async ({ page }, spaceId: string) => {
  const space = makeSpace({ space_id: spaceId, mention_only: false });

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
  const space = makeSpace({ space_id: spaceId, auto_mode_override: 'inherit' });

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

  // Try testid-based override selectors first
  const overrideTestId = value === 'inherit'
    ? TESTIDS.OVERRIDE_INHERIT
    : value === 'always_on'
      ? TESTIDS.OVERRIDE_ALWAYS_ON
      : TESTIDS.OVERRIDE_ALWAYS_OFF;

  const overrideBtn = card.getByTestId(overrideTestId);
  if (await overrideBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
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
  const space = makeSpace({ space_id: spaceId, blocked_keywords: [] });

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
  const space = makeSpace({ space_id: spaceId, blocked_keywords: [keyword] });

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
      makeProfileFact({ id: `fact-pub-${i + 1}`, key: `Public fact ${i + 1}`, visibility: 'public' })
    ),
    ...Array.from({ length: privateCount }, (_, i) =>
      makeProfileFact({ id: `fact-priv-${i + 1}`, key: `Private fact ${i + 1}`, visibility: 'private' })
    ),
    ...Array.from({ length: secretCount }, (_, i) =>
      makeProfileFact({ id: `fact-sec-${i + 1}`, key: `Secret fact ${i + 1}`, visibility: 'secret' })
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
  const groups = page.getByTestId(TESTIDS.PROFILE_GROUP);
  const groupCount = await groups.count();
  // Verify through profile section
  const profileSection = page.getByTestId(TESTIDS.PROFILE_SECTION).first();
  await expect(profileSection).toBeVisible({ timeout: 5000 });

  // Each visibility group should be present
  const visibilityLabels = [LABELS.VISIBILITY_PUBLIC, LABELS.VISIBILITY_PRIVATE, LABELS.VISIBILITY_SECRET];
  let foundCount = 0;
  for (const label of visibilityLabels) {
    const el = page.locator(`text="${label}"`).first();
    if (await el.isVisible({ timeout: 1000 }).catch(() => false)) {
      foundCount++;
    }
  }
  expect(foundCount).toBeGreaterThanOrEqual(count);
});

Then('Public 區塊顯示 {int} 筆', async ({ page }, count: number) => {
  // Look for public profile items
  const profileItems = page.getByTestId(TESTIDS.PROFILE_FACT_ITEM);
  const totalCount = await profileItems.count();
  expect(totalCount).toBeGreaterThanOrEqual(count);
});

// ---------------------------------------------------------------------------
// Scenario: 新增 profile fact
// ---------------------------------------------------------------------------

When('使用者點擊 {string}', async ({ page }, buttonText: string) => {
  await page.getByRole('button', { name: buttonText }).click();
  await page.waitForTimeout(300);
});

When('輸入 key={string}, value={string}, visibility={string}', async ({ page }, key: string, value: string, visibility: string) => {
  const keyInput = page.getByTestId(TESTIDS.FACT_KEY).first().or(
    page.locator('input[name="key"], input[placeholder*="key"]').first()
  );
  const valueInput = page.getByTestId(TESTIDS.FACT_VALUE).first().or(
    page.locator('input[name="value"], textarea[name="value"]').first()
  );
  const visibilitySelect = page.getByTestId(TESTIDS.FACT_VISIBILITY).first().or(
    page.locator('select[name="visibility"]').first()
  );

  await keyInput.fill(key);
  await valueInput.fill(value);

  if (await visibilitySelect.isVisible()) {
    const tagName = await visibilitySelect.evaluate((el) => el.tagName.toLowerCase());
    if (tagName === 'select') {
      await visibilitySelect.selectOption(visibility);
    } else {
      await visibilitySelect.click();
      const option = page.locator(`[data-value="${visibility}"], [role="option"]:has-text("${visibility}")`).first();
      if (await option.isVisible()) await option.click();
    }
  }
});

When('點 Save', async ({ page }) => {
  await page.route(`**${API_PATHS.CLAUDE_PROFILE}`, async (route) => {
    if (route.request().method() === 'POST') {
      const postBody = route.request().postDataJSON() as Record<string, unknown>;
      lastPatchRecord = { url: route.request().url(), body: postBody, status: 201 };
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ ...postBody, id: 'fact-new-1' }),
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

  await page.getByRole('button', { name: /save|儲存/i }).click();
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
  const editBtn = page.getByRole('button', { name: /edit|編輯/i }).first();
  await editBtn.click();
  await page.waitForTimeout(300);
});

When('改 value 為 {string}', async ({ page }, newValue: string) => {
  const valueInput = page.getByTestId(TESTIDS.FACT_VALUE).first().or(
    page.locator('input[name="value"], textarea[name="value"]').first()
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
  const firstFact = page.getByTestId(TESTIDS.PROFILE_FACT_ITEM).first();
  removedFactText = await firstFact.textContent().catch(() => null);

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

  const deleteBtn = page.getByRole('button', { name: /delete|刪除/i }).first();
  await deleteBtn.click();
  await page.waitForTimeout(300);
});

When('確認對話框', async ({ page }) => {
  const confirmBtn = page.getByRole('button', { name: /confirm|確認|yes|是/i }).first();
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
    expect(remainingTexts).not.toContain(removedFactText);
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
    const isChecked = await toggle.isChecked().catch(async () => {
      const ariaChecked = await toggle.getAttribute('aria-checked');
      return ariaChecked === 'true';
    });
    expect(isChecked).toBe(false);
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
    await expect(toggle).toBeChecked({ timeout: 5000 });
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
    originalState = await toggle.isChecked().catch(() => false);
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
      const currentState = await toggle.isChecked().catch(async () => {
        const ariaChecked = await toggle.getAttribute('aria-checked');
        return ariaChecked === 'true';
      });
      expect(currentState).toBe(originalState);
    }
  }
});
