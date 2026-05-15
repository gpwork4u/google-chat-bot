---
name: space-facts-mining
description: 從 Google Chat space 的歷史訊息萃取 5 類 context（產品 / 我的角色 / 術語 / pinned 決策 / 人物關係）。執行一次會拉 mining queue、對每個 space 跑 LLM 列點、把 candidate 寫進 backend 等 user approve。使用者說「mine space」「整理 space facts」「space mining」「mine fedflow-team space」「挖掘 space 事實」時自動啟用。
---

# Space Facts Mining — 自動萃取 Space 長期記憶

這個 skill 跟 `http://localhost:8080`（本機 Go backend）互動。執行一次的任務：

1. 從 mining queue 拉出待處理的 spaces（最多 3 個）。
2. 對每個 space 拉最近訊息，呼叫 LLM 萃取 5 類事實。
3. 把萃取結果以 `status=candidate` 寫進 backend，等待使用者在 UI approve。

## Example Invocations

- 「mine space」
- 「整理 space facts」
- 「space mining」
- 「mine fedflow-team space」
- 「挖掘 space 事實」
- 「幫我萃取 space context」

## References（必看）

- `references/prompt.md` — LLM prompt 模板（XML-tagged，含 schema 規範）
- `references/category-rubric.md` — 5 類定義 + 範例 + visibility 判斷規則

## Workflow

### 0. 確認 backend 可用

```bash
curl -sf http://localhost:8080/health || echo "backend 沒跑，請先 make dev"
```

若 backend 不通，立即終止並提示使用者。

### 1. 拉 mining queue（最多 3 個 pending spaces）

```bash
curl -s "http://localhost:8080/api/space-facts/mining-queue?status=pending&limit=3"
```

Response 結構：
```json
{
  "jobs": [
    {
      "space_key": "spaces/AAA",
      "status": "pending",
      "last_mined_message_id": null,
      "last_mined_at": null,
      "candidates_generated": 0,
      "error_message": null,
      "created_at": "2026-05-15T00:00:00Z",
      "updated_at": "2026-05-15T00:00:00Z"
    }
  ]
}
```

若 `jobs` 為空陣列：回報「Mining queue 沒有待處理的 space，請先在 SettingsPage 加入 space 到 mining queue」並結束。

### 2. 對每個 space 執行 mining loop

對 `jobs` 陣列中的每個 job，**循序**執行以下步驟（不並行，避免 LLM token 暴增）：

#### 2.1 標記為 running

```bash
SPACE_KEY="<job.space_key>"

curl -sS -X PATCH "http://localhost:8080/api/space-facts/mining-queue/${SPACE_KEY}" \
  -H 'Content-Type: application/json' \
  -d '{"status": "running"}'
```

若失敗（400/404/5xx）：log 錯誤，跳過此 space，繼續下一個。

#### 2.2 拉該 space 的訊息

```bash
SPACE_KEY="<job.space_key>"
LAST_MINED_AT="<job.last_mined_at>"  # null 或 ISO 8601 string

# 若 last_mined_at 不為 null，加 since 參數（增量模式）
if [ -n "$LAST_MINED_AT" ] && [ "$LAST_MINED_AT" != "null" ]; then
  curl -s "http://localhost:8080/api/messages?space_key=${SPACE_KEY}&limit=200&since=${LAST_MINED_AT}"
else
  curl -s "http://localhost:8080/api/messages?space_key=${SPACE_KEY}&limit=200"
fi
```

Response 結構：
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
      "observed_at": "2026-05-01T09:00:00Z",
      "mentioned": false,
      "skipped_at": null
    }
  ],
  "next_before_id": null
}
```

若 `messages` 為空陣列：

```bash
curl -sS -X PATCH "http://localhost:8080/api/space-facts/mining-queue/${SPACE_KEY}" \
  -H 'Content-Type: application/json' \
  -d '{"status": "completed", "candidates_generated": 0}'
```

log：`→ [skipped] ${SPACE_KEY} — 沒有新訊息，標 completed`，**繼續下個 space**（不打 LLM）。

#### 2.3 LLM 萃取（讀 `references/prompt.md` 取得完整 prompt 模板）

把訊息清單格式化後送給 LLM。訊息格式（每則一行）：

```
[id=123] Alice (2026-05-01 09:00): 這個 PR 已 merge，fedflow controller v2.1 正式上線
[id=124] Bob (2026-05-01 09:05): 讚，我來更新 runbook
[id=125] Carol (2026-05-01 09:10): 我是 SRE lead，負責 on-call
```

System prompt 參照 `references/prompt.md`，user message 包含：
- `local_user_name`（從 `GET /api/claude/pending` 的 response 取，或從 `GET /api/claude/style-profile` 取）
- `space_name`（從 messages[0].space_key 推導，若無則用 space_key 本身）
- `space_key`
- 訊息總數 N
- 格式化後的訊息列表

LLM 輸出格式（強制 XML 包裹）：

```xml
<facts_json>
{
  "facts": [
    {
      "category": "product",
      "content": "此 space 主要討論 fedflow K8s controller，重點在 reconciler queue",
      "visibility": "private",
      "source_message_ids": [123, 124]
    },
    {
      "category": "my-role",
      "content": "我在此 space 是 contributor，主要負責 PR review",
      "visibility": "private",
      "source_message_ids": [125]
    }
  ]
}
</facts_json>
```

#### 2.4 解析 LLM 輸出

從 LLM response 中抓取 `<facts_json>...</facts_json>` 區段內容，再 parse 成 JSON：

```
1. 用正規表達式抓取 <facts_json>...</facts_json> 之間的文字
2. JSON.parse（或 jq 解析）
```

解析失敗時（沒有 `<facts_json>` tag、JSON 格式錯誤、`facts` 不是陣列）：

```bash
curl -sS -X PATCH "http://localhost:8080/api/space-facts/mining-queue/${SPACE_KEY}" \
  -H 'Content-Type: application/json' \
  -d "{\"status\": \"failed\", \"error_message\": \"parse error: LLM 輸出格式不符預期\"}"
```

log：`→ [failed] ${SPACE_KEY} — parse error，繼續下個 space`，**不中斷整批**。

#### 2.5 逐筆 POST candidate facts

對解析出的每條 fact，呼叫：

```bash
curl -sS -X POST "http://localhost:8080/api/space-facts" \
  -H 'Content-Type: application/json' \
  -d "{
    \"space_key\": \"${SPACE_KEY}\",
    \"category\": \"${fact.category}\",
    \"content\": \"${fact.content}\",
    \"visibility\": \"${fact.visibility}\",
    \"source_message_ids\": ${fact.source_message_ids},
    \"created_by\": \"mining-skill\"
  }"
```

- `status` 由 backend 自動設為 `candidate`（因 `created_by=mining-skill`）
- `approved_at` 由 backend 自動設為 null
- 單筆 POST 失敗（400/5xx）：log 警告，**繼續寫下一筆**（不中斷）

記錄：
- `candidates_generated` = 成功 POST 的數量
- `last_mined_message_id` = `max(messages[].id)`（所有拉到的訊息中最大的 id）

#### 2.6 標記為 completed

```bash
MAX_MSG_ID=<max(messages[].id)>
CANDIDATES_COUNT=<成功 POST 數量>

curl -sS -X PATCH "http://localhost:8080/api/space-facts/mining-queue/${SPACE_KEY}" \
  -H 'Content-Type: application/json' \
  -d "{
    \"status\": \"completed\",
    \"last_mined_message_id\": ${MAX_MSG_ID},
    \"candidates_generated\": ${CANDIDATES_COUNT}
  }"
```

log：`→ [completed] ${SPACE_KEY} — candidates_generated=${CANDIDATES_COUNT}, last_mined_message_id=${MAX_MSG_ID}`

### 3. Summary

全部 spaces 跑完後印出：

```
Space Facts Mining 完成：
  processed=3 spaces
  completed=2 failed=1
  total candidates_generated=12

下一步：前往 Settings > Space facts > 待審核 candidates 逐筆 approve / edit / reject
```

## Error Handling

| 情況 | 處置 |
|------|------|
| backend 連不到 | 印錯誤並終止 |
| PATCH mining-queue {running} 失敗 | log 錯誤，跳過此 space |
| GET messages 失敗 | PATCH {failed, error_message}，繼續下個 space |
| LLM 輸出解析失敗 | PATCH {failed, error_message: "parse error"}，繼續下個 space |
| 單筆 POST /api/space-facts 失敗 | log warning，繼續下一筆（不中斷整個 space） |
| PATCH mining-queue {completed} 失敗 | log warning（facts 已寫入，只是狀態未更新） |

## 邊界情況

- **同 space 連續 mine**：若 `last_mined_at` 不為 null，加 `since=last_mined_at` 只拉新訊息，避免重複生 candidate
- **空 space**：messages 為空 → 直接標 completed，candidates_generated=0，不打 LLM
- **LLM 拒絕回答**：解析失敗 → 標 failed，下輪 user 重新 enqueue
- **Mining 是 best-effort**：失敗不自動重試，user 可手動 reset queue

## 不要做的事

- **不要**直接去讀 Postgres
- **不要**跳過 `PATCH {running}` 直接寫 facts（queue 狀態必須正確追蹤）
- **不要**在解析失敗時還硬塞資料
- **不要**並行處理多個 space（循序即可，避免 context 爆掉）
- **不要** approve / reject candidate：只寫入 candidate，讓 user 決定

## Manual Smoke Test

1. 確認 backend 跑起來：`curl http://localhost:8080/health`
2. 在 SettingsPage 或用 curl 把某個 space 加入 mining queue：
   ```bash
   curl -sS -X POST "http://localhost:8080/api/space-facts/mining-queue" \
     -H 'Content-Type: application/json' \
     -d '{"space_key": "spaces/YOUR_SPACE_KEY"}'
   ```
3. 確認 queue 有東西：`curl "http://localhost:8080/api/space-facts/mining-queue?status=pending"`
4. 執行此 skill（`/space-facts-mining` 或告訴 Claude「mine space」）
5. 觀察 log 輸出，確認每個 space 都有 completed 或 failed 狀態
6. 查看 candidates：`curl "http://localhost:8080/api/space-facts?status=candidate"`
7. 前往 UI `/space-facts/candidates` 逐筆 approve
