# F-012: Extension Sync History

## Status: planned
## Sprint: 6
## Priority: P0
## Lane: pipeline (extension) + backend (endpoints + migration)
## Source: CR-002

---

## 使用者故事

As a 單人使用者
I want 主動觸發 Chrome extension 拉**全 space 歷史訊息**進 backend
So that 之後 space-facts-mining skill 可從完整歷史 mine 出 per-space context，提升 chat-drafts 回覆品質

---

## 範圍（In Scope）

1. Migration 0020: `space_history_sync_jobs` table
2. Backend endpoints：
   - `POST /api/extension/sync-history/start`
   - `POST /api/extension/sync-history` (batch insert)
   - `GET /api/extension/sync-history/status`
3. Extension popup 加兩個按鈕：
   - **Sync all spaces**（全 space 拉）
   - **Sync this space**（只拉當前打開的 space — 需要 content script 提示 popup 當前 space_key）
4. Extension content.js 使用 batchexecute 拉每個 space 的全部 topics + messages
5. Backend message 寫入時用 `message_id` PK 去重（idempotent）
6. Popup 顯示同步進度（polling status endpoint，每 2 秒）

## 非範圍（Out of Scope）

- WS push 進度（後續優化）
- Incremental sync（本 sprint 只做 full sync，重複跑靠 PK 去重）
- 多帳號
- Sync 完後自動觸發 mining（mining 由獨立 skill 控制）

---

## API Contract

### `POST /api/extension/sync-history/start`
Auth：localhost only。

Request body:
| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| job_id | string | yes | UUID v4，extension 端產生 |
| space_key | string | no | 缺省 = 全 space |

Response 201:
```json
{
  "job_id": "uuid-string",
  "status": "running",
  "space_key": "spaces/AAA" | null,
  "started_at": "2026-05-14T10:00:00Z"
}
```

Errors:
| Status | Code | Condition |
|--------|------|-----------|
| 400 | INVALID_INPUT | job_id 非 UUID v4 格式 |
| 409 | JOB_EXISTS | 同 job_id 已存在 |

### `POST /api/extension/sync-history`
Auth：localhost only。Batch insert。

Request body:
```json
{
  "job_id": "uuid-string",
  "messages": [
    {
      "message_id": "spaces/AAA/messages/BBB",
      "space_key": "spaces/AAA",
      "space_name": "Team #frontend",
      "thread_key": "TP123",
      "sender_id": "users/CCC",
      "sender_name": "Alice",
      "body": "...",
      "observed_at": "2026-05-12T09:00:00Z",
      "mentioned": false
    }
  ]
}
```

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| job_id | string | yes | 必須對應 running job |
| messages | array | yes | 1..500 筆 / 批次 |
| messages[].message_id | string | yes | unique key |
| messages[].space_key | string | yes | |
| messages[].space_name | string | no | 空字串允許 |
| messages[].sender_name | string | yes | |
| messages[].body | string | yes | |
| messages[].observed_at | string | yes | ISO 8601 |
| messages[].mentioned | bool | no | default false |

Response 200:
```json
{
  "inserted": 42,
  "duplicates": 8,
  "failed": 0,
  "job_total_so_far": 152
}
```

Errors:
| Status | Code | Condition |
|--------|------|-----------|
| 400 | INVALID_INPUT | messages 為空 / 任筆缺 required field / batch > 500 |
| 404 | JOB_NOT_FOUND | job_id 不存在或非 running |

### `GET /api/extension/sync-history/status?job_id=<id>`

Response 200:
```json
{
  "job_id": "uuid",
  "status": "running" | "completed" | "failed" | "cancelled",
  "space_key": "spaces/AAA" | null,
  "total_messages": 152,
  "inserted_messages": 144,
  "duplicate_messages": 8,
  "failed_messages": 0,
  "started_at": "...",
  "completed_at": "..." | null,
  "error_message": null
}
```

Errors:
| Status | Code | Condition |
|--------|------|-----------|
| 404 | JOB_NOT_FOUND | job_id 不存在 |

### `POST /api/extension/sync-history/complete`
Extension 端宣告 sync 結束（最後一個 batch 後呼叫）。

Request:
```json
{ "job_id": "uuid", "status": "completed" | "failed", "error_message"?: "string" }
```

Response 200。

---

## Data Model

### Migration 0020

```sql
CREATE TABLE space_history_sync_jobs (
    id BIGSERIAL PRIMARY KEY,
    job_id TEXT NOT NULL UNIQUE,
    space_key TEXT NULL,
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN (
        'running', 'completed', 'failed', 'cancelled'
    )),
    total_messages INTEGER NOT NULL DEFAULT 0,
    inserted_messages INTEGER NOT NULL DEFAULT 0,
    duplicate_messages INTEGER NOT NULL DEFAULT 0,
    failed_messages INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ NULL,
    error_message TEXT NULL
);

CREATE INDEX idx_sync_jobs_recent ON space_history_sync_jobs (started_at DESC);
```

`messages` 表既有 schema 不變 — 寫入時 ON CONFLICT (message_id) DO NOTHING。

---

## Business Rules

1. **Idempotent**：同 `message_id` 第二次寫入算 duplicate，不更新原 row
2. **Job timeout**：sync_jobs status=running 超過 60 分鐘自動標 failed（backend 啟動時或 cron）
3. **Batch size 上限**：500 messages / batch，避免 request body 過大
4. **Job lifecycle**：start → 多次 `POST /sync-history` → `POST /sync-history/complete`
5. **Space sync 完成判定**：extension 宣告 complete（不靠 backend 推測）
6. **Disk usage 上限**：本 sprint 不做硬上限，假設 messages 表有合理空間（單 user，預估 < 100k 訊息）

---

## Acceptance Criteria

### Happy Path
- [ ] AC-1: 從 popup 點「Sync this space」，job_id 產生、`POST /sync-history/start` 回 201
- [ ] AC-2: Extension 拉到歷史訊息後分批 `POST /sync-history`，每批回 `inserted`/`duplicates` 數量
- [ ] AC-3: 同步完成後 `POST /sync-history/complete`，status 變 `completed`
- [ ] AC-4: 全程 popup 顯示「同步中... N / M」進度（polling status endpoint）
- [ ] AC-5: 同步完成後 popup 顯示「同步完成（N 則新增 / M 則重複）」toast `{TOAST.syncDone}`
- [ ] AC-6: 對既有訊息再 sync 一次 → 全部變 duplicates，messages 表 row 數不變

### Error Handling
- [ ] AC-7: `POST /sync-history/start` 帶非 UUID → 400 / `INVALID_INPUT`
- [ ] AC-8: `POST /sync-history` 帶不存在的 `job_id` → 404 / `JOB_NOT_FOUND`
- [ ] AC-9: `POST /sync-history` 帶 501 筆 messages → 400 / `INVALID_INPUT`
- [ ] AC-10: 同 `job_id` 兩次呼叫 start → 第二次 409 / `JOB_EXISTS`
- [ ] AC-11: Extension popup 關閉中斷 sync → 60 分鐘後 backend 標 failed；user 重新觸發產新 job_id 可繼續（PK 去重）
- [ ] AC-12: Network 失敗 → popup 顯示 toast `{TOAST.syncFailed}` 並可重試

### Edge Cases
- [ ] AC-13: Sync 中途某 batch 個別 message 缺 `sender_name` → 該 message `failed` 計數 +1，其他正常 insert
- [ ] AC-14: Space_key 為空字串 → 該 message rejected，failed +1
- [ ] AC-15: `body` 含特殊字元（emoji / SQL keyword / very long > 10KB）→ 正常 insert
- [ ] AC-16: `observed_at` 早於 5 年前 → 仍 insert（不檢查時間範圍）
- [ ] AC-17: Job 持續 ≥ 60 分鐘無新 batch → backend 偵測並標 `failed` + `error_message="timeout"`
- [ ] AC-18: `Sync all spaces` 跑時若某 space 失敗（batchexecute error）→ 該 space 略過，其他繼續，job 最終 status 仍 `completed` 但 `failed_messages > 0`

---

## Scenarios

`f012-extension-sync-history.feature`：
- POST /sync-history/start happy + 400 + 409
- POST /sync-history happy + idempotent + 400 + 404
- POST /sync-history/complete
- GET /sync-history/status
- E2E：extension popup → 點按鈕 → 結束狀態正確

---

## 相關

- CR-002: `specs/changes/CR-002.md`
- 後續 features: F-014（mining skill 消費 messages）
- 影響：messages 表（既有，純 insert）
