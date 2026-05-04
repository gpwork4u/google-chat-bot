# Repo Map — 本機專案分佈

訊息提到服務 / 檔名 / 技術時，用這份地圖定位要去哪個 repo 看。

## 主要 repo

### google-chat-bot（目前 cwd）
- 位置：`/Users/chunping.wang/project/google-chat-bot`
- 是什麼：這個 chat-drafts skill 的後端；Google Chat AI agent，用 extension 注入 chat.google.com，backend 是 Go
- 關鍵字：`chat-bot`、`chat draft`、`auto_mode`、`extension`、`inject-main.js`、`/api/claude/*`
- 語言：Go + Chrome extension (JS)
- Dev server：`make dev`

### fedgpt 生態（/Users/chunping.wang/project/fedgpt/*）

**credo**
- 位置：`/Users/chunping.wang/project/fedgpt/credo`
- 是什麼：認證 / 權限 / OAuth / connector 系統
- 關鍵字：`credo`、`auth`、`permission`、`oauth`、`connector`、`BYOK`、`credential`、`gateway`、`grpc`
- 語言：Go
- 有自己的 `.claude/skills/`：auth-permission-setup、connector-system、gateway-convention、grpc-convention、repo-test-convention

**web**
- 位置：`/Users/chunping.wang/project/fedgpt/web`
- 是什麼：前端 SPA
- 關鍵字：`web`、`react`、`form`、`table`、`presenter`、`tanstack`、`mapper`、`tsx`
- 語言：TypeScript + React
- 有自己的 `.claude/skills/`：clean-architecture、form-pattern、refactor、repository-pattern、tanstack-table

**automl-backend**
- 位置：`/Users/chunping.wang/project/fedgpt/automl-backend`
- 是什麼：AutoML 後端
- 關鍵字：`automl`、`automl-backend`
- 語言：Go
- 有自己的 `.claude/skills/`：code-review、go-development、go-testing

**asura**
- 位置：`/Users/chunping.wang/project/fedgpt/asura`
- 關鍵字：`asura`
- 語言：Go
- 有自己的 `.claude/skills/`：pprof-analyzer

**fedflow / fedflow-worktrees**
- 位置：`/Users/chunping.wang/project/fedgpt/fedflow` 和 `fedflow-worktrees/*`
- 是什麼：workflow orchestration，多個 worktree（fedgpt-faq、echo、gcal、fedgpt-kb、fedgpt-agentic、fedgpt-simple、gmail）
- 關鍵字：`fedflow`、`fedgpt-faq`、`echo`、`gcal`、`gmail`、`kb`、`agentic`

**其他常見**
- `asr-streaming-server`、`asura-transcript-app-backend` — ASR / 語音
- `claude`、`claude-channel` — 內部 claude integration
- `CosyVoice` — TTS
- `custom-vllm`、`vllm` — LLM inference
- `cdk8s`、`manifest` — infrastructure as code
- `inferno` — ？
- `fedgpt-backend` — 後端主服務
- `fedgpt-flowise` — flowise integration（另一個額外 working dir）
- `grafana` — 監控配置
- `face` — face 相關
- `model` / `model_core` / `gen` / `data` — model / data
- `swagger` — API 文件

## 如何使用這份 map

1. 從訊息 body 抓關鍵字 → 對應到 repo
2. 如果不確定，grep 一下：
   ```bash
   grep -lr "<關鍵字>" /Users/chunping.wang/project/ --include="*.go" --include="*.ts" 2>/dev/null | head -5
   ```
3. 定位到 repo 後，用該 repo 的 path 跑 skill / subagent
4. 多 repo 有可能都相關 → 先從訊息最直接指涉的那個下手

## 注意事項
- `additional working directories` 裡有 `fedgpt-flowise`；其他 repo 要查就 cd 過去（或直接用絕對路徑操作）
- 不要在別的 repo 做破壞性操作（commit/push）除非訊息明確授權
- 查 log 先用 debug-loki skill，不要 ssh 到 pod
