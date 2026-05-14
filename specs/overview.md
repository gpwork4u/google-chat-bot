# Google Chat AI Agent — 專案總覽

> Status: 盤點完成 + Web UI 改造規劃（v1.1）
> 最後更新：2026-05-04
> Repo: https://github.com/gpwork4u/google-chat-bot

## 願景

以使用者本人身分在 Google Chat 代收 / 代回訊息，支援 draft-then-approve 與全自動兩種模式。讓 AI 模仿使用者語氣，幫忙處理日常閒聊、工作協調、工程詢問。

## 目標使用者

單人開發者（Taiwan AI Labs 工程師），自用為主，本機部署、單帳號。日後可能擴充多帳號 / 雲端部署。

---

## 現況盤點（既有實作）

README 自述「階段 1 完成（OAuth）」，**實際進度遠超**，已涵蓋階段 1-5 的多數工作。

### 1. Backend（Go）

| 模組 | 路徑 | 狀態 | 說明 |
|------|------|------|------|
| OAuth flow | — | ❌ 已捨棄 | extension-only 模式不需要 Google OAuth；相關 package 已於 chore/remove-oauth 移除 |
| Postgres + migrations | `internal/store/` | ✅ 完成 | pgxpool，11 個 migrations，pgvector image 已備（語氣學習用）|
| Self user 偵測 | `users.go`、commit `f1034a1` | ✅ 完成 | 透過 `get_user_settings` + `chat_members` 自動填 chat_user_id / email |
| WebChannel parser | `internal/parser/chat_webchannel.go` | ✅ 完成 | 解析新訊息推播 frame |
| Batchexecute parsers | `chat_browse / directory / groups / members / search / topics / user_settings` | ✅ 完成 | 各家 RPC 反序列化（含單元測試）|
| Spaces directory | `0009_spaces_directory.sql` | ✅ 完成 | space_key → display_name 單一真值來源 |
| Chat members directory | `0006_chat_members.sql` + `0010` | ✅ 完成 | sender_id → display_name 反查表 |
| Inbox / drafts API | `httpapi/extension.go` | ✅ 完成 | `/api/inbox`、`/api/drafts/{id}/approve\|reject\|patch`、`/api/spaces/toggle` |
| Settings | `0007_mention_only.sql` 等 | ✅ 完成 | auto_mode、mention-only filter、blocked_keywords、per-space 白名單 |
| Claude integration | `httpapi/claude.go` | ✅ 完成 | `/api/claude/pending`（含 debug mode）、`/reply`（idempotent）、`/style-profile`、`/profile` (CRUD) |
| Profile facts | `0011_user_profile_facts.sql` | ✅ 完成 | public / private / secret 三層 visibility |
| WebSocket Hub | `internal/hub/`、`httpapi/ws.go` | ✅ 完成 | `/ws/ui` + `/ws/ext` 雙向，debounced reload |
| Chat processor | `internal/worker/chat_processor.go` (1096 行) | ✅ 完成 | freshness window（30min）、session-start filter、auto_send 由 backend 驅動 |
| Draft sender | — | ❌ 已捨棄 | 改由 Chrome extension 直接代發；backend 不再呼叫 Google Chat API |
| Debug routes | `httpapi/debug.go` | ✅ 完成 | `/debug/simulate_message`、`/debug/raw_events` |

### 2. Chrome Extension（manifest v3）

| 模組 | 狀態 | 說明 |
|------|------|------|
| MAIN-world hook | ✅ 完成 | `inject-main.js` 攔截 fetch / XHR / WebSocket |
| Space ref cache | ✅ 完成 | spaceID-keyed，避免送錯 space（commit `7453c82`）|
| Create_topic / create_message template capture | ✅ 完成 | 攔下使用者本人送訊息的封包當送出範本 |
| Popup | ✅ 完成 | auto-mode toggle，連到 inbox / health |
| Content script bridge | ✅ 完成 | MAIN-world ↔ isolated world ↔ localhost:8080 |

### 3. Web UI

| 狀態 | 說明 |
|------|------|
| ⚠️ 簡易 | 單一 `internal/httpapi/web/app.html`，沒有 Vite / React 框架。功能含 inbox 列表、draft preview、auto-mode toggle、Channel 設定 |
| ❌ 缺 | 沒有 Approval queue 完整介面、沒有 Sent log、沒有 Settings 頁、沒有測試 |

### 4. Claude Skill

| 路徑 | 狀態 |
|------|------|
| `.claude/skills/chat-drafts/SKILL.md` | ✅ 完成（最近大幅改寫，未 commit）|
| `references/categorize.md` (閒聊 / 工作 / 工程 / skip) | ✅ |
| `references/{daily-chat, work-coordination, engineering, jira, clarify, profile, repo-map}.md` | ✅ |

### 5. 測試

| 類型 | 狀態 |
|------|------|
| Parser unit tests | ✅ `chat_members_test.go`、`chat_search_test.go`、`chat_topics_test.go`、`chat_webchannel_test.go` |
| Backend integration tests | ❌ 無 |
| BDD / E2E (playwright-bdd) | ❌ 無 |
| Extension tests | ❌ 無 |

### 6. 計畫 vs. 現況落差

| 原計畫（README）| 實際走向 |
|------|------|
| Workspace Events API + Cloud Pub/Sub | ❌ 改走 Chrome extension hook fetch/XHR/WS 路線（不需 Workspace admin）|
| Vite + React frontend | ❌ 還沒；目前單頁 HTML |
| pgvector embedding 檢索 | ⚠️ image 已備、schema 未用，目前 style profile 只是 sample 列表 |
| 安全護欄（金錢 / 承諾 / 首次對話 → 強制 draft）| ❌ 未實作；auto_mode 是無條件直送 |

---

## 盤點時的未 commit 變更（已收尾）

盤點時 `git diff --stat HEAD` 共 16 個檔案 +847/-178，已分三個 commit 落地（2026-05-04）：

| Commit | 範圍 |
|--------|------|
| `d67126a` | Skill-driven drafting + debug mode + profile facts CRUD |
| `9347812` | Sender ID 反查 + profile facts schema + browse/directory parser |
| `7908ed1` | SpecFlow 工作流工具鏈（agents / skills / scripts / actions）|

主線收尾後，現在站在乾淨 baseline 上開始 Web UI 改造。

---

## 技術棧

| 層 | 技術 | 備註 |
|----|------|------|
| Language | Go 1.21+ | `go.mod` |
| DB | Postgres 16 + pgvector | docker-compose，port 2345（host） |
| HTTP | net/http (stdlib) | 用 Go 1.22 路由語法（`POST /api/...`） |
| WebSocket | gorilla/websocket（推測，待確認） | hub.go 實作 |
| Auth | extension-only（localhost） | 單機單使用者；不走 Google OAuth |
| Frontend | 單頁 HTML / vanilla JS | 待升級 |
| LLM | Anthropic Claude（透過 Skill）| backend 不直接呼叫 API，由 skill 透過 `/api/claude/*` 互動 |
| Extension | manifest v3，chat.google.com / mail.google.com | MAIN-world inject |

## 部署 / 開發環境

- 全本機：`make dev` 啟動 docker-compose（postgres）+ Go server 在 :8080
- Chrome extension load unpacked from `extension/`
- Skill 跑在使用者自己的 Claude Code session

---

## 已選方向：Web UI 改造（**進行中**）

使用者 2026-05-04 確認：先做 Web UI 改造。粒度小步快跑，每個 sprint 1-2 個 feature。

### Sprint 規劃

#### Sprint 1：UI 框架 + Approval Queue（P0）

| Feature | 名稱 | Lane | Spec | Feature File |
|---------|------|------|------|--------------|
| F-001 | Vite + React 專案骨架 | frontend | `features/f001-vite-react-skeleton.md` | `features/f001-vite-react-skeleton.feature` |
| F-002 | Approval Queue 頁 | frontend | `features/f002-approval-queue.md` | `features/f002-approval-queue.feature` |

目標：取代 `internal/httpapi/web/app.html`，建立 Vite + React + TS + Tailwind 骨架，並完成核心的 approval flow（list / approve / edit / reject + WS 即時刷新 + 鍵盤快捷鍵）。

#### Sprint 2：Sent Log + Settings（P1）

| Feature | 名稱 | Lane | Spec | Feature File |
|---------|------|------|------|--------------|
| F-003 | Sent Log 頁 | frontend | `features/f003-sent-log.md` | `features/f003-sent-log.feature` |
| F-004 | Settings 頁 | frontend | `features/f004-settings.md` | `features/f004-settings.feature` |

目標：補完三個分頁。Sent log 提供稽核，Settings 集中管理全域 + per-channel + profile facts。

### 後續候選（尚未排期）

| 編號 | 主題 | 推薦度 |
|------|------|--------|
| A | BDD/E2E 測試骨架（playwright-bdd） | ★★★ |
| C | 語氣學習強化（pgvector embedding） | ★★ |
| D | 安全護欄（金錢 / 承諾 / 首次對話降級回 draft） | ★★★ |
| F | Extension UX（popup 待回數量、桌面通知） | ★★ |
| G | 監控 / 觀測（結構化日誌 / metrics） | ★ |

---

## 範圍邊界（暫定）

**做**：
- 單人 Google 帳號自用
- Chrome extension 為唯一收訊管道
- Claude Skill 為唯一起草管道
- 本機 Docker Compose 部署

**不做（除非後續決定）**：
- 多租戶 SaaS
- 不依賴 extension 的純後端方案（Workspace Events 路線）
- iOS / Android 客戶端
