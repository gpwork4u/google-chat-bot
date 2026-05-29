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
│  ├─ worker/    chat_processor                              │
│  ├─ parser/    WebChannel + 各 batchexecute RPC 反序列化   │
│  ├─ safety/    金錢/承諾/首次對話 → 強制降級 draft         │
│  └─ store/     pgxpool + embedded migrations (19 個)       │
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
- **送訊走 extension**：所有送訊由 Chrome extension 攔 Google Chat 自己的 batchexecute / WebChannel 流量代發，backend 不直接呼叫 Google API。

## 本地啟動

### 1. 環境變數

```bash
cp .env.example .env
```

```bash
ANTHROPIC_API_KEY=<Claude API key>                # draft 生成用
```

> Extension-only 模式：不需要 Google Cloud / OAuth 設定，亦不需要 service account。

### 2. 啟動 backend

```bash
make dev
```

流程：`docker-compose up -d postgres` → 自動跑 migrations → `:8080` 啟動 HTTP server（含已 build 的 web/dist）。

### 3. 安裝 Chrome Extension

1. Chrome → `chrome://extensions/` → 開啟「開發者模式」。
2. 「載入未封裝項目」→ 選 `extension/` 目錄。
3. 打開 Google Chat（`mail.google.com/chat/` 或 `chat.google.com`），extension 會自動連 localhost:8080。
4. 點 extension popup 切換 auto-mode；打開 <http://localhost:8080/> 看 Inbox / Approval / Settings。

### 4. Web UI 開發

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
│   ├── googleapi/          # 瀏覽器 session 載入（batchexecute stylesync 用）
│   ├── hub/                # WebSocket hub（broadcast + debounce）
│   ├── httpapi/            # REST + WS routes，內嵌 web/dist
│   ├── parser/             # WebChannel + batchexecute 反序列化
│   ├── safety/             # 金錢/承諾/首次對話偵測
│   ├── store/              # pgxpool + migrations/*.sql（自動執行）
│   └── worker/             # chat_processor
├── web/                    # Vite + React UI（Inbox / Approval / Settings）
├── extension/              # Chrome MV3 extension
├── specs/                  # SpecFlow 規格 + Gherkin .feature 場景
├── test/                   # playwright-bdd e2e
├── design/                 # UI 元件 dataset
├── docker-compose.yml
└── Makefile
```

## 為什麼所有發送 / mutation 都必須走 Chrome extension

曾嘗試「backend 直接 `POST https://chat.google.com/u/0/api/...`」走 Go HTTP client，省去 Chat tab 必須開著的限制。**走不通**：

- Google Chat 對 `/api/update_reaction` 等 mutation endpoint 會檢查 Chrome 注入的整套 anti-abuse signal，最關鍵的是 `x-browser-validation` ── 一個 **per-request 的簽章**，由 Chrome native code 在 send 之前最後一刻計算，內容取決於 URL / body 等。JS 看不到、JS hook 攔不到、`chrome.cookies` API 也讀不到。
- 其他 `x-client-data`（finch flags）、`sec-ch-ua-*`（Client Hints）也都是 Chrome native 自動附加；JS 的 `setRequestHeader` 之後 Chrome 才補上，extension 沒辦法觀察。
- 即使把 86 個 google.com cookie + xsrf token 都從 extension 透過 `chrome.cookies` 拋給 backend，Go HTTP client 打 chat.google.com 仍會收到 **401 / code 16**（auth/integrity 失敗）。

結論：所有寫操作（send message / update_reaction / 任何 `/api/...` POST）**必須在 chat.google.com 原生 origin 內由 Chrome 發送**，backend 只能透過 extension 代發。Chat tab 必須開著是這個架構的硬性前提。

> 例外是讀操作：只需 cookie 沒 mutation 的 RPC 用 `cmd/backfill-skip` 那類腳本 + 拋出來的 session cookie 是可以直接打的，但會繞 PII 跟 abuse policy，本專案不採用。

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
