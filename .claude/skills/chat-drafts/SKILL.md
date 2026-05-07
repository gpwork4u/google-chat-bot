---
name: chat-drafts
description: 處理 Google Chat AI Agent 後端的待處理訊息。執行一次會拉 /api/claude/pending、逐則判斷並產生回覆、依 auto_mode 決定直接送出或進 approve queue。使用者說「處理 chat」「回覆 chat」「process chat」「chat drafts」時自動啟用。
---

# Chat Drafts — 自動處理 Google Chat 待處理訊息

這個 skill 跟 `http://localhost:8080`（本機 Go backend）互動。執行一次的任務：

1. 抓目前滿足使用者條件的待處理訊息。
2. 為每則訊息**分類**（閒聊 / 工作瑣事 / 工程開發 / skip），依類別走對應 playbook 判斷與起草。
3. 把回覆透過 reply API 送回 backend；依照 `auto_mode` 決定是否立即送出。

Backend 已經依 UI 上的 Channel 白名單 + 「只回 @ 我」 + 沒 draft 過濾過，所以這個 skill 不用再處理 channel 條件。

## References（必看）

每類訊息的處理邏輯放在 `references/`，拉完 context 後依分類去讀對應檔：

- `references/categorize.md` — 四分類規則與訊號清單
- `references/daily-chat.md` — 閒聊回覆風格
- `references/work-coordination.md` — 工作瑣事（排程 / 狀態 / 催進度）
- `references/engineering.md` — 工程開發訊息 dispatcher + 時間盒 + 子 skill 呼叫
- `references/repo-map.md` — 本機各 repo 位置與關鍵字，工程訊息定位用
- `references/jira.md` — 訊息含 Jira 連結 / ticket ID 時如何 fetch ticket 並判讀
- `references/clarify.md` — 需求 / feature 不明確時如何追問（避免瞎承諾 / 瞎實作）
- `references/profile.md` — 個人資訊（家在哪 / 工作 / 寵物...）透過 `/api/claude/profile` 取得 + visibility 判斷
- `references/discord-clarify.md` — 信心不足時改 ping Discord 詢問使用者，下一輪 loop 收回覆再決定送或改或跳

## Workflow

### Loop 模式速查（搭配 `/loop 5m /chat-drafts`）

每輪開始按順序做：

1. **檢查 Discord 回覆**：若 `.claude/cache/chat-drafts/deferred.json` 存在且非空，先讀它逐筆呼叫 `mcp__plugin_discord_discord__fetch_messages` 看使用者有沒有回 → 詳見 `references/discord-clarify.md`「下一輪 loop」段。處理完從 cache 清掉。
2. **拉 pending**：`curl /api/claude/pending`。**若 pending 為空 + deferred 為空 → 直接結束本輪**，不要拉 style-profile / profile（節省 token + 時間）。
3. **style-profile / profile cache**：本 session 第一輪拉，之後重用記憶中的版本（除非 token context 已被壓縮）。
4. **逐則處理**：對每則 pending 走 step 2-5；信心不足走 `references/discord-clarify.md` 的 Discord clarify 流程而非直接 POST `/api/claude/reply`。

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

### 0.5. 拉一次 profile facts（跟 style-profile 一起做）

當 pending 訊息可能問到個人資訊（你家在哪、公司、寵物、行程）時，查使用者自己留的 facts：

```bash
curl -s "http://localhost:8080/api/claude/profile"
```

回傳 `public` + `private` facts（`secret` 永遠不回）。拿到 `private` 不等於可說 — 要依 sender / space 判斷。詳見 `references/profile.md`。

### 1. 拿待處理訊息

```bash
curl -s http://localhost:8080/api/claude/pending?limit=50
```

**Debug mode**：加 `?debug=true`（或 `debug=1`）時 backend 會放寬條件：
- 不過濾 `sender_is_me`（自己發的訊息也會列出來）
- 不套用 「只回 @ 我」的 mention 檢查

這只在你自己測 pipeline 時開，不然正式 run 用預設值就好。

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

### 2. 先拉完整前後文（強制，不能跳）

**每則 pending message 都必須先拉 context 才能進入 step 3**。backend 有專門的 API：

```bash
curl -s "http://localhost:8080/api/messages/<message_id>/context?window_minutes=720&limit=200"
```

（12 小時、最多 200 筆 — 值故意拉很大。上限是 7 天 / 500 筆。）

Response：

```json
{
  "anchor": { ... },           // 這則 pending message 本身
  "thread": [ ...同 thread 按時間排 ],     // 同 thread 的前後訊息（完整，無上限）
  "around": [ ...同 space 其他 topic ]   // 同 space 其他討論（±720 分鐘）
}
```

**必讀原因**：pending message 的 `body` 常常是片段 — 「那個可以嗎」「同上」「好喔我再試」。body 本身無意義，**意義在 thread 與 around**。沒讀 context 就分類或起草 = 瞎猜。

**讀 context 的重點**：
- **thread**：完整看（時間排序）。指涉詞「那個」、「這個」、「剛剛說的」都要從 thread 還原。看 thread 最後一則是誰發的（決定要不要回），以及是否已解（對方道謝 / 別人答了）。
- **around**：掃一下看對方這段時間在聊什麼主題 / 有沒有提過相關事。特別是 `thread` 很短（只有 anchor 一則）時，`around` 是唯一線索。
- **anchor.sender_is_me** / **thread 最後一則 sender**：double check 不要回自己。
- **最近 N 則先看**：訊息量大時從最新往回看，找「觸發這則 pending 的前因」。

**讀完後把關鍵脈絡寫進 draft 的 `reasoning` 欄位**（例：「anchor 問『那個』指 thread 前 2 則討論的 X 功能；thread 最後是 OOO 還沒回 → 適合我接」），方便使用者在 UI review。

不讀 context 就直接判斷是這個 skill 最常見的錯誤 — 不要犯。

### 3. 分類（讀 `references/categorize.md`）

先判斷是 A/B/C/D 哪一類：

- **A. daily-chat** — 閒聊 / 午餐 / 週末 / 八卦
- **B. work-coordination** — 排程 / 狀態 / 催進度 / 確認 owner
- **C. engineering** — 需要看 code / 查 log / 跑指令才能答
- **D. skip** — 純 ack / bot / 政策紅線 / 自己發的 / 問別人的

**傾向回**：A/B/C 都起草，只有 D 跳過。不知道答案 ≠ 不能回 — 誠實說「不知道，晚點確認」本身就是有價值的回覆。

**需求不明確時必追問**：當訊息是 B 或 C 類且屬於「要求 / feature request / 委託」但 scope 不清（例：「幫我加個 export」、「那個 bug 修一下」）→ 讀 `references/clarify.md`，回一個**具體的追問**而不是瞎承諾或瞎實作。

**政策紅線（一律 D skip）**：金錢 / 匯款 / 報價 / 合約 / 法務 / 對外客戶 / 密碼 / API key / 憑證 / 人事 / 薪資 / 績效；任何「承諾交付時間或結果」也 skip（例：「明天一定完成」、「沒問題交給我」）。

### 3.5. D 類 → 呼叫 /api/claude/skip 標記 backend（best-effort）

判定 D 類後，**立即呼叫 skip endpoint**，讓 backend 記錄此訊息不需回覆，下一輪 loop 的 `/api/claude/pending` 就不會再列出它。

#### D 子類 reason 軟 enum（必須使用其中之一）

| reason | 對應情境 |
|--------|---------|
| `pure-ack` | 純確認回覆（「好」「OK」「收到」「thx」「+1」「了解」） |
| `overheard` | 別人之間的對話，self 不是目標對象（@他人 / 「OO 你去看」） |
| `policy-redline` | 政策紅線命中（金錢 / 匯款 / 報價 / 法務 / 對外客戶 / 密碼 / 人事 / 薪資 / 績效 / 過度承諾） |
| `not-targeted` | 訊息明確指向別人（@他人且 local user 不在列）或公告 / FYI |
| `low-info` | 資訊量過低，無法有意義回覆（emoji-only / 單一表情符號 / 讚） |

#### 呼叫方式

```bash
MID="<message_id>"      # pending 列表的 message_id（string）
REASON="pure-ack"       # 依上表選一個

curl -sS -X POST http://localhost:8080/api/claude/skip \
  -H 'Content-Type: application/json' \
  -d "{\"message_id\":\"$MID\",\"reason\":\"$REASON\",\"by\":\"skill\"}" \
  --max-time 3 \
  || echo "warn: /api/claude/skip failed for #$MID; will retry next loop"
```

要點：
- `by` 固定寫死為 `"skill"`，不要改
- `--max-time 3`：避免單一 skip 卡住整輪 loop
- 失敗時 print warn 並**繼續處理下一則**（idempotent — 下輪 loop 重判一次不會重複標）
- skip 失敗**不影響**其他訊息的處理流程

#### 範例輸出

```
→ [D/skipped] #124 reason=pure-ack (by=skill) GP Wang: "收到"
→ [D/skipped] #127 reason=policy-redline (by=skill) Alice: "幫我匯 50000 元過去"
→ [D/skipped] #131 reason=overheard (by=skill) Bob→Carol: "Carol 你來看這個"
```

### 4. 依類別走對應 playbook 起草

- **A daily-chat** → 讀 `references/daily-chat.md`，直接依 style profile 起草，不用額外調查
- **B work-coordination** → 讀 `references/work-coordination.md`，留退路 / 不承諾
- **C engineering** → 讀 `references/engineering.md` + `references/repo-map.md`：
  - 依子類型（error / perf / git / test / 架構）決定是否呼叫 debug-loki / debug-pprof / git-repo / go-testing / go-development / jira-bug-fix 等 skill
  - 或開 Explore subagent 去 repo 裡查
  - **時間盒：每則訊息最多 5 個 tool call**。超過就 fallback「我晚點看」並仍送 draft
  - 需要改多檔的大改動 → skip，讓使用者接手

**風格共同準則**：使用繁體中文，貼近 style profile 樣本（句長、虛詞、中英夾雜、有無句號），不要變有禮貌的 AI 客服。參考 `median_length`：樣本中位數 6 字，回覆就別寫 30 字。

### 4.5. 信心不足 → Discord clarify（不送 reply）

完成 step 4 後評估 confidence：high / medium / low。若是 **medium 或 low**，**不要進 step 5 送 reply**，改走 `references/discord-clarify.md`：

- 從 session 中最近的 `<channel source="discord" chat_id="...">` tag 取 chat_id
- 用 `mcp__plugin_discord_discord__reply` 發訊息問使用者（格式見 reference）
- 寫入 `.claude/cache/chat-drafts/deferred.json` 等下一輪 loop 撿回覆
- log：`→ [<分類>/deferred] asked #<msg_id> ... (信心 <medium|low>，等 Discord 回覆)`

high 信心才走 step 5。

### 5. 送出

```bash
curl -s -X POST http://localhost:8080/api/claude/reply \
  -H 'Content-Type: application/json' \
  -d '{
    "message_id": 123,
    "body": "ok 我看一下，大概下午給你答覆",
    "send_mode": "reply_thread",
    "model": "claude-code",
    "reasoning": "why this reply"
  }'
```

**skill 不需要判斷要不要自動送出** — backend 根據使用者當前 `auto_mode` 設定自己決定：

- `auto_mode=true` → draft 直接 `status=approved`，extension 送出
- `auto_mode=false` → draft `status=pending`，UI 等使用者核准

重複 POST 同一個 `message_id` 會**更新**現有 pending/approved draft（body 覆蓋過去），不會重複堆疊。使用者若想換你換過的內容，先到 UI reject 再 re-run skill。

`send_mode` 規則（**一律用 `"reply_thread"`**）：

- 固定傳 `"reply_thread"`，不要用 `"new_topic"`。
- Backend 在拼 pending draft 時會自動 fallback：`thread_key` 空字串就用 `message_key` 當 thread anchor（top-level 訊息本身就是自己的 thread），所以 reply_thread 對所有 pending message 都適用。
- `/api/claude/pending` 回傳的 `thread_key` 也已經套了這個 fallback，看到值不用再自己判斷。
- `new_topic` 在目前實作下有 spaceRef fallback 的風險會送錯 space，除非真的要另開新話題，一般不要用。

成功 response：`{"ok": true, "draft_id": 456, "status": "approved", "auto_sent": true}` — 看 `auto_sent` 知道 backend 最終是直接送了還是放 pending。

### 6. 每則輸出一行 log

格式：`[分類]` + reason 用繁中簡短說明：

```
→ [C] replied #123 "在 chat_processor.go:127，我再追一下" (auto_sent=true, engineering/查 code)
→ [D/skipped] #124 reason=pure-ack (by=skill) GP Wang: "收到"
→ [B] replied #125 "不確定欸，我晚點查一下" (auto_sent=false, work/排程事實用不知道回)
→ [A] replied #126 "還沒想欸" (auto_sent=true, daily/午餐閒聊)
→ [C] replied #127 "我看一下 loki，晚點回" (auto_sent=false, engineering/時間盒用完 fallback)
→ [D/skipped] #128 reason=policy-redline (by=skill) Alice: "幫我匯款給廠商"
```

全部跑完印 summary：

```
Processed 5 messages: replied=4 (auto_sent=1) skipped=1
```

盡量回 — 不知道就誠實回「不確定，我再確認」也比沉默好。skip 只留給必 skip 那幾類跟政策紅線。

## 邊界情況

- backend 連不到（curl 失敗）：告訴使用者「backend 沒跑，請 `make dev`」並結束
- `/api/claude/reply` 回 404 message not found：代表訊息被刪或不是本人 user 的；skip 往下
- `/api/claude/reply` 回 5xx：log 錯誤但繼續處理下一則
- pending 列表超過 20 則：只處理前 20 則，summary 裡提一下剩 N 則沒處理
- `/api/claude/skip` 失敗（timeout / 5xx）：**不影響其他訊息的處理**；print warn log 然後繼續下一則。下輪 loop 時 pending 仍會列出這則，skill 重判一次再 skip 即可（idempotent）

## 不要做的事

- **不要**直接去讀 Postgres（`psql …`）— 全程走 HTTP API
- **不要**去呼叫 Google Chat API（會失敗，token 流程走 extension）
- **不要**回覆自己發的訊息（pending endpoint 本來就已經 filter 過 sender_is_me，但邏輯上 double check）
- **不要**重複回覆同一則 — 送出後後端會建 draft，下次 `/api/claude/pending` 就不會再列這則
