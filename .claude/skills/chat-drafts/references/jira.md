# Jira — 訊息含 Jira 連結 / ticket ID 時拉內容

訊息或 thread context 出現 Jira ticket 時，先拉 ticket 本體再判斷怎麼回。**不要**只看 body 猜。

## 偵測訊號

從 `body` / `thread` / `around` 任一訊息抓：

- 完整 URL：`https://<tenant>.atlassian.net/browse/<KEY-123>`、`https://jira.<company>.com/browse/<KEY-123>`
- 裸 ticket ID：`[A-Z][A-Z0-9_]+-\d+`（像 `FEDGPT-1234`、`CRD-5`、`WEB-42`）— 要是一個完整 token，不要把 `abc-123` 這種小寫當成 ticket
- 常見上下文：「這張 ticket」、「這個 bug」、「Jira 上」、「[XX-123] ...」

抓到 ticket ID 後就去 fetch。一次訊息可能同時有多個 ticket，優先抓**最後/最顯眼**的那個（對方最可能是在講那張）。

## Fetch 工具

走 jira-bug-fix skill 的 CLI wrapper（已經處理 Cloud/Server auth 判斷）：

```bash
# 檢查環境變數有沒有設（第一次跑）
bash ~/.claude/commands/jira-bug-fix/references/jira-api.sh check

# 拿 ticket 本體（summary / description / status / assignee / reporter / priority / labels）
bash ~/.claude/commands/jira-bug-fix/references/jira-api.sh get <KEY-123>

# 拿 comments（若 thread 討論跟某段 comment 相關）
bash ~/.claude/commands/jira-bug-fix/references/jira-api.sh comments <KEY-123>
```

環境變數需要 `JIRA_BASE_URL`、`JIRA_EMAIL`、`JIRA_API_TOKEN`。沒設 → `check` 會失敗 → skill 不強求，回覆用「我看一下這張 ticket，晚點回」fallback 掉，不要卡住。

## 時間盒整合

**Jira fetch 算進工程訊息的 5 tool call 預算**：

- `check` + `get` = 2 call
- 加 `comments` = 3 call
- 剩 2 call 可以再 grep / read code

所以訊息如果同時要拉 Jira + 看 code，預算會緊。優先序：
1. 先 `get` ticket（最重要）
2. 如果 description 明確 → 直接回，不看 comments
3. 有 code 線索（file path / error）再 grep
4. 時間盒還有剩才看 comments

## Ticket → 回覆的判讀

拿到 ticket JSON 後看：

| 欄位 | 判讀 |
|------|------|
| `status` | `Done/Closed` → 可回「這個已經結了」；`In Progress` → 誰在做；`Open/To Do` → 還沒動 |
| `assignee` | 是不是 local user；若不是 → 回「這張 assign 給 OOO，不是我」 |
| `reporter` | 對方是不是 reporter，語氣可以更熟 |
| `summary` + `description` | 直接總結 1-2 句，**不要**複製整段 description |
| `priority` | `Highest/High` → 語氣認真一點 |
| `labels` / `components` | 判斷是哪個 repo / 模組 → 搭 repo-map.md |

## 常見場景

### 1. 對方貼 ticket 問「這張可以幫看嗎」
```
→ get ticket
→ 判讀 assignee / status
→ 若 assign 給自己 且 open：「看到了，我排一下今天追」
→ 若 assign 別人：「這張是 @assignee 的，你要問他」
→ 若 已 done：「這張已經 close 了，你遇到的問題一樣嗎？」
```

### 2. 對方問「XX-123 進度？」
```
→ get ticket
→ 看 status + 最近 comment 時間
→ 回覆具體狀態：「還在 In Progress，最近 comment 是 N 天前；我今天推一下」
```

### 3. 對方貼 ticket + error log
```
→ get ticket（瞭解需求）
→ engineering.md 的 error 流程（grep code）
→ 如果預算夠就給具體定位；不夠就「ticket 看了，bug 看起來在 XXX 附近，我追完再回」
```

### 4. 單純 FYI 提到 ticket
```
→ 不用 fetch，當閒聊/工作瑣事處理
→ 例：「我剛開了 FEDGPT-999」→ 「收到，我有空看」（不用拉 ticket）
→ 判準：對方只是通知 vs 對方要回應
```

## 回覆的安全護欄

- **不要**把 Jira description / comment 原文貼回 chat — 可能有對外不該擴散的內容
- **不要**承諾 ticket 時程（「明天 close」）— 回「我盡快」「排到這週」
- **不要**在 chat 裡 transition ticket（move to Done 等）— 讓使用者自己在 Jira 操作
- 若 ticket 涉及政策紅線（客戶、合約、人事）→ 即使訊息本身看起來沒事，也 skip draft

## 寫進 draft reasoning

送 `/api/claude/reply` 時，`reasoning` 欄位帶上 ticket key + 簡短判讀，方便使用者在 UI review：

```json
{
  "reasoning": "jira=FEDGPT-1234 status=In Progress assignee=me → 回排進度"
}
```
