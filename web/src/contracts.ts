/**
 * contracts.ts — Single source of truth for wire-level strings.
 *
 * All data-testid values, API paths, and user-visible toast/label text are
 * centralised here so that both the implementation code and QA step
 * definitions can import from one place instead of duplicating magic strings.
 *
 * Usage in components:
 *   import { TESTIDS, API_PATHS, TOAST } from '../contracts'
 *   <div data-testid={TESTIDS.DRAFT_CARD} />
 *
 * Usage in QA steps (test/support):
 *   import { TESTIDS, TOAST } from '../../web/src/contracts'
 */

// ─── Test IDs ───────────────────────────────────────────────────────────────
// kebab-case strings matching data-testid attributes in the DOM.
// See specs/contracts/dom.md for the full table with element types and context.

export const TESTIDS = {
  // --- ApprovalsPage / ApprovalCard (F-002) ---
  DRAFT_CARD: 'draft-card',
  SPACE_NAME: 'space-name',
  SENDER_NAME: 'sender-name',
  CATEGORY_LABEL: 'category-label',
  CONNECTION_BADGE: 'connection-badge',
  TOAST: 'toast',
  EMPTY_STATE: 'empty-state',
  ERROR_STATE: 'error-state',

  // --- SentPage / SentRecordCard (F-003) ---
  SENT_RECORD: 'sent-record',
  SENT_CONTENT: 'sent-content',
  MODE_BADGE: 'mode-badge',
  EDITED_BADGE: 'edited-badge',
  RECORD_DETAIL: 'record-detail',
  CATEGORY: 'category',
  MODE_FILTER: 'mode-filter',
  SPACE_FILTER: 'space-filter',
  SEARCH_INPUT: 'search-input',

  // --- SettingsPage (F-004) global section ---
  GLOBAL_SECTION: 'global-section',
  AUTO_MODE_TOGGLE: 'auto-mode-toggle',
  FRESHNESS_INPUT: 'freshness-input',
  FRESHNESS_ERROR: 'freshness-error',
  DEBUG_TOGGLE: 'debug-toggle',

  // --- SettingsPage (F-004) channels section ---
  CHANNELS_SECTION: 'channels-section',
  CHANNEL_CARD: 'channel-card',
  ENABLED_TOGGLE: 'enabled-toggle',
  MENTION_ONLY_TOGGLE: 'mention-only-toggle',
  OVERRIDE_INHERIT: 'override-inherit',
  OVERRIDE_ALWAYS_ON: 'override-always_on',
  OVERRIDE_ALWAYS_OFF: 'override-always_off',
  KEYWORD_CHIP: 'keyword-chip',
  REMOVE_KEYWORD: 'remove-keyword',
  KEYWORD_INPUT: 'keyword-input',

  // --- SettingsPage (F-004) profile section ---
  PROFILE_SECTION: 'profile-section',
  PROFILE_GROUP: 'profile-group',
  PROFILE_FACT_ITEM: 'profile-fact-item',
  FACT_KEY: 'fact-key',
  FACT_VALUE: 'fact-value',
  FACT_VISIBILITY: 'fact-visibility',
} as const

export type TestId = (typeof TESTIDS)[keyof typeof TESTIDS]

// ─── API Paths ───────────────────────────────────────────────────────────────
// All /api/* paths used by frontend components and QA steps.

export const API_PATHS = {
  // Approvals (F-002)
  DRAFTS: '/api/drafts',
  DRAFT_APPROVE: (id: string | number) => `/api/drafts/${id}/approve`,
  DRAFT_REJECT: (id: string | number) => `/api/drafts/${id}/reject`,
  DRAFT_PATCH: (id: string | number) => `/api/drafts/${id}`,

  // Sent Log (F-003)
  SENT: '/api/sent',

  // Settings (F-004)
  SETTINGS: '/api/settings',
  SPACES: '/api/spaces',
  SPACES_TOGGLE: '/api/spaces/toggle',
  SPACE_PATCH: (spaceId: string) => `/api/spaces/${spaceId}`,
  CLAUDE_PROFILE: '/api/claude/profile',
  CLAUDE_PROFILE_ITEM: (id: string | number) => `/api/claude/profile/${id}`,

  // WebSocket
  WS_UI: '/ws/ui',

  // Debug (dev-only)
  DEBUG_INJECT_DRAFT: '/api/debug/inject-draft',
  DEBUG_INJECT_WS_EVENT: '/api/debug/inject-ws-event',
  DEBUG_SEED_DRAFTS: '/api/debug/seed-drafts',
  DEBUG_SIMULATE_MESSAGE: '/debug/simulate_message',
} as const

// ─── Toast Text ──────────────────────────────────────────────────────────────
// Exact zh-Hant strings shown in toast notifications.
// See specs/contracts/ux-text.md for full context.

export const TOAST = {
  // ApprovalsPage — Approve
  APPROVE_SUCCESS: '已送出',
  APPROVE_FAILURE: '送出失敗',

  // ApprovalsPage — Reject
  REJECT_SUCCESS: '已丟棄',
  REJECT_FAILURE: '丟棄失敗',

  // ApprovalsPage — Save draft
  SAVE_SUCCESS: '已暫存',
  SAVE_FAILURE: '暫存失敗',

  // SettingsPage — Settings PATCH
  SETTINGS_SAVED: '已儲存',
  SETTINGS_SAVE_FAILED: '儲存失敗，請重試',

  // SettingsPage — Profile facts
  PROFILE_ADDED: '已新增',
  PROFILE_DELETED: '已刪除',
} as const

export type ToastText = (typeof TOAST)[keyof typeof TOAST]

// ─── UX Labels ───────────────────────────────────────────────────────────────
// Badge labels and other user-visible text constants.

export const LABELS = {
  // SentRecordCard mode badge
  MODE_APPROVED: '已審核',
  MODE_AUTO: '自動送出',

  // SentRecordCard edited badge
  EDITED_BY_USER_SHORT: '使用者編輯過',
  EDITED_BY_USER_LONG: '使用者在核准前編輯過此草稿',

  // ApprovalCard category badge
  CATEGORY_DAILY_CHAT: '閒聊',
  CATEGORY_WORK_COORDINATION: '工作協調',
  CATEGORY_ENGINEERING: '工程',
  CATEGORY_SKIP: '略過',

  // SentPage empty state
  SENT_EMPTY: '近 7 天沒有送出記錄',

  // SettingsPage profile visibility
  VISIBILITY_PUBLIC: '公開',
  VISIBILITY_PRIVATE: '私人',
  VISIBILITY_SECRET: '機密',

  // SettingsPage freshness error
  FRESHNESS_ERROR: '請輸入 1–1440 之間的數字',
} as const
