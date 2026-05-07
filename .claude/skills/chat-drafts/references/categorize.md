# 訊息分類規則

**前提：必須已經拉完 `/api/messages/<id>/context`**。分類依據是 `anchor.body + thread + around` 三者合看，不是只看 anchor.body。

拉完 context 後，先把每則 pending message 分成 4 類，再 dispatch 到對應 playbook。

## 看 context 的順序

1. **讀 `thread` 最後 3-5 則**：還原指涉詞、確認話題、看是不是自己已回過、是不是已解
2. **讀 `around` 最近 10-20 則**：掃對方今天在聊什麼 / 是否有 Jira ticket / 是否有 error 貼過
3. **再看 `anchor.body`** 決定分類
4. 若 body 本身含糊（「同上」、「好啊」、「那個」、「+1」）→ **以 thread/around 的主題決定分類**，別只看 body 的字

## 四個類別

### A. daily-chat — 日常閒聊
- 午餐吃啥、週末計畫、去哪玩、天氣、八卦、梗圖、吐槽
- space_name 是「哪時候去日本」、「copilot daily」這種非專案頻道
- 對方語氣口語、短句、表情符號多
- → 走 `references/daily-chat.md`

### B. work-coordination — 工作瑣事
- 排程（「週五有空嗎」、「幾點 sync」）
- 狀態詢問（「XX 做完了嗎」、「進度如何」）
- 確認任務（「這個是你負責嗎」）
- 約會議、催進度、問狀態
- 不涉及實際 code 或系統調查
- → 走 `references/work-coordination.md`

### C. engineering — 工程開發
任何需要**看 code / 查 log / 跑指令**才能答的：
- 貼了 error message / stack trace / log 片段
- 問「XX service 為什麼壞了 / 慢」
- 問「這個 function 怎麼用」、「哪個 repo 有 XX」
- 問 API / schema / config
- 問 MR、PR、git branch
- 問測試怎麼寫、怎麼跑
- 問效能、記憶體、goroutine
- **含 Jira 連結 / ticket ID**（`atlassian.net/browse/XX-123` 或裸 `XX-123`）— 先走 `references/jira.md` 拉 ticket，再依 ticket 內容決定
- → 走 `references/engineering.md`（Jira 時加讀 `references/jira.md`）

### D. skip — 不回
必 skip（參見 SKILL.md step 3）：
- 純 ack / 表情
- bot / system
- blocked_keywords
- 明確在問別人（`@某某` 且不是 local user）
- 公告 / FYI
- thread 最後一則已經是自己
- 問題已被別人解掉
- 政策紅線（金錢 / 合約 / 對外 / 密碼 / 人事 / 粗俗或性相關玩笑）

**Meta / AI 自我相關質疑不算 skip**（例：「這是你回的嗎」、「以後都不知道是不是你回了嗎」、「因為沒開嗎」）— 當作 A daily-chat 回，見 `references/daily-chat.md` 的 Meta 段。

#### D 子類 → reason 對應（呼叫 /api/claude/skip 時使用）

判定 D 後依下表選擇 `reason` 傳給 skip endpoint：

| D 子情境 | reason 值 |
|---------|-----------|
| 純確認回覆（「好」「OK」「收到」「thx」「+1」「了解」「沒問題」） | `pure-ack` |
| 別人之間的對話，local user 不是目標對象（@他人 / 「OO 你來看」） | `overheard` |
| 政策紅線命中（金錢 / 匯款 / 報價 / 法務 / 密碼 / 人事 / 薪資 / 過度承諾） | `policy-redline` |
| 訊息明確指向別人或純公告 / FYI | `not-targeted` |
| 資訊量過低（emoji-only / 單一表情 / 讚）無法有意義回覆 | `low-info` |

> 其他情境（bot / system / blocked_keywords / 問題已解 / thread 最後是自己）依最貼近的上述值選，優先用 `pure-ack`（純確認）或 `not-targeted`（不是給我的）。

## 分類優先序
1. 先看有沒有踩 skip 條件 → D
2. 看有沒有技術訊號（error、服務名、檔名、repo 名、指令、git、SQL、log） → C
3. 看是不是工作協調關鍵字（排程、進度、確認、sync、meeting、review） → B
4. 其餘 → A

## 技術訊號清單
出現以下任一就視為 C（engineering）：

**error/log**: `panic`、`error`、`fatal`、`timeout`、`500`、`4xx`、`exception`、`stack trace`、日期時間戳格式的 log
**服務/基礎設施**: `k8s`、`pod`、`deployment`、`grafana`、`loki`、`prometheus`、`pprof`、`goroutine`、`docker`
**語言/工具**: `go`、`golang`、`ts`、`react`、`psql`、`sql`、`grpc`、`http`、`api`
**版本控制**: `MR`、`PR`、`merge`、`branch`、`commit`、`rebase`、`conflict`
**repo/服務名**（會隨 repo-map 更新）: `credo`、`asura`、`fedflow`、`inferno`、`automl`、`google-chat-bot`、`fedgpt-backend`、`custom-vllm`
**檔名/路徑**: 出現 `.go`、`.ts`、`.tsx`、`.sql`、`.py` 副檔名，或 `internal/`、`src/`、`code/` 這種路徑前綴

## 工作協調訊號
出現以下且沒踩技術訊號就視為 B：
- `sync`、`meeting`、`會議`、`約`、`幾點`、`有空`
- `進度`、`狀態`、`做完`、`弄好`、`搞定`
- `幫忙`、`可以嗎`（不附帶 error）
- `負責`、`owner`
