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

// ─── Generated wire types (Go → TypeScript via tygo) ─────────────────────────
// DO NOT hand-edit these types here. Edit internal/httpapi/types.go then run
// `make contracts` to regenerate web/src/contracts.generated.ts.
import type {
  Settings,
  Draft,
  Space,
  SentRecord,
  ProfileFact,
  Inbox,
  ContextMessage,
  DraftDebugInfo,
} from './contracts.generated'
export type {
  Settings,
  Draft,
  Space,
  SentRecord,
  ProfileFact,
  Inbox,
  ContextMessage,
  DraftDebugInfo,
}

// ─── Test IDs ───────────────────────────────────────────────────────────────
// kebab-case strings matching data-testid attributes in the DOM.
// See specs/contracts/dom.md for the full table with element types and context.

export const TESTIDS = {
  // --- ApprovalsPage (F-002) page-level ---
  APPROVALS_PAGE: 'approvals-page',
  APPROVAL_CARD: 'draft-card',

  // --- ApprovalsPage / ApprovalCard (F-002) ---
  DRAFT_CARD: 'draft-card',
  SPACE_NAME: 'space-name',
  SENDER_NAME: 'sender-name',
  CATEGORY_LABEL: 'category-label',
  CONNECTION_BADGE: 'connection-badge',
  TOAST: 'toast',
  EMPTY_STATE: 'empty-state',
  ERROR_STATE: 'error-state',

  // --- SentPage (F-003) page-level ---
  SENT_PAGE: 'sent-page',
  SENT_LIST: 'sent-list',
  SENT_FILTER_MODE: 'mode-filter',
  SENT_FILTER_SPACE: 'space-filter',
  SENT_FILTER_DATE_FROM: 'sent-filter-date-from',
  SENT_FILTER_DATE_TO: 'sent-filter-date-to',

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

  // --- PendingPage (F-013) ---
  PENDING_PAGE: 'pending-page',
  PENDING_TAB_PENDING: 'pending-tab-pending',
  PENDING_TAB_SKIPPED: 'pending-tab-skipped',
  PENDING_TAB_DRAFTED: 'pending-tab-drafted',
  PENDING_ROW: 'pending-row',
  PENDING_SKIP_BTN: 'pending-skip-btn',
  PENDING_UNSKIP_BTN: 'pending-unskip-btn',
  PENDING_SKIP_REASON_MENU: 'pending-skip-reason-menu',
  PENDING_SKIP_REASON_OPTION: 'pending-skip-reason-option',
  SENDER_FILTER: 'sender-filter',
  BODY_FILTER: 'body-filter',
  MENTIONED_FILTER: 'mentioned-filter',
  PENDING_LOAD_MORE: 'pending-load-more',
  PENDING_EMPTY_STATE: 'pending-empty-state',
  PENDING_ROW_EXPAND: 'pending-row-expand',

  // --- Settings (F-004/F-012) Sprint 6 additions ---
  SETTINGS_PENDING_LINK: 'settings-pending-link',
  SYNC_HISTORY_ALL: 'sync-history-all',
  SYNC_HISTORY_CURRENT: 'sync-history-current',
  SYNC_PROGRESS: 'sync-progress',

  // --- SettingsPage (F-004) page-level ---
  SETTINGS_PAGE: 'settings-page',
  SETTINGS_GLOBAL_SECTION: 'global-section',
  SETTINGS_CHANNELS_SECTION: 'channels-section',
  SETTINGS_PROFILE_SECTION: 'profile-section',
  SETTINGS_AUTO_MODE_TOGGLE: 'auto-mode-toggle',
  SETTINGS_FRESHNESS_INPUT: 'freshness-input',
  SETTINGS_DEBUG_TOGGLE: 'debug-toggle',

  // --- SettingsPage (F-004) global section ---
  GLOBAL_SECTION: 'global-section',
  AUTO_MODE_TOGGLE: 'auto-mode-toggle',
  FRESHNESS_INPUT: 'freshness-input',
  FRESHNESS_ERROR: 'freshness-error',
  DEBUG_TOGGLE: 'debug-toggle',

  // --- SettingsPage (F-004) channels section ---
  CHANNELS_SECTION: 'channels-section',
  CHANNEL_CARD: 'channel-card',
  CHANNEL_ENABLED_TOGGLE: 'enabled-toggle',
  CHANNEL_MENTION_ONLY_TOGGLE: 'mention-only-toggle',
  CHANNEL_AUTO_OVERRIDE_SELECT: 'channel-auto-override-select',
  CHANNEL_BLOCKED_KEYWORDS_INPUT: 'keyword-input',
  ENABLED_TOGGLE: 'enabled-toggle',
  MENTION_ONLY_TOGGLE: 'mention-only-toggle',
  OVERRIDE_INHERIT: 'override-inherit',
  OVERRIDE_ALWAYS_ON: 'override-always_on',
  OVERRIDE_ALWAYS_OFF: 'override-always_off',
  KEYWORD_CHIP: 'keyword-chip',
  REMOVE_KEYWORD: 'remove-keyword',
  KEYWORD_INPUT: 'keyword-input',

  // --- SettingsPage (F-008) safety section ---
  SAFETY_SECTION: 'safety-section',
  SAFETY_ENABLED_TOGGLE: 'safety-enabled-toggle',
  SAFETY_RULE_MONEY_TOGGLE: 'safety-rule-money-toggle',

  // --- ChannelCard (F-008) per-space override ---
  CHANNEL_SAFETY_SKIP_TOGGLE: 'channel-safety-skip-toggle',

  // --- ApprovalCard (F-008) safety badge ---
  SAFETY_BADGE: 'safety-badge',
  SAFETY_REASON: 'safety-reason',

  // --- SettingsPage (F-004) profile section ---
  PROFILE_SECTION: 'profile-section',
  PROFILE_GROUP: 'profile-group',
  PROFILE_GROUP_PUBLIC: 'profile-group-public',
  PROFILE_GROUP_PRIVATE: 'profile-group-private',
  PROFILE_GROUP_SECRET: 'profile-group-secret',
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

  // Safety Rails (F-008, Sprint 4)
  SAFETY_RULES: '/api/safety/rules',
  SAFETY_CHECK: '/api/safety/check',

  // D-Skip Mark (CR-001 / F-011, Sprint 5)
  CLAUDE_SKIP: '/api/claude/skip',
  CLAUDE_SKIPPED: '/api/claude/skipped',
  CLAUDE_UNSKIP: '/api/claude/unskip',
  CLAUDE_PENDING: '/api/claude/pending',

  // Sync History (F-012, Sprint 6)
  SYNC_HISTORY_START: '/api/extension/sync-history/start',
  SYNC_HISTORY_BATCH: '/api/extension/sync-history',
  SYNC_HISTORY_COMPLETE: '/api/extension/sync-history/complete',
  SYNC_HISTORY_STATUS: '/api/extension/sync-history/status',

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

  // Aliases for f005 scenario references
  SAVED: '已儲存',
  SAVE_FAILED: '儲存失敗，請重試',

  // SettingsPage — Profile facts
  PROFILE_ADDED: '已新增',
  PROFILE_DELETED: '已刪除',

  // PendingPage — Skip / Unskip (F-013)
  SKIPPED: '已 skip',
  UNSKIPPED: '已復原 skip',
  SKIP_FAILED: 'Skip 失敗，請重試',
  UNSKIP_FAILED: '復原失敗，請重試',
  PENDING_EMPTY: '目前沒有等待處理的訊息 🎉',

  // Extension popup — Sync history (F-012/F-004)
  SYNC_DONE: '同步完成',
  SYNC_FAILED: '同步失敗，請重試',
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

  // PendingPage tabs (F-013)
  PENDING_TAB: 'Pending',
  SKIPPED_TAB: 'Skipped',
  DRAFTED_TAB: 'Drafted',
  BUTTON_SKIP: 'Skip',
  BUTTON_UNSKIP: 'Unskip',
  MENTIONED_FILTER_LABEL: '只看 @我',

  // SettingsPage Safety Rails (F-008, Sprint 4)
  SAFETY_SECTION_TITLE: '安全護欄',
  SAFETY_ENABLED_LABEL: '啟用安全護欄',
  SAFETY_ENABLED_HINT: '偵測到金錢相關內容時自動降級為 draft，等待人工審核',
  SAFETY_RULE_MONEY_LABEL: '金錢偵測',
  SAFETY_RULE_MONEY_HINT: '金額、轉帳、報價、付款承諾',
  CHANNEL_SAFETY_SKIP_LABEL: '跳過此頻道安全護欄',

  // ApprovalCard safety badge (F-008)
  SAFETY_BADGE_MONEY: '⚠️ 金錢內容',
  SAFETY_BADGE_PREFIX: '⚠️',
  SAFETY_BADGE_LABEL: '安全護欄',
  SAFETY_FLAG_MONEY: '金錢',
  SAFETY_BADGE_ARIA_LABEL: '安全護欄警示，點擊查看觸發原因',
} as const

// ─── D-Skip Reason Enum ───────────────────────────────────────────────────────
// Skill skip reason values（軟 enum，對應 f011-skip-mark.md § Business Rules）

export const SKIP_REASONS = {
  // Skill-driven skip reasons
  PURE_ACK: 'pure-ack',
  OVERHEARD: 'overheard',
  POLICY_REDLINE: 'policy-redline',
  NOT_TARGETED: 'not-targeted',
  LOW_INFO: 'low-info',

  // Backend-auto skip reasons
  NOT_MENTIONED: 'not-mentioned',
  SELF_SENT: 'self-sent',
  BLOCKED_KEYWORD_PREFIX: 'blocked-keyword:',
} as const

export type SkipReason = (typeof SKIP_REASONS)[keyof typeof SKIP_REASONS]

// ─── D-Skip skipped_by Enum ───────────────────────────────────────────────────
// 誰執行了 skip（對應 migration 0018 CHECK constraint）

export const SKIPPED_BY = {
  SKILL: 'skill',
  BACKEND_AUTO: 'backend_auto',
  MANUAL: 'manual',
  BACKFILL: 'backfill',
} as const

export type SkippedBy = (typeof SKIPPED_BY)[keyof typeof SKIPPED_BY]

// ─── Manual Skip Reasons (F-013) ─────────────────────────────────────────────
// Reason enum for manual skip via /pending page

export const MANUAL_SKIP_REASONS = {
  PURE_ACK: 'pure-ack',
  OVERHEARD: 'overheard',
  POLICY_REDLINE: 'policy-redline',
  NOT_TARGETED: 'not-targeted',
  LOW_INFO: 'low-info',
  MANUAL_OTHER: 'manual-other',
} as const

export type ManualSkipReason = (typeof MANUAL_SKIP_REASONS)[keyof typeof MANUAL_SKIP_REASONS]

// ─── WebSocket Event Types (F-013) ────────────────────────────────────────────
// UIEvent type values for the /ws/ui WebSocket channel.

export const WS_EVENT_TYPES = {
  INBOX_CHANGED: 'inbox_changed',
  SETTINGS_CHANGED: 'settings_changed',
  SPACES_CHANGED: 'spaces_changed',
  DRAFT_CREATED: 'draft_created',
  DRAFT_REMOVED: 'draft_removed',
  SETTINGS_UPDATED: 'settings_updated',
  PENDING_CHANGED: 'pending_changed',
} as const

export type WsEventType = (typeof WS_EVENT_TYPES)[keyof typeof WS_EVENT_TYPES]

// ─── pending_changed Reason Enum (F-013) ─────────────────────────────────────
// reason values for WS_EVENT_TYPES.PENDING_CHANGED events.

export const PENDING_CHANGED_REASONS = {
  NEW_MESSAGE: 'new_message',
  SKIPPED: 'skipped',
  UNSKIPPED: 'unskipped',
  DRAFTED: 'drafted',
} as const

export type PendingChangedReason = (typeof PENDING_CHANGED_REASONS)[keyof typeof PENDING_CHANGED_REASONS]
