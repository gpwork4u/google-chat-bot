/**
 * contracts-sprint6.ts — Sprint 6 specific contract extensions
 *
 * These constants are defined here pending their addition to web/src/contracts.ts
 * by the frontend engineer. Once merged, these should be removed and imports
 * updated to point to web/src/contracts.ts.
 *
 * Source:
 *   specs/features/f013-pending-viewer.md §DOM Contract
 *   specs/features/f012-extension-sync-history.md §API Contract
 *   specs/features/f004-settings.md §Sprint 6 AC
 */

// ─── F-013 Pending Viewer TestIDs ────────────────────────────────────────────

export const PENDING_TESTIDS = {
  // Tab buttons
  TAB_PENDING: 'pending-tab-pending',
  TAB_SKIPPED: 'pending-tab-skipped',
  TAB_DRAFTED: 'pending-tab-drafted',

  // Row container (data-message-id attached)
  ROW: 'pending-row',

  // Action buttons
  SKIP_BTN: 'pending-skip-btn',
  UNSKIP_BTN: 'pending-unskip-btn',

  // Skip reason menu
  SKIP_REASON_MENU: 'pending-skip-reason-menu',
  SKIP_REASON_OPTION: 'pending-skip-reason-option',

  // Filters
  SPACE_FILTER: 'space-filter',         // reuse from SentPage
  SENDER_FILTER: 'sender-filter',
  BODY_FILTER: 'body-filter',
  MENTIONED_FILTER: 'mentioned-filter',

  // Pagination
  LOAD_MORE: 'pending-load-more',

  // States
  EMPTY_STATE: 'pending-empty-state',
  ERROR_STATE: 'error-state',           // reuse existing

  // Body expand
  ROW_EXPAND: 'pending-row-expand',
} as const;

// ─── F-013 Pending Viewer UX Text ────────────────────────────────────────────

export const PENDING_TOAST = {
  SKIPPED: '已 skip',
  UNSKIPPED: '已復原 skip',
  SKIP_FAILED: 'Skip 失敗，請重試',
  UNSKIP_FAILED: '復原失敗，請重試',
  PENDING_EMPTY: '目前沒有等待處理的訊息 🎉',
  SYNC_DONE: '同步完成',
  SYNC_FAILED: '同步失敗，請重試',
} as const;

// ─── F-013 Pending Viewer Labels ─────────────────────────────────────────────

export const PENDING_LABELS = {
  TAB_PENDING: 'Pending',
  TAB_SKIPPED: 'Skipped',
  TAB_DRAFTED: 'Drafted',
  BTN_SKIP: 'Skip',
  BTN_UNSKIP: 'Unskip',
  MENTIONED_FILTER: '只看 @我',
  EMPTY_BODY_PLACEHOLDER: '(空訊息)',
} as const;

// ─── F-012 Sync History API Paths ────────────────────────────────────────────

export const SYNC_API_PATHS = {
  START: '/api/extension/sync-history/start',
  BATCH: '/api/extension/sync-history',
  STATUS: '/api/extension/sync-history/status',
  COMPLETE: '/api/extension/sync-history/complete',
} as const;

// ─── F-012 Error Codes ───────────────────────────────────────────────────────

export const SYNC_ERROR_CODES = {
  INVALID_INPUT: 'INVALID_INPUT',
  JOB_EXISTS: 'JOB_EXISTS',
  JOB_NOT_FOUND: 'JOB_NOT_FOUND',
} as const;

// ─── F-013 Error Codes ───────────────────────────────────────────────────────

export const PENDING_ERROR_CODES = {
  INVALID_PARAM: 'INVALID_PARAM',
} as const;

// ─── F-011 Skip reason options (for pending viewer) ──────────────────────────
// matches the reason dropdown in pending viewer (pure-ack, overheard, etc.)

export const MANUAL_SKIP_REASONS = [
  'pure-ack',
  'overheard',
  'policy-redline',
  'not-targeted',
  'low-info',
  'manual-other',
] as const;

export type ManualSkipReason = (typeof MANUAL_SKIP_REASONS)[number];
