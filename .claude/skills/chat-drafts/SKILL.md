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

### 0. 拉一次 style profile（跑一次就好，快取在記憶裡）

```bash
curl -s "http://localhost:8080/api/claude/style-profile?limit=80&min_length=3"
```

Response：

```json
{
  "local_user_name": "GP Wang 王鈞平",
  "corpus_size": 149,
  "avg_length": 12,
  "median_length": 6,
  "by_space": {"SRE Agent Playground": 43, "fedflow-team": 12, ...},
  "samples": [
    {"body": "ok 我晚點看", "space_key": "space:AAQA...", "space_name": "SRE", "observed_at": "..."},
    ...
  ]
}
```

把 `samples` 當作使用者語氣的實際樣本。注意這裡面可以觀察到：

- 用字：常用哪些虛詞 / 助詞 / 語氣詞（「啊」「吧」「欸」）
- 句長：多半一句話幾個字
- 標點：有沒有用句號、怎麼用驚嘆號
- 中英夾雜的模式（「ok 我先 XXX」）

**產 reply 時一定要貼近這些樣本的風格**，而不是用 LLM 預設的書面中文。

針對每則 pending message，如果要特別貼近某 space 語氣，可以額外打：
```bash
curl -s "http://localhost:8080/api/claude/style-profile?space_key=<anchor_space_key>&limit=30"
```
只拿該 space 的樣本。

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

### 2. 先拉完整前後文（必做，不跳）

對每則 pending message，**先拉 context 才能判斷**要不要回、怎麼回：

```bash
curl -s "http://localhost:8080/api/messages/<message_id>/context?window_minutes=720&limit=200"
```

（12 小時、最多 200 筆 — 值故意拉很大，讓你看到整個 thread 脈絡 + 同 space 當天在聊什麼。上限是 7 天 / 500 筆。）

Response：

```json
{
  "anchor": { ... },
  "thread": [ ...同 thread 按時間排，無筆數上限 ],
  "around": [ ...同 space 其他 topic，±720 分鐘內，最多 200 筆 ]
}
```

### 3. 判斷要不要回（**傾向不回**）

預設值：**skip**。只在真的值得回、而且能有意義回應時，才進入第 4 步。

**必 skip（這幾類直接放過，連 draft 都不產）**：

- body 是純 ack / 表情：「OK」「收到」「了解」「好」「👍」「謝謝」
- 明顯的 bot / system message（`sender_name` 帶 "App"、"Bot"、「Google Meet」這類）
- 包含 `blocked_keywords` 的任何一個 keyword
- 有人**正在問別人**（例如 body 開頭是 `@某某某` 但不是 `@<local_user_name>`）
  - `mentioned=true` 且 mention 的名字是自己才算 at 我
- 公告 / 廣播類訊息（「提醒大家」「FYI」「明天有活動」— 不需要你特地回）
- thread 裡最後一則已經是**你自己**發的（`sender_is_me=true`）— 等對方接
- thread 最後幾則看起來**事情已經有解**（對方已道謝 / 確認收到 / 問題被別人答了）

**傾向 skip 的灰色地帶（寧缺勿濫）**：

- 訊息意義不明，看不懂對方想幹嘛
- 對方問很具體的事實，你不知道正確答案（亂回會誤導）
- 純閒聊（午餐吃什麼、天氣 😅）— 這種你回也沒價值
- 工作協調需要跟別人確認才能答（排程、專案狀態、別人的工作）
- 任何你會猶豫的訊息 → **skip**

**政策紅線（一定 skip，不可跨）**：

- 涉及金錢 / 匯款 / 報價 / 付款條件
- 對外客戶溝通
- 合約 / 法務相關
- 密碼 / API key / 憑證
- 人事 / 薪資 / 績效
- 任何「承諾交付時間或結果」的語句（例：「明天一定完成」、「交給我沒問題」）

只有當訊息**明顯適合你回**、你也**有把握回得好**的時候，才繼續下一步。

重要：skill 存在的目的是幫使用者減少噪音，不是衝量。**每一則都傾向 skip** 才對。

### 4. 產生回覆

使用**繁體中文**，配合：

- **使用者自己的風格樣本**（第 0 步的 `samples`）— 這是主要對齊目標
- sender 的語氣（從 thread history 觀察）
- space 的性質（看 `space_name`：工作 / 閒聊 / 特定專案）
- 訊息長度：對方一句話就回一句話，對方長篇就可以多寫一些。參考 `median_length`：若中位數只有 6 字，回覆就別寫成 30 字

回覆長度以貼近 style profile 為準——使用者平常怎麼講話，就怎麼寫。不要變成有禮貌的 AI 客服風格。

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

格式（reason 用繁中簡短說明）：

```
→ replied #123 "ok 我看一下…" (auto_sent=true)
→ skipped #124 GP Wang: "收到" (純 ack)
→ skipped #125 Jordan: "明天會議幾點?" (排程事，不知道答案)
→ replied #126 "這個我晚點處理" (auto_sent=false, 等 UI approve)
```

全部跑完印 summary：

```
Processed 5 messages: replied=2 (auto_sent=1) skipped=3
```

skip 是正常且期望的行為 — 不要因為 pending 很多就覺得一定要回幾則。空回 0 則是合理的結果。

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
