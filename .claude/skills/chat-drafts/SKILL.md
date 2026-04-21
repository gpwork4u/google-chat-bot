---
name: chat-drafts
description: 處理 Google Chat AI Agent 後端的待處理訊息。執行一次會拉 /api/claude/pending、逐則判斷並產生回覆、依 auto_mode 決定直接送出或進 approve queue。使用者說「處理 chat」「回覆 chat」「process chat」「chat drafts」時自動啟用。
---

# Chat Drafts — 自動處理 Google Chat 待處理訊息

這個 skill 跟 `http://localhost:8080`（本機 Go backend）互動。執行一次的任務：

1. 抓目前滿足使用者條件的待處理訊息。
2. 為每則訊息判斷「該不該回」、「怎麼回」。
3. 把回覆透過 reply API 送回 backend；依照 `auto_mode` 決定是否立即送出。

Backend 已經依 UI 上的 Channel 白名單 + 「只回 @ 我」 + 沒 draft 過濾過，所以這個 skill 不用再處理 channel 條件。

## Workflow

### 1. 拿待處理訊息

```bash
curl -s http://localhost:8080/api/claude/pending?limit=50
```

Response：

```json
{
  "pending": [
    {
      "message_id": 123,
      "space_key": "space:AAQA...",
      "space_name": "SRE Agent Playground",
      "thread_key": "TP8oyN9nLzU",
      "sender_name": "Jordan Wu吳紹宇",
      "body": "@GP Wang 王鈞平 幫我看一下這個 bug",
      "observed_at": "2026-04-22T...",
      "mentioned": true
    }
  ],
  "auto_mode": false,
  "reply_only_when_mentioned": true,
  "blocked_keywords": "金額,匯款,密碼",
  "local_user_name": "GP Wang 王鈞平",
  "local_user_email": "chunping.wang@ailabs.tw"
}
```

如果 `pending` 是空陣列：回報「沒有待處理訊息」並結束。

### 2. 對每則訊息判斷

對每則 pending message，先決定**要不要回**：

- 若 body 是純 emoji / 純 "OK" / "收到" / "了解" 這類 ack，skip（對方不期待回應）
- 若 body 含 `blocked_keywords` 裡任一 keyword，skip 並建議使用者在 UI 手動處理
- 若看起來是 bot / 自動通知 / system message，skip
- 若內容意義不明或你無法產生有意義回覆，**傾向 skip**（寧缺勿濫）

要回的才走下一步。

### 3. 拉 thread + 同 space 附近 context（強烈建議）

```bash
curl -s "http://localhost:8080/api/messages/<message_id>/context?window_minutes=30&limit=10"
```

Response：

```json
{
  "anchor": { ... },
  "thread": [ ...same thread 按時間排 ],
  "around": [ ...同 space 其他 topic, ±30 min ]
}
```

讀完才能判斷對方問的是什麼、之前是不是已經有人接話了。

如果 `thread.length > 1` 而且最後一則已經是**你自己**（`sender_is_me=true`）發的，skip — 等對方再回。

### 4. 產生回覆

使用**繁體中文**，配合：

- sender 的語氣（從 thread history 觀察）
- space 的性質（看 `space_name`：工作 / 閒聊 / 特定專案）
- 訊息長度：對方一句話就回一句話，對方長篇就可以多寫一些
- 避免過度正式；ailabs 內部聊天風格偏輕鬆

**安全護欄**：

- 任何涉及金錢 / 承諾 / 合約 / 對外客戶 / 密碼憑證 → skip（讓使用者手動處理）
- 不確定事實的事情 → 標明「不確定，讓我確認一下」而不是瞎回
- 不要輕易代替使用者做承諾（例：「明天一定完成」、「沒問題交給我」）

### 5. 送出

```bash
curl -s -X POST http://localhost:8080/api/claude/reply \
  -H 'Content-Type: application/json' \
  -d '{
    "message_id": 123,
    "body": "ok 我看一下，大概下午給你答覆",
    "send_mode": "reply_thread",
    "auto_send": <AUTO_SEND>,
    "model": "claude-code",
    "reasoning": "why this reply"
  }'
```

`<AUTO_SEND>` 判斷：

- 若第 1 步拿到的 `auto_mode=true` → `auto_send=true`（直接送出 Chat）
- 若 `auto_mode=false` → `auto_send=false`（draft 留在 UI 等使用者按「核准 + 送出」）

`send_mode` 預設用 `"reply_thread"`（保持在原 thread 裡對話）。只有在明顯應該開新話題時才用 `"new_topic"`。

成功 response：`{"ok": true, "draft_id": 456, "status": "approved"}`

### 6. 每則輸出一行 log

格式：

```
→ replied #123 "ok 我看一下…" (auto_sent=true)
→ skipped #124 GP Wang: "收到" (pure ack)
→ replied #125 "這個我晚點處理" (auto_sent=false, awaiting approval)
```

全部跑完印 summary：

```
Processed 5 messages: replied=3 (auto_sent=2) skipped=2
```

## 邊界情況

- backend 連不到（curl 失敗）：告訴使用者「backend 沒跑，請 `make dev`」並結束
- `/api/claude/reply` 回 404 message not found：代表訊息被刪或不是本人 user 的；skip 往下
- `/api/claude/reply` 回 5xx：log 錯誤但繼續處理下一則
- pending 列表超過 20 則：只處理前 20 則，summary 裡提一下剩 N 則沒處理

## 不要做的事

- **不要**直接去讀 Postgres（`psql …`）— 全程走 HTTP API
- **不要**去呼叫 Google Chat API（會失敗，token 流程走 extension）
- **不要**回覆自己發的訊息（pending endpoint 本來就已經 filter 過 sender_is_me，但邏輯上 double check）
- **不要**重複回覆同一則 — 送出後後端會建 draft，下次 `/api/claude/pending` 就不會再列這則
