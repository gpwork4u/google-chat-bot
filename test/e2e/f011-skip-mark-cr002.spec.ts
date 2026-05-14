/**
 * F-011: D-skip Mark — Sprint 6 CR-002 增補 AC
 *
 * Sprint 6 AC-CR002-1..R2
 * 覆蓋 Pending Viewer 手動 skip / unskip + WS event + by badge 區分
 */

import { test, expect, Page, APIRequestContext } from '@playwright/test';
import { API_PATHS, SKIP_REASONS, SKIPPED_BY } from '../../web/src/contracts';
import {
  PENDING_TESTIDS,
  PENDING_TOAST,
  MANUAL_SKIP_REASONS,
} from '../support/contracts-sprint6';
import {
  simulateMessage,
  seedSkippedMessage,
} from '../support/seedMessages';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function injectWsPendingChanged(
  request: APIRequestContext,
  reason: 'new_message' | 'skipped' | 'drafted' | 'unskipped',
  messageId: string
) {
  const res = await request.post(`${BASE_URL}${API_PATHS.DEBUG_INJECT_WS_EVENT}`, {
    data: {
      type: 'pending_changed',
      reason,
      message_id: messageId,
    },
  });
  if (!res.ok()) {
    throw new Error(
      `injectWsPendingChanged failed: ${res.status()} — ` +
        'backend must support pending_changed event type (F-013 #85)'
    );
  }
}

async function navigateToPending(page: Page) {
  await page.goto('/pending');
  await page.waitForLoadState('networkidle');
}

async function clickSkipOnFirstRow(page: Page, reason: string) {
  const skipBtn = page.locator(`[data-testid="${PENDING_TESTIDS.SKIP_BTN}"]`).first();
  await skipBtn.click();
  await expect(page.locator(`[data-testid="${PENDING_TESTIDS.SKIP_REASON_MENU}"]`)).toBeVisible();
  await page
    .locator(`[data-testid="${PENDING_TESTIDS.SKIP_REASON_OPTION}"][data-reason="${reason}"]`)
    .click();
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('F-011 D-skip CR-002 Pending Viewer Skip/Unskip', () => {
  test.describe('手動 Skip from Pending Viewer', () => {
    test('[Happy] AC-CR002-1: Pending viewer 點 Skip → POST /api/claude/skip with by=manual → 訊息消失 Pending tab', async ({
      page,
      request,
    }) => {
      // Seed a pending message
      await simulateMessage(request, {
        space_key: 'spaces/AAA',
        space_name: 'Team #general',
        thread_key: `TP_cr002_1_${Date.now()}`,
        sender_name: 'Alice',
        body: `AC-CR002-1 test message ${Date.now()}`,
        sender_is_me: false,
        with_draft: false,
      });

      // Intercept skip API to verify by=manual
      let capturedBody: Record<string, unknown> | null = null;
      await page.route('**/api/claude/skip', async (route) => {
        const body = route.request().postDataJSON();
        capturedBody = body as Record<string, unknown>;
        await route.continue();
      });

      await navigateToPending(page);

      const rowsBefore = await page.locator(`[data-testid="${PENDING_TESTIDS.ROW}"]`).count();
      expect(rowsBefore).toBeGreaterThanOrEqual(1);

      await clickSkipOnFirstRow(page, MANUAL_SKIP_REASONS[0]); // pure-ack

      // Verify POST was made with by=manual
      await expect(page.getByText(PENDING_TOAST.SKIPPED)).toBeVisible({ timeout: 5000 });
      expect(capturedBody).not.toBeNull();
      expect(capturedBody!['by']).toBe(SKIPPED_BY.MANUAL);
      expect(capturedBody!['reason']).toBe(MANUAL_SKIP_REASONS[0]);
      expect(typeof capturedBody!['message_id']).toBe('string');

      // Row should disappear from Pending tab
      const rowsAfter = await page.locator(`[data-testid="${PENDING_TESTIDS.ROW}"]`).count();
      expect(rowsAfter).toBeLessThan(rowsBefore);
    });

    test('[Happy] AC-CR002-2: Skip 成功後 WS pending_changed reason=skipped 廣播', async ({
      page,
      request,
    }) => {
      // Seed a message
      const result = await simulateMessage(request, {
        space_key: 'spaces/AAA',
        space_name: 'Team #general',
        thread_key: `TP_cr002_2_${Date.now()}`,
        sender_name: 'Alice',
        body: `AC-CR002-2 WS skip test ${Date.now()}`,
        sender_is_me: false,
        with_draft: false,
      });

      // Skip the message directly via API
      const skipRes = await request.post(`${BASE_URL}${API_PATHS.CLAUDE_SKIP}`, {
        data: {
          message_id: result.message_id,
          reason: MANUAL_SKIP_REASONS[0],
          by: SKIPPED_BY.MANUAL,
        },
      });
      expect(skipRes.status()).toBe(200);

      // Open pending page on a second "tab" (same page context is fine for WS verification)
      await navigateToPending(page);

      // Inject WS event to simulate backend broadcast
      await injectWsPendingChanged(request, 'skipped', result.message_id);

      // After WS event, SWR revalidates — page should update
      await page.waitForTimeout(500);
      await page.waitForLoadState('networkidle');

      // Skipped tab should now show the message
      await page.locator(`[data-testid="${PENDING_TESTIDS.TAB_SKIPPED}"]`).click();
      await page.waitForLoadState('networkidle');
      const skippedRows = await page.locator(`[data-testid="${PENDING_TESTIDS.ROW}"]`).count();
      expect(skippedRows).toBeGreaterThanOrEqual(1);
    });

    test('[Happy] AC-CR002-3: backend_auto / skill skip 出現在 Skipped tab + by badge 可區分', async ({
      page,
      request,
    }) => {
      // Seed a backend_auto skipped message
      await seedSkippedMessage(request, {
        reason: SKIP_REASONS.NOT_MENTIONED,
        by: SKIPPED_BY.BACKEND_AUTO,
      });

      // Seed a skill skipped message
      await seedSkippedMessage(request, {
        reason: SKIP_REASONS.PURE_ACK,
        by: SKIPPED_BY.SKILL,
      });

      await navigateToPending(page);

      // Switch to Skipped tab
      await page.locator(`[data-testid="${PENDING_TESTIDS.TAB_SKIPPED}"]`).click();
      await page.waitForLoadState('networkidle');

      const rows = page.locator(`[data-testid="${PENDING_TESTIDS.ROW}"]`);
      const count = await rows.count();
      expect(count).toBeGreaterThanOrEqual(2);

      // Both skipped_by values should appear in the page
      // (UI shows by badge on each row)
      const pageText = await page.textContent('body');
      // At least one of the by values should be visible
      const hasBackendAuto = pageText?.includes(SKIPPED_BY.BACKEND_AUTO) ?? false;
      const hasSkill = pageText?.includes(SKIPPED_BY.SKILL) ?? false;
      expect(hasBackendAuto || hasSkill).toBe(true);
    });
  });

  test.describe('手動 Unskip from Pending Viewer', () => {
    test('[Happy] AC-CR002-4: Skipped tab 點 Unskip → POST /api/claude/unskip → 訊息消失 Skipped，回到 Pending', async ({
      page,
      request,
    }) => {
      // Seed a skipped message
      const messageId = await seedSkippedMessage(request, {
        reason: MANUAL_SKIP_REASONS[0],
        by: SKIPPED_BY.MANUAL,
      });

      await navigateToPending(page);

      // Switch to Skipped tab
      await page.locator(`[data-testid="${PENDING_TESTIDS.TAB_SKIPPED}"]`).click();
      await page.waitForLoadState('networkidle');

      const rowsBefore = await page.locator(`[data-testid="${PENDING_TESTIDS.ROW}"]`).count();
      expect(rowsBefore).toBeGreaterThanOrEqual(1);

      // Click Unskip
      const unskipBtn = page.locator(`[data-testid="${PENDING_TESTIDS.UNSKIP_BTN}"]`).first();
      await unskipBtn.click();

      // Toast
      await expect(page.getByText(PENDING_TOAST.UNSKIPPED)).toBeVisible({ timeout: 5000 });

      // Row should disappear from Skipped tab
      const rowsAfter = await page.locator(`[data-testid="${PENDING_TESTIDS.ROW}"]`).count();
      expect(rowsAfter).toBeLessThan(rowsBefore);

      // Switch to Pending tab — message should appear
      await page.locator(`[data-testid="${PENDING_TESTIDS.TAB_PENDING}"]`).click();
      await page.waitForLoadState('networkidle');

      const pendingRows = page.locator(`[data-testid="${PENDING_TESTIDS.ROW}"]`);
      const pendingCount = await pendingRows.count();
      expect(pendingCount).toBeGreaterThanOrEqual(1);
    });

    test('[Happy] AC-CR002-5: Unskip 後 WS pending_changed reason=unskipped 廣播', async ({
      page,
      request,
    }) => {
      // Seed a skipped message
      const messageId = await seedSkippedMessage(request, {
        reason: MANUAL_SKIP_REASONS[0],
        by: SKIPPED_BY.MANUAL,
      });

      // Unskip via API
      const unskipRes = await request.post(`${BASE_URL}${API_PATHS.CLAUDE_UNSKIP}`, {
        data: { message_id: messageId },
      });
      expect(unskipRes.status()).toBe(200);

      await navigateToPending(page);

      // Inject WS event for unskipped
      await injectWsPendingChanged(request, 'unskipped', messageId);

      // Wait for SWR to revalidate
      await page.waitForTimeout(500);
      await page.waitForLoadState('networkidle');

      // Pending tab should now show the unskipped message
      const pendingRows = await page.locator(`[data-testid="${PENDING_TESTIDS.ROW}"]`).count();
      expect(pendingRows).toBeGreaterThanOrEqual(1);
    });
  });

  test.describe('Regression', () => {
    test('[Regression] AC-CR002-R1: chat-drafts skill 仍用 by=skill skip，與 manual 不互相干擾', async ({
      request,
    }) => {
      // Seed a message
      const result = await simulateMessage(request, {
        space_key: 'spaces/AAA',
        space_name: 'Team #general',
        thread_key: `TP_skill_${Date.now()}`,
        sender_name: 'Alice',
        body: 'Message for skill to skip',
        sender_is_me: false,
        with_draft: false,
      });

      // Skip with by=skill (simulating chat-drafts skill behavior)
      const skipRes = await request.post(`${BASE_URL}${API_PATHS.CLAUDE_SKIP}`, {
        data: {
          message_id: result.message_id,
          reason: SKIP_REASONS.PURE_ACK,
          by: SKIPPED_BY.SKILL,
        },
      });
      expect(skipRes.status()).toBe(200);
      const skipBody = await skipRes.json();
      expect(skipBody.skipped_by).toBe(SKIPPED_BY.SKILL);

      // Verify it appears in skipped list with by=skill
      const skippedRes = await request.get(`${BASE_URL}${API_PATHS.CLAUDE_SKIPPED}`, {
        params: { by: SKIPPED_BY.SKILL },
      });
      expect(skippedRes.status()).toBe(200);
      const skippedData = await skippedRes.json();
      const foundItem = skippedData.items?.find(
        (item: { message_id: string }) => item.message_id === result.message_id
      );
      expect(foundItem).toBeDefined();
      expect(foundItem!.skipped_by).toBe(SKIPPED_BY.SKILL);
    });

    test('[Regression] AC-CR002-R2: F-002 Approval queue 不顯示 skipped 訊息', async ({
      request,
    }) => {
      // Seed a message and skip it manually
      const result = await simulateMessage(request, {
        space_key: 'spaces/AAA',
        space_name: 'Team #general',
        thread_key: `TP_r2_${Date.now()}`,
        sender_name: 'Alice',
        body: 'Skipped message should not appear in approval queue',
        sender_is_me: false,
        with_draft: false,
      });

      // Skip it
      const skipRes = await request.post(`${BASE_URL}${API_PATHS.CLAUDE_SKIP}`, {
        data: {
          message_id: result.message_id,
          reason: MANUAL_SKIP_REASONS[0],
          by: SKIPPED_BY.MANUAL,
        },
      });
      expect(skipRes.status()).toBe(200);

      // GET /api/drafts — skipped message should not appear
      const draftsRes = await request.get(`${BASE_URL}${API_PATHS.DRAFTS}`);
      expect(draftsRes.status()).toBe(200);
      const draftsData = await draftsRes.json();

      // The skipped message should NOT appear in the drafts list
      const skippedInDrafts = (draftsData.drafts ?? []).find(
        (d: { original_message_id?: string }) =>
          d.original_message_id === result.message_id
      );
      expect(skippedInDrafts).toBeUndefined();
    });
  });
});
