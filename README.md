# Google Chat AI Agent

以使用者本人身分在 Google Chat 代收 / 代回訊息。支援 **draft-then-approve** 與 **auto-send** 兩種模式，含語氣學習、安全護欄與審核 UI。

> **目前進度**：Sprint 5（F-011 skip-mark）完成。Backend / Web UI / Chrome Extension 已可全鏈路運作。

## 架構

```
                ┌─────────────────────────────────────────┐
                │  Chrome Extension (manifest v3)         │
                │  ├─ MAIN-world hook：攔 fetch/XHR/WS    │
                │  ├─ Space ref cache                     │
                │  └─ batchexecute template 擷取          │
                └────────────────┬────────────────────────┘
                                 │ (localhost:8080)
                                 ▼
┌────────────────────────────────────────────────────────────┐
│  Go backend (cmd/server)                                   │
│  ├─ httpapi/   REST + WebSocket Hub (/ws/ui, /ws/ext)      │
│  ├─ worker/    chat_processor、draft_sender                │
│  ├─ parser/    WebChannel + 各 batchexecute RPC 反序列化   │
│  ├─ safety/    金錢/承諾/首次對話 → 強制降級 draft         │
│  ├─ oauth/     Google OAuth + AES-GCM token 加密           │
│  └─ store/     pgxpool + embedded migrations (18 個)       │
└────────────────┬───────────────────────────────────────────┘
                 │                            │
                 ▼                            ▼
        Postgres (pgvector)            Claude API (drafts)
                 ▲
                 │
        Web UI (Vite + React，內嵌於 /web/dist)
        Inbox / Approval / Sent log / Settings / Safety
```

## 功能

- **雙模式**：draft 模式產草稿到審核佇列；auto 模式直接以使用者身分送出。
- **安全護欄**：偵測金錢、承諾、首次對話等情境，強制退回 draft（即使 auto 模式）。
- **Skip 機制**：mention-only、blocked keywords、self 訊息自動 skip，支援手動 skip / unskip。
- **語氣學習**：profile facts（public / private / secret 三層）+ pgvector corpus 檢索（規劃中）。
- **Per-space 設定**：每個 space 可獨立覆寫 auto-mode、mention-only。
- **送訊不靠 session.json**：透過 extension proxy 走 batchexecute，使用 OAuth token。

## 本地啟動

### 1. Google Cloud 設定

[Google Cloud Console](https://console.cloud.google.com/)：

1. 建立／選擇專案。
2. 啟用 API：**Google Chat API**、**Workspace Events API**、**Cloud Pub/Sub API**。
3. **OAuth consent screen**：User Type 選 `Internal`（Workspace 內部）。
4. **OAuth 2.0 Client ID** → Web application，redirect URI 設 `http://localhost:8080/oauth/callback`，記下 Client ID / Secret。

### 2. 環境變數

```bash
cp .env.example .env
```

```bash
GOOGLE_CLIENT_ID=<上一步取得>
GOOGLE_CLIENT_SECRET=<上一步取得>
TOKEN_ENCRYPTION_KEY=$(openssl rand -base64 32)   # 32 bytes，加密 DB 裡的 OAuth token
STATE_SIGNING_KEY=$(openssl rand -base64 32)      # 簽 OAuth state cookie 防 CSRF
ANTHROPIC_API_KEY=<Claude API key>                # draft 生成用
```

### 3. 啟動 backend

```bash
make dev
```

流程：`docker-compose up -d postgres` → 自動跑 migrations → `:8080` 啟動 HTTP server（含已 build 的 web/dist）。

打開 <http://localhost:8080/> → 「用 Google 帳號授權」走 OAuth。

### 4. 安裝 Chrome Extension

1. Chrome → `chrome://extensions/` → 開啟「開發者模式」。
2. 「載入未封裝項目」→ 選 `extension/` 目錄。
3. 打開 Google Chat（`mail.google.com/chat/` 或 `chat.google.com`），extension 會自動連 localhost:8080。
4. 點 extension popup 切換 auto-mode。

### 5. Web UI 開發

```bash
make web-dev        # vite dev server
make web-build      # build 到 web/dist（會被 Go server 內嵌）
make contracts      # 從 Go types 重新產 TS contracts
```

## 目錄結構

```
.
├── cmd/
│   ├── server/             # 主程式 entry
│   └── backfill-skip/      # 一次性 D-skip backfill 工具（F-011-pipe1）
├── internal/
│   ├── config/             # env loading
│   ├── cryptoutil/         # AES-GCM token 加密
│   ├── googleapi/          # Google API client wrappers
│   ├── hub/                # WebSocket hub（broadcast + debounce）
│   ├── httpapi/            # REST + WS routes，內嵌 web/dist
│   ├── oauth/              # Google OAuth flow
│   ├── parser/             # WebChannel + batchexecute 反序列化
│   ├── safety/             # 金錢/承諾/首次對話偵測
│   ├── store/              # pgxpool + migrations/*.sql（自動執行）
│   └── worker/             # chat_processor、draft_sender
├── web/                    # Vite + React UI（Inbox / Approval / Settings）
├── extension/              # Chrome MV3 extension
├── specs/                  # SpecFlow 規格 + Gherkin .feature 場景
├── test/                   # playwright-bdd e2e
├── design/                 # UI 元件 dataset
├── docker-compose.yml
└── Makefile
```

## 開發工作流

本專案使用 [SpecFlow](./CLAUDE.md) 自動化交付流程：spec-writer → tech-lead → engineer (backend/frontend/pipeline) + qa + ui-designer 並行 → verify → release。詳見 `specs/` 與 `CLAUDE.md`。

## 已完成 Sprint

| Sprint | 主題 | 主要功能 |
|--------|------|---------|
| 1 | Web UI skeleton | Vite + React，Inbox 基礎 |
| 2 | Approval queue | F-002 草稿審核 + patch + reject |
| 3 | Sent log + Settings | F-003/F-004 已送訊息查詢、auto-mode/mention-only/blocked-keywords |
| 4 | Safety rails | F-008 金錢/承諾/首次對話偵測，強制降級 draft |
| 5 | Skip mark | F-011 mention/blocked/self auto-skip + 手動 skip/unskip |

## License

私人專案。
