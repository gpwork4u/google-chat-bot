# F-011: D-skip Mark Mechanism

## Status: planned
## Sprint: 5
## Priority: P0
## Lane: backend
## Source: CR-001

---

## 使用者故事

As a 單人使用者運行 chat-drafts skill loop
I want skill 對 D 類訊息標記成 backend 已知狀態
So that loop 不會每分鐘重複處理同一批訊息，token 成本降到僅針對「真的需要 draft」的新訊息

---

## 範圍（In Scope）

1. messages table 新增 skip 三欄（migration 0018）
2. 新 API endpoint 三支：`/api/claude/skip`、`/api/claude/skipped`、`/api/claude/unskip`
3. `/api/claude/pending` SQL 過濾 `skipped_at IS NULL`
4. chat_processor 收到新訊息時 backend 自動 skip 三類：
   - mention-only 模式 + 未被 mention
   - blocked_keywords 命中
   - sender 是 self
5. Skill `chat-drafts` D 類判定後呼叫 `/api/claude/skip`
6. Backfill 一次性工具（`cmd/backfill-skip` 或 `scripts/backfill-skip.sh`）

## 非範圍（Out of Scope）

- Settings UI 「Skipped messages」分頁（後續 sprint）
- Skill 端離線 retry queue
- 統計儀表

---

## API Contract

### `POST /api/claude/skip`
Auth：localhost only（同其他 /api/claude/* endpoint 慣例）

Request Body:
| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| message_id | string | yes | 必須存在 messages 表 |
| reason | string | yes | 1..200 chars |
| by | string | no | enum: `skill` / `backend_auto` / `manual` / `backfill`，default `skill` |

Response 200:
```json
{
  "message_id": "msg_abc123",
  "skipped_at": "2026-05-07T03:14:00Z",
  "skip_reason": "pure-ack",
  "skipped_by": "skill"
}
```

Idempotent：同 message_id 第二次呼叫不更新 skipped_at，回現值，HTTP 200。

Errors:
| Status | Code | Condition |
|--------|------|-----------|
| 400 | INVALID_INPUT | reason 為空 / 超過 200 字 / by 不在 enum |
| 404 | NOT_FOUND | message_id 不存在 |

### `GET /api/claude/skipped`

Query params:
- `limit` (int, default 50, max 200)
- `since` (ISO 8601, optional)
- `by` (string, optional) — filter by skipped_by

Response 200:
```json
{
  "items": [{
    "message_id": "msg_abc123",
    "space_key": "spaces/AAA",
    "sender_name": "Alice",
    "text": "好",
    "skipped_at": "2026-05-07T03:14:00Z",
    "skip_reason": "pure-ack",
    "skipped_by": "skill"
  }],
  "next_since": "2026-05-07T03:14:00Z"
}
```

### `POST /api/claude/unskip`

Request:
```json
{ "message_id": "msg_abc123" }
```

Response 200:
```json
{
  "message_id": "msg_abc123",
  "skipped_at": null,
  "skip_reason": null,
  "skipped_by": null
}
```

Errors:
| Status | Code | Condition |
|--------|------|-----------|
| 404 | NOT_FOUND | message_id 不存在 |

---

## Data Model

### Migration 0018
```sql
ALTER TABLE messages
  ADD COLUMN skipped_at  TIMESTAMPTZ NULL,
  ADD COLUMN skip_reason TEXT NULL,
  ADD COLUMN skipped_by  TEXT NULL CHECK (
    skipped_by IN ('skill', 'backend_auto', 'manual', 'backfill')
  );

CREATE INDEX idx_messages_pending_active
  ON messages (created_at DESC)
  WHERE skipped_at IS NULL;
```

---

## Business Rules

1. **Idempotent**：同 message_id 重複 skip 不覆寫 skipped_at（保留首次時間以利稽核）。
2. **Pending query**：`/api/claude/pending` 必須 `AND m.skipped_at IS NULL`。
3. **Backend 自動 skip 順序**：在 chat_processor 寫入 messages 之後、推 skill 之前判定。三條件擇一觸發即 skip。
4. **Skill skip reason enum**（軟 enum，不在 DB 強制，但 SKILL.md 約定）：
   - `pure-ack` / `overheard` / `policy-redline` / `not-targeted` / `low-info`
5. **Backend auto reason 格式**：
   - `not-mentioned` / `blocked-keyword:<keyword>` / `self-sent`
6. **Unskip** 清空三欄回 NULL，下次 pending query 該 message 會重新出現（讓 skill 重新判定）。
7. **Backfill 安全**：只處理 `created_at < NOW() - 10 minutes` 的 message，避免誤殺剛進來尚未處理的訊息。

---

## Scenarios

完整場景見 `specs/features/f011-skip-mark.feature`。

涵蓋：
- POST /skip happy path
- POST /skip idempotent 不覆寫 skipped_at
- POST /skip 400/404
- GET /skipped 列表 + filter
- POST /unskip 還原
- Pending query 排除 skipped
- chat_processor 三條件自動 skip
- Backfill --dry-run / --apply
- 回歸：F-002 approval queue 不含 skipped 訊息

---

## 相關
- CR-001: `specs/changes/CR-001.md`
- 影響 features: F-002（approval queue）
