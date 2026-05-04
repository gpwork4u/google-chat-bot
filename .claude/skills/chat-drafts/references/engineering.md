# Engineering — 工程開發訊息處理

## 目標
工程訊息常常需要「實際看 code / 查 log / 跑指令」才能有品質回覆。這份 playbook 教怎麼在時間盒內查到答案，查不到就誠實 fallback。

## 時間盒（重要）

**每則訊息最多 5 個 tool call 預算**（Bash / Read / Grep / Glob / subagent 統稱一個）。超過就停，fallback 到「我晚點看」。

為什麼：
- chat-drafts 是批次回訊息，不是深度 debug session
- 對方只是要一個「有人回」的訊號，不是要一份完整 root cause 分析
- 真的要深挖，使用者自己會接手

時間盒用完但**還沒查清楚** → 還是要送 draft，內容是「看了一下還沒確定，我晚點再追」，不要沉默。

## Dispatch 決策樹

拿到 engineering 類訊息，先判斷子類型：

### 1. 貼了 error / log / stack trace
→ **先用 Grep/Read 找 code 中對應 error 訊息**，定位到 file:line
→ 如果訊息像是生產/測試環境 log（有時間戳 + service name）→ 考慮用 **debug-loki** skill 查最近 log pattern
→ 回覆格式：「看起來是 `xxx.go:123` 的 `FuncName` 丟的，多半是 ooo；我看一下 log 再回你」

### 2. 效能 / 慢 / memory / goroutine 洩漏
→ 用 **debug-pprof** skill
→ 回覆：先給初步猜測，並說「我抓個 pprof 看看」

### 3. Git / MR / PR / branch / 合併衝突
→ 用 **git-repo** skill 或直接 Bash `git log/status/diff`
→ 回覆：具體告訴對方狀態（「在 `feature/xxx` branch，還沒 merge」）

### 4. 測試 failing / flaky / 怎麼寫
→ 用 **go-testing** skill（Go repo）或對應語言 test skill
→ 先跑 test 看具體 failure：`go test ./path/... -run TestName -v`
→ 時間盒內跑不完 → 說「我跑看看，等等回」

### 5. repo 特定 convention / 架構
→ 查對應 repo 的 `.claude/skills/`（見 repo-map.md）
→ 例：credo 問 auth/permission → cd 到 credo 讓 `auth-permission-setup` skill 自動觸發
→ 例：web 問 form / table → cd 到 web 讓對應 skill 觸發

### 6. 要寫新 code / 新 feature
- **scope 不清** → 先走 `references/clarify.md` 追問（「哪個 repo？」「前端還後端？」）
- 小片段（一個 function 以內） → 直接在回覆給 snippet
- 大改動（需要改多檔）→ **不要** 在 chat 回完整 code；回「這個要改一下，我開個 branch 看看」+ skip draft（讓使用者接手）

### 7. API / schema / config 問法
→ Grep 找定義（`grep -r "Route.*/api/xxx"`）
→ 回具體答案（path、method、payload schema）

### 8. 訊息含 Jira 連結 / ticket ID
→ **先走 `references/jira.md`**：用 `~/.claude/commands/jira-bug-fix/references/jira-api.sh get <KEY>` 拉 ticket
→ Jira fetch 算進 5 tool call 預算（get=1, comments=1）
→ 依 ticket status / assignee / description 回覆

## Repo 定位流程

```
訊息 body 有關鍵字
     ↓
查 references/repo-map.md 找 repo
     ↓
不確定？
     ↓  grep -lr "<關鍵字>" /Users/chunping.wang/project/ --include="*.go" | head -3
     ↓
定位到 repo 後決定：
  a) 只是查事實 → 在該 repo 下 grep/read
  b) 需要該 repo convention → cd 過去讓 .claude/skills/ 自動觸發
  c) 需要跑 log/pprof → 用全域 skill (debug-loki / debug-pprof)
```

## 回覆品質等級

**A 級**（理想）：查到具體答案
- 「在 `internal/worker/chat_processor.go:127` 有處理這個 case，是 XXX 邏輯」
- 「MR 在這 https://...，還等 review」
- 「我跑了 test 看起來是 YYY 問題」

**B 級**（常見）：查到方向但沒確定
- 「看起來是 auth middleware 的問題，我再確認一下」
- 「有看到類似的 error，晚點追」

**C 級**（時間盒用完）：誠實 fallback
- 「我晚點看一下」
- 「這個要查，等等回你」

**永不**（錯誤）：
- 瞎答（沒查 code 就說得很具體）
- 長篇書面回覆（工程群組不吃這套）
- 貼完整 diff / 大段 code（chat 不是 IDE）

## 回覆語氣
- 跟 daily-chat 一樣口語，「欸」「啊」「蛤」都可以
- 中英夾雜 OK（function name、error name 保留原文）
- 短句 + 具體位置（`file:line`）最受歡迎
- 參考樣本：「在 XXX 那邊」、「讓我 grep 看看」、「應該是 OOO 搞的」、「我看一下」

## 工程訊息的安全護欄

**skip**：
- 要提交生產 / 部署 / 上 prod / db migration 執行 → skip（這類使用者要自己確認）
- 要給 credential / API key / 連線資訊 → skip
- 對外客戶 / 廠商的技術問題 → skip
- 要 approve MR / deploy → skip

**可以回但留退路**：
- 架構決策（「我們該用 A 還 B？」）→ 給意見但說「這個可能要討論」
- 估時（「這個改多久？」）→ 給範圍「應該 X 天，看 YYY 複雜度」

## 範例

### 範例 1：error log
```
對方：「fedgpt-backend 一直噴 context deadline exceeded 是你那邊嗎」
步驟：
1. grep fedgpt-backend for "context deadline" → 定位
2. 看 git log 最近改動
3. 回：「看起來是 /Users/.../fedgpt-backend/internal/xxx.go 的 call，timeout 設 5s，我拉一下 loki 看實際哪個 endpoint 在超時，晚點回你」
```

### 範例 2：排程內的技術問題
```
對方：「credo 的 AuthPermission 要加一個新的怎麼弄」
步驟：
1. repo-map → credo
2. cd 到 credo → auth-permission-setup skill 會自動觸發
3. 回：「有 skill 自動處理這個，我幫你跑流程；大概要改 X 個地方，包含 constant、AllAuthPermissions、role、Guard」
```

### 範例 3：查不到
```
對方：「昨晚 asura 壞了是不是」
步驟：
1. 用 debug-loki 查 asura 近 24h 的 error
2. 查不到明顯異常 / 時間盒用完
3. 回：「我看 loki 沒看到大規模 error，你說的大概幾點？給我個時間我再追」
```
