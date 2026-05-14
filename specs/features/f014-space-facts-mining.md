# F-014: Space Facts Mining (skill + backend)

## Status: planned
## Sprint: 7
## Priority: P0
## Lane: backend (主) + pipeline (skill)
## Source: CR-002

---

## 使用者故事

As a 單人使用者
I want 從每個 space 的歷史訊息自動萃取 5 類事實（產品 / 我的角色 / 術語 / pinned 決策 / 人物關係）
So that chat-drafts skill 在回覆時有 per-space 長期記憶，不再每次都用通用 prompt

---

## 範圍（In Scope）

1. Migration 0019: `space_facts` table
2. Migration 0021: `space_facts_mining_jobs` (queue)
3. Backend endpoints:
   - `GET /api/space-facts` (含 query params)
   - `GET /api/space-facts/candidates`
   - `POST /api/space-facts`
   - `PATCH /api/space-facts/{id}`
   - `DELETE /api/space-facts/{id}`
   - `POST /api/space-facts/{id}/approve`
   - `POST /api/space-facts/{id}/reject`
   - `POST /api/space-facts/mining-queue` (enqueue a space)
   - `GET /api/space-facts/mining-queue` (list pending jobs)
   - `PATCH /api/space-facts/mining-queue/{space_key}` (update job status by skill)
4. 若 `GET /api/messages?space_key=...&limit=200` 不存在則新增（mining skill 要讀歷史訊息）
5. 新 skill：`.claude/skills/space-facts-mining/SKILL.md` + references/
6. Skill 流程：
   - 從 `GET /api/space-facts/mining-queue?status=pending&limit=3` 拿要 mine 的 spaces
   - 對每個 space `GET /api/messages?space_key=...&limit=200`
   - LLM 萃取 5 類事實
   - `POST /api/space-facts` with `status="candidate"`, `created_by="mining-skill"`, `source_message_ids=[...]`
   - `PATCH /api/space-facts/mining-queue/{space_key}` 標 completed

## 非範圍（Out of Scope）

- UI（在 F-015）
- chat-drafts skill 整合（在 F-015）
- 自動 enqueue（mining queue）依 message threshold — Sprint 7 內 enqueue 由 manual 或 SettingsPage 觸發；自動規則交給後續優化
- Fact 合併 / 去重（不同 mining round 產出類似 fact → 由 user approve 時手動合併）

---

## API Contract

### `GET /api/space-facts`
Query params:
| Param | Type | Default | Notes |
|-------|------|---------|-------|
| space_key | string | (all) | 完整比對 |
| category | string | (all) | enum: product / my-role / glossary / pinned-decision / relation |
| status | string | `approved` | enum: candidate / approved / rejected |
| visibility | string | (excludes secret) | enum: public / private / secret |
| include_secret | bool | false | true 才回 secret |

Response 200:
```json
{
  "facts": [
    {
      "id": 1,
      "space_key": "spaces/AAA",
      "category": "product",
      "content": "...",
      "visibility": "private",
      "status": "approved",
      "source_message_ids": [123, 124, 130],
      "note": "",
      "created_by": "mining-skill",
      "created_at": "...",
      "updated_at": "...",
      "approved_at": "..."
    }
  ]
}
```

**Secret rule**：預設不回 secret visibility 的 facts，必須顯式帶 `include_secret=1` 才回。

### `GET /api/space-facts/candidates`
等同 `GET /api/space-facts?status=candidate`。Query params 同上 + `limit` (default 50, max 200)。

### `POST /api/space-facts`
Body:
| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| space_key | string | yes | 必須存在於 spaces directory |
| category | string | yes | enum 五選一 |
| content | string | yes | 1..1000 chars |
| visibility | string | no | enum，default `private` |
| source_message_ids | int[] | no | default [] |
| note | string | no | default '' |
| created_by | string | no | enum: `mining-skill` / `manual`，default `manual` |

`status` 自動由 backend 設定：
- `created_by == "mining-skill"` → `candidate`
- `created_by == "manual"` → `approved`，同時 `approved_at = NOW()`

Response 201: 完整 row。

Errors:
| Status | Code | Condition |
|--------|------|-----------|
| 400 | INVALID_INPUT | content 為空 / > 1000 / category 不在 enum |
| 404 | SPACE_NOT_FOUND | space_key 在 spaces directory 不存在 |

### `PATCH /api/space-facts/{id}`
Body (partial)：`content` / `visibility` / `status` / `note` / `category`

Status 變 `approved` 時 set `approved_at = NOW()`。

Response 200: 完整 row。

Errors: 404 NOT_FOUND。

### `DELETE /api/space-facts/{id}`
Hard delete。Response 200。

### `POST /api/space-facts/{id}/approve`
語法糖 == PATCH `{status: "approved"}`。Response 200: row。

### `POST /api/space-facts/{id}/reject`
語法糖 == PATCH `{status: "rejected"}`。Response 200: row。

### `POST /api/space-facts/mining-queue`
Body: `{ "space_key": "spaces/AAA" }`

效果：
- 若 space_key 在 queue 不存在 → INSERT status=pending
- 若存在且 status ∈ (`completed`, `failed`) → UPDATE status=pending, error_message=NULL
- 若存在且 status=`pending` → 不動，回現狀
- 若存在且 status=`running` → 409 JOB_RUNNING

Response 201 / 200: job row。

### `GET /api/space-facts/mining-queue`
Query: `status` (default `pending`), `limit` (default 50)

Response:
```json
{ "jobs": [{ "space_key": "...", "status": "pending", "last_mined_at": null, ... }] }
```

### `PATCH /api/space-facts/mining-queue/{space_key}`
Body (partial): `status` / `last_mined_message_id` / `candidates_generated` / `error_message`

Skill 在 mining 開始時 `PATCH {status: "running"}`，結束時 `PATCH {status: "completed", last_mined_message_id, candidates_generated}` 或 `{status: "failed", error_message}`。

### `GET /api/messages?space_key=<key>&limit=N&before_id=<id>`
(若 backend 已有則沿用；若無則新增)

Query:
| Param | Type | Default | Notes |
|-------|------|---------|-------|
| space_key | string | required | |
| limit | int | 50 | 1..500 |
| before_id | int | (latest) | 用於分頁，回 id < before_id 的訊息 |
| since | ISO 8601 | (none) | 取 observed_at >= since |

Response:
```json
{
  "messages": [
    {
      "id": 123,
      "message_id": "spaces/AAA/messages/BBB",
      "space_key": "spaces/AAA",
      "thread_key": "TP123",
      "sender_id": "users/CCC",
      "sender_name": "Alice",
      "body": "...",
      "observed_at": "...",
      "mentioned": false,
      "skipped_at": null
    }
  ],
  "next_before_id": 100
}
```

---

## Data Model

### Migration 0019: space_facts

```sql
CREATE TABLE space_facts (
    id BIGSERIAL PRIMARY KEY,
    space_key TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN (
        'product', 'my-role', 'glossary', 'pinned-decision', 'relation'
    )),
    content TEXT NOT NULL,
    visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN (
        'public', 'private', 'secret'
    )),
    status TEXT NOT NULL DEFAULT 'candidate' CHECK (status IN (
        'candidate', 'approved', 'rejected'
    )),
    source_message_ids BIGINT[] NOT NULL DEFAULT '{}',
    note TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL CHECK (created_by IN (
        'mining-skill', 'manual'
    )),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_at TIMESTAMPTZ NULL
);

CREATE INDEX idx_space_facts_active
    ON space_facts (space_key, category)
    WHERE status = 'approved';

CREATE INDEX idx_space_facts_candidates
    ON space_facts (space_key, created_at DESC)
    WHERE status = 'candidate';
```

### Migration 0021: space_facts_mining_jobs

```sql
CREATE TABLE space_facts_mining_jobs (
    id BIGSERIAL PRIMARY KEY,
    space_key TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'running', 'completed', 'failed'
    )),
    last_mined_message_id BIGINT NULL,
    last_mined_at TIMESTAMPTZ NULL,
    candidates_generated INTEGER NOT NULL DEFAULT 0,
    error_message TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mining_jobs_pending
    ON space_facts_mining_jobs (created_at DESC)
    WHERE status = 'pending';
```

---

## Skill Spec: `.claude/skills/space-facts-mining/SKILL.md`

`description` (frontmatter)：
> 從 Google Chat space 的歷史訊息萃取 5 類 context（產品 / 我的角色 / 術語 / pinned 決策 / 人物關係）。執行一次會拉 mining queue、對每個 space 跑 LLM 列點、把 candidate 寫進 backend 等 user approve。使用者說「mine space」「整理 space facts」「space mining」時自動啟用。

Workflow:
1. `GET /api/space-facts/mining-queue?status=pending&limit=3` → 取得最多 3 個 space
2. 對每個 space:
   - `PATCH /api/space-facts/mining-queue/{space_key} {status: "running"}`
   - `GET /api/messages?space_key=...&limit=200`（若該 space 上次已 mine 過，加 `since=<last_mined_at>`）
   - 若 messages 為空 → `PATCH {status: "completed", candidates_generated: 0}` 跳下一個
   - LLM prompt（system + user，模板見 references/prompt.md）
   - LLM output 預期格式（JSON）：
     ```json
     {
       "facts": [
         {
           "category": "product",
           "content": "...",
           "visibility": "private",
           "source_message_ids": [123, 124]
         }
       ]
     }
     ```
   - 逐筆 `POST /api/space-facts` with `status="candidate"`, `created_by="mining-skill"`
   - `PATCH /api/space-facts/mining-queue/{space_key} {status: "completed", last_mined_message_id, candidates_generated}`
3. 若任一 step fail → `PATCH {status: "failed", error_message: "..."}` 並繼續下個 space（不中斷整個 batch）

LLM Prompt 重點（references/prompt.md）：
- 提供 200 則訊息給 LLM
- 要 LLM 「**只提取明確 / 有證據的 facts**，不臆測」
- 每條 fact 必須附 source_message_ids（至少 1 個）
- 5 類定義：
  - **product**: 此 space 主要討論的產品 / 系統 / repo
  - **my-role**: local user 在此 space 的角色（owner / contributor / 旁聽 / 客戶 / 家人 / 朋友）
  - **glossary**: 此 space 常出現的術語 / 縮寫 / 內部代號（含定義）
  - **pinned-decision**: 已達成的共識 / 決議（例：「Q3 不再支援 IE11」）
  - **relation**: space 中的人物關係（例：「Alice 是 PM」「Bob 是 SRE lead」）
- 預設 visibility = `private`（敏感主題如人事 / 薪資留 `secret`）
- 每類最多 5 條，超過則 LLM 自行挑最重要

References 檔案：
- `references/prompt.md` — LLM prompt 模板
- `references/category-rubric.md` — 5 類的詳細定義 + 範例

---

## Business Rules

1. **Mining skill 是 best-effort**：失敗（網路 / LLM 拒絕）不重試，下輪 user 重新 enqueue
2. **Candidate 不自動 approve**：永遠等 user 手動 review（在 F-015 UI）
3. **Source traceability**：每條 fact 必須有 ≥1 source_message_id（backend 不強制驗證，但 skill 必須遵守）
4. **Visibility 預設 private**：mining skill 產出預設 private，user 可調 public / secret
5. **同 space 重複 mine**：用 `last_mined_message_id` 只拉新訊息（避免重複生 candidate）
6. **Manual fact**：user 可在 SettingsPage 直接新增 fact（`created_by=manual`，status 直接 approved）— UI 在 F-015
7. **Secret visibility**：approved 後仍不會被 `GET /api/space-facts` 預設回傳（需 `include_secret=1`）— 跟 user_profile_facts 對齊

---

## Acceptance Criteria

### Happy Path
- [ ] AC-1: Migration 0019 + 0021 跑得起來、down.sql 可 rollback
- [ ] AC-2: `POST /api/space-facts` with `category=product, content="...", created_by=manual` → 201, status=approved, approved_at 非 null
- [ ] AC-3: `POST /api/space-facts` with `created_by=mining-skill` → 201, status=candidate, approved_at=null
- [ ] AC-4: `POST /api/space-facts/{id}/approve` → status 變 approved, approved_at 設值
- [ ] AC-5: `POST /api/space-facts/{id}/reject` → status 變 rejected
- [ ] AC-6: `GET /api/space-facts?status=approved` 不回 status=candidate / rejected
- [ ] AC-7: `GET /api/space-facts` 預設不回 visibility=secret
- [ ] AC-8: `GET /api/space-facts?include_secret=1` 回所有 visibility
- [ ] AC-9: `POST /api/space-facts/mining-queue {space_key}` → queue row created, status=pending
- [ ] AC-10: 重複 `POST /api/space-facts/mining-queue {space_key}` (status=completed) → status reset 為 pending
- [ ] AC-11: Mining skill 跑一輪 → `PATCH mining-queue {status: "running"}` 然後 `{status: "completed", candidates_generated: N}` 都成功
- [ ] AC-12: `GET /api/messages?space_key=...&limit=200` 回該 space 最近 200 則訊息

### Error Handling
- [ ] AC-13: `POST /api/space-facts` with content="" → 400 / INVALID_INPUT
- [ ] AC-14: `POST /api/space-facts` with category="xyz" → 400 / INVALID_INPUT
- [ ] AC-15: `POST /api/space-facts` with space_key="not_exists" → 404 / SPACE_NOT_FOUND
- [ ] AC-16: `PATCH /api/space-facts/9999` → 404 / NOT_FOUND
- [ ] AC-17: `POST /api/space-facts/mining-queue` with running job → 409 / JOB_RUNNING

### Edge Cases
- [ ] AC-18: 同 space 連續 mine 兩次（用 last_mined_message_id incremental）→ 第二次只看新訊息，candidates_generated 數量合理
- [ ] AC-19: Space 訊息為 0 → mining skill 標 completed, candidates_generated=0
- [ ] AC-20: Source_message_ids 引用不存在的 message id → backend 不驗證（接受）
- [ ] AC-21: 同條 fact 多次 PATCH content → updated_at 更新，approved_at 不變
- [ ] AC-22: `GET /api/space-facts?category=product&space_key=X` 可同時用兩個 filter
- [ ] AC-23: Mining skill 對某 space LLM call 失敗 → mining-queue 標 failed + error_message，其他 space 仍正常處理

---

## Scenarios

`f014-space-facts-mining.feature`：
- CRUD endpoints happy path + 400/404
- Mining queue lifecycle
- Mining skill end-to-end（mock LLM response）
- Secret visibility filter

---

## 相關

- CR-002: `specs/changes/CR-002.md`
- 依賴：F-012（messages 表有歷史訊息可 mine）
- 後續：F-015（UI + chat-drafts 整合）
