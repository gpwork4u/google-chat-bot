# Google Chat AI Agent

以你自己的 Google 帳號身分在 Google Chat 代收、代回訊息。支援 draft-then-approve 與全自動兩種模式，含語氣學習。

> **狀態**：階段 1 完成 — Go 專案骨架 + Postgres + Google OAuth 授權流程。
> 下一階段：Workspace Events + Pub/Sub 收訊。

## 架構速覽

```
Google Chat ──▶ Workspace Events API ──▶ Cloud Pub/Sub ──▶ Go backend
                                                               │
                                    ┌──────────────────────────┤
                                    ▼                          ▼
                              Claude API (draft)         Chat API (以使用者身分送出)
                                    │
                                    ▼
                              Postgres (Inbox / Approval queue / Audit log / Style corpus)
                                    │
                                    ▼
                              Web UI (Vite + React)
```

## 本地啟動（階段 1）

### 1. 建立 Google Cloud 專案與憑證

在 [Google Cloud Console](https://console.cloud.google.com/) 操作：

1. **建立／選一個專案**。
2. **啟用以下 API**（APIs & Services → Library）：
   - Google Chat API
   - Google Workspace Events API
   - Cloud Pub/Sub API（之後階段需要）
3. **OAuth consent screen**（APIs & Services → OAuth consent screen）：
   - User Type：`Internal`（你是 ailabs.tw Workspace 成員，選 Internal 不用審核）
   - App name、support email 填寫
   - Scopes：可以先留空，實際授權時會動態要求
4. **建立 OAuth 2.0 Client ID**（APIs & Services → Credentials → Create Credentials → OAuth client ID）：
   - Application type：`Web application`
   - Authorized redirect URIs：`http://localhost:8080/oauth/callback`
   - 建立後拿到 **Client ID** 和 **Client Secret**。

### 2. 設定環境變數

```bash
cp .env.example .env
```

填入：

```bash
GOOGLE_CLIENT_ID=<步驟 1.4 的 Client ID>
GOOGLE_CLIENT_SECRET=<步驟 1.4 的 Client Secret>

# 32 bytes base64，加密 DB 裡的 OAuth token
TOKEN_ENCRYPTION_KEY=$(openssl rand -base64 32)

# 任意長 random string，簽 OAuth state cookie 防 CSRF
STATE_SIGNING_KEY=$(openssl rand -base64 32)
```

### 3. 啟動

```bash
make dev
```

`make dev` 會：

1. `docker-compose up -d postgres` 啟動 Postgres（pgvector image，之後做語氣學習會用到）。
2. 執行 migrations（程式啟動時自動跑）。
3. 在 `:8080` 啟動 HTTP server。

### 4. 走一次 OAuth

打開瀏覽器到 <http://localhost:8080/>，點「用 Google 帳號授權」。

- Google 會跳出同意頁，列出所有 scopes。
- 同意後會 redirect 回來，`users` table 應該有你的一筆 row（access/refresh token 已加密）。

用 psql 驗證：

```bash
psql postgres://chatbot:chatbot@localhost:2345/chatbot -c \
  "SELECT id, email, name, length(access_token) AS ct_bytes, token_expiry FROM users;"
```

## 目錄結構

```
.
├── cmd/server/            # main entry
├── internal/
│   ├── config/            # env loading
│   ├── cryptoutil/        # AES-GCM for token encryption
│   ├── oauth/             # Google OAuth flow
│   ├── store/             # pgxpool + migrations (embedded)
│   │   └── migrations/    # *.sql, executed in lexical order on startup
│   └── httpapi/           # HTTP routes
├── web/                   # (reserved) Vite + React frontend
├── docker-compose.yml
├── Makefile
├── .env.example
└── go.mod
```

## 接下來的階段

- [ ] Workspace Events API 訂閱（需要 Cloud Pub/Sub）
- [ ] 收訊 webhook → 寫進 `messages` table
- [ ] Claude draft 生成
- [ ] 送出訊息（以使用者身分呼叫 Chat API）
- [ ] Web UI：Inbox / Approval queue / Sent log / auto-mode toggle
- [ ] 語氣 corpus 撈取 + embedding 檢索
- [ ] 安全護欄（金錢/承諾/首次對話 → 強制降級回 draft）
