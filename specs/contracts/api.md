# API Contract

Sprint 1 + Sprint 2 所有 `/api/*` endpoints。

> **Owner** = 後端負責實作  
> **Consumer** = 呼叫此 endpoint 的客端

---

## 審核佇列 (Approvals / F-002)

### `GET /api/drafts`
- **Owner**: backend  
- **Consumer**: ApprovalsPage (SWR), QA  
- **Query params**: `status=pending` (optional), `limit=N` (1-500, default 100)  
- **Response**:
  ```json
  { "drafts": [ DraftForUI ] }
  ```
  DraftForUI 欄位：`id`, `space_id`, `space_name`, `sender_id`, `sender_name`, `original_message`, `draft_content`, `category`, `context_messages`, `status`, `created_at`

### `POST /api/drafts/{id}/approve`
- **Owner**: backend (extension.go)  
- **Consumer**: ApprovalsPage  
- **Body**: `{ "content": "<edited or original draft_content>" }`  
- **Response**: `200 { "ok": true }`

### `POST /api/drafts/{id}/reject`
- **Owner**: backend (extension.go)  
- **Consumer**: ApprovalsPage  
- **Body**: (empty)  
- **Response**: `200 { "ok": true }`

### `PATCH /api/drafts/{id}`
- **Owner**: backend (extension.go)  
- **Consumer**: ApprovalsPage (save draft)  
- **Body**: `{ "content": "<new content>" }`  
- **Response**: `200 { "ok": true }`

---

## 已送出記錄 (Sent Log / F-003)

### `GET /api/sent`
- **Owner**: backend (sent.go)  
- **Consumer**: SentPage (useSent hook), QA  
- **Query params**:
  - `mode`: `approved` | `auto` (optional, default all)
  - `space_ids`: repeated param for multi-select space filter
  - `from`: ISO 8601 date `YYYY-MM-DD` (inclusive, default 7 days ago)
  - `to`: ISO 8601 date `YYYY-MM-DD` (inclusive, default today)
  - `q`: substring search on `sent_content`
  - `cursor`: opaque pagination cursor
  - `limit`: 1-100 (default 20; > 100 → 400 `INVALID_PARAM`)
- **Response**:
  ```json
  { "items": [ SentRecord ], "next_cursor": "<string|empty>" }
  ```
  SentRecord 欄位：`id`, `space_id`, `space_name`, `sender_id`, `sender_name`, `trigger_message`, `sent_content`, `mode`, `edited_by_user`, `category`, `sent_at`

---

## 設定 (Settings / F-004)

### `GET /api/settings`
- **Owner**: backend  
- **Consumer**: SettingsPage (useSettings hook)  
- **Response**: `{ "auto_mode": bool, "freshness_window_minutes": int, "debug_mode": bool }`

### `PATCH /api/settings`
- **Owner**: backend  
- **Consumer**: SettingsPage  
- **Body** (partial): `{ "auto_mode"?: bool, "freshness_window_minutes"?: int, "debug_mode"?: bool }`  
- **Response**: updated settings object

### `GET /api/spaces`
- **Owner**: backend  
- **Consumer**: SettingsPage, SentPage (space filter options)  
- **Response**: `{ "spaces": [ SpaceSetting ] }`  
  SpaceSetting: `space_key`, `space_name`, `enabled`, `mention_only`, `auto_mode_override`, `blocked_keywords[]`

### `POST /api/spaces/toggle`
- **Owner**: backend  
- **Consumer**: SettingsPage (channel enabled toggle)  
- **Body**: `{ "space_id": "<id>", "enabled": bool }`  
- **Response**: `200 { "success": true }`

### `PATCH /api/spaces/{space_id}`
- **Owner**: backend  
- **Consumer**: SettingsPage (mention_only, auto_mode_override, blocked_keywords)  
- **Body** (partial): `{ "mention_only"?: bool, "auto_mode_override"?: string, "blocked_keywords"?: string[] }`  
- **Response**: `200 { "success": true }`

### `GET /api/claude/profile`
- **Owner**: backend  
- **Consumer**: SettingsPage (profile facts)  
- **Query params**: `include_secret=1` to include secret visibility facts  
- **Response**: `{ "facts": [ ProfileFact ] }`  
  ProfileFact: `id`, `key`, `value`, `visibility` (`public|private|secret`), `note`, `updated_at`

### `POST /api/claude/profile`
- **Owner**: backend  
- **Consumer**: SettingsPage (add fact)  
- **Body**: `{ "key": str, "value": str, "visibility": "public"|"private"|"secret" }`  
- **Response**: `201 { id, key, value, visibility }`

### `PATCH /api/claude/profile/{id}`
- **Owner**: backend  
- **Consumer**: SettingsPage (edit fact)  
- **Body** (partial): `{ "key"?: str, "value"?: str, "visibility"?: str }`  
- **Response**: `200 { "success": true }`

### `DELETE /api/claude/profile/{id}`
- **Owner**: backend  
- **Consumer**: SettingsPage (delete fact)  
- **Response**: `200 { "success": true }`

---

## Sync History (F-012, Sprint 6)

### `POST /api/extension/sync-history/start`
- **Owner**: backend (sync_history.go)
- **Consumer**: Chrome extension popup (popup.js)
- **Auth**: localhost only
- **Body**: `{ "job_id": "<UUID v4>", "space_key"?: "spaces/AAA" }`
- **Response 201**: `{ "job_id": "...", "status": "running", "space_key": ..., "started_at": "..." }`
- **Errors**: `400 INVALID_INPUT` (bad UUID), `409 JOB_EXISTS`

### `POST /api/extension/sync-history`
- **Owner**: backend (sync_history.go)
- **Consumer**: Chrome extension content.js (postSyncHistoryBatch)
- **Auth**: localhost only
- **Body**: `{ "job_id": "<UUID>", "messages": [ SyncMessage ] }`
  - `SyncMessage` fields: `message_id`, `space_key`, `space_name`, `thread_key`, `sender_id`, `sender_name`, `body`, `observed_at`, `mentioned`
  - Batch limit: 1–500 messages
- **Response 200**: `{ "inserted": N, "duplicates": N, "failed": N, "job_total_so_far": N }`
- **Errors**: `400 INVALID_INPUT` (empty/oversized batch), `404 JOB_NOT_FOUND`

### `POST /api/extension/sync-history/complete`
- **Owner**: backend (sync_history.go)
- **Consumer**: Chrome extension content.js (completeSyncHistory)
- **Auth**: localhost only
- **Body**: `{ "job_id": "<UUID>", "status": "completed" | "failed", "error_message"?: "string" }`
- **Response 200**: `{ "ok": true }`
- **Errors**: `404 JOB_NOT_FOUND`

### `GET /api/extension/sync-history/status`
- **Owner**: backend (sync_history.go)
- **Consumer**: Chrome extension popup (progress polling)
- **Auth**: localhost only
- **Query params**: `job_id=<UUID>`
- **Response 200**: `{ "job_id", "status", "space_key", "total_messages", "inserted_messages", "duplicate_messages", "failed_messages", "started_at", "completed_at", "error_message" }`
- **Errors**: `404 JOB_NOT_FOUND`

---

## Pending / Skipped (F-013, Sprint 6)

### `GET /api/claude/pending`
- **Owner**: backend (claude.go)
- **Consumer**: PendingPage (frontend), Claude Code skill
- **Query params**:
  - `limit` (int, 1..200, default 50)
  - `offset` (int, >= 0, default 0)
  - `space_key` (string, exact match)
  - `sender_contains` (string, ILIKE substring)
  - `body_contains` (string, ILIKE substring)
  - `mentioned_only` (bool, `true` to filter `mentioned=true`)
  - `debug` (bool)
- **Response**:
  ```json
  {
    "pending": [ ClaudePending ],
    "total": 42,
    "next_offset": 50,
    "reply_only_when_mentioned": bool,
    "auto_mode": bool,
    "blocked_keywords": "...",
    "local_user_name": "...",
    "local_user_email": "...",
    "debug": bool
  }
  ```
- **Errors**: `400 INVALID_PARAM` (limit/offset out of range)

### `GET /api/claude/skipped`
- **Owner**: backend (claude_skip.go)
- **Consumer**: PendingPage (Skipped tab), QA
- **Query params**:
  - `limit` (int, 1..200, default 50)
  - `offset` (int, >= 0, default 0)
  - `since` (RFC3339)
  - `by` (string, skipped_by filter)
  - `space_key` (string, exact match)
  - `sender_contains` (string, ILIKE substring)
  - `body_contains` (string, ILIKE substring)
- **Response**:
  ```json
  {
    "items": [ SkippedItem ],
    "total": 99,
    "next_offset": 50,
    "next_since": "2026-01-01T00:00:00Z"
  }
  ```
- **Errors**: `400 INVALID_PARAM` (limit < 1 or > 200, offset < 0, since not RFC3339)

---

## WebSocket

### `GET /ws/ui`
- **Owner**: backend (ws.go)  
- **Consumer**: WebSocketProvider (frontend)  
- **Events (server → client)**:
  - `{ "type": "draft_created", "draft": { ...DraftForUI } }`
  - `{ "type": "draft_removed", "draft_id": "<string>" }`
  - `{ "type": "settings_updated", "settings": { ...Settings } }`
  - `{ "type": "pending_changed", "reason": "new_message"|"skipped"|"unskipped"|"drafted", "message_id": "<string>" }`
  - Legacy (backwards compat): `{ "type": "inbox_changed" }`, `{ "type": "settings_changed" }`

---

## Debug (dev-only — NODE_ENV=development or INJECT_DRAFT_ENABLED=1)

### `POST /api/debug/inject-draft`
- **Owner**: backend (drafts.go)  
- **Consumer**: QA (legacy, use inject-ws-event instead)  
- **Body**: `{ "draft"?: { ...DraftPayload } }` or flat legacy fields  
- **Response**: `201 { "ok": true, "draft_id": "<id>" }`

### `POST /api/debug/inject-ws-event`
- **Owner**: backend (debug_inject_ws.go)  
- **Consumer**: QA (f002, f004 step definitions)  
- **Body**:
  ```json
  // draft_created
  { "type": "draft_created", "draft": { "id": "X", ... } }
  // draft_removed
  { "type": "draft_removed", "draft_id": "B" }
  // settings_updated
  { "type": "settings_updated", "settings": { "auto_mode": true, ... } }
  ```
- **Response**: `200 { "ok": true, "type": "<type>" }`

### `POST /api/debug/seed-drafts`
- **Owner**: backend (debug_seed.go)  
- **Consumer**: QA (f002 step definitions via seedDrafts helper)  
- **Query params**: `reset=1` to clear existing pending drafts first  
- **Body**: `{ "drafts": [ seedDraftItem ] }`  
- **Response**: `201 { "ok": true, "created": [id, ...] }`

### `POST /debug/simulate_message`
- **Owner**: backend (debug.go)  
- **Consumer**: manual testing  
- **Body**: `{ "space_key", "space_name", "thread_key", "sender_name", "body", "sender_is_me", "with_draft" }`  
- **Response**: `200 { "ok": true, "message_id", "inserted", "draft_created" }`
