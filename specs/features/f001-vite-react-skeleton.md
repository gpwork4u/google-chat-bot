# F-001: Vite + React 專案骨架

## Status: planned
## Sprint: 1
## Priority: P0
## Lane: frontend

## 使用者故事

As a 單人使用者
I want 用一個現代化的 Web UI 取代 `internal/httpapi/web/app.html` 單頁
So that 後續可以漸進式擴充 Approval queue / Sent log / Settings 三個分頁，不再受限於單一 HTML 檔

## 範圍（In Scope）

1. 在 repo 根目錄建立 `web/` 子專案（Vite + React + TypeScript）
2. Build 產物輸出到 `web/dist/`，由 Go backend 透過既有 static handler 提供
3. 替換 `internal/httpapi/web/app.html` 的服務路徑：
   - 開發模式：Go backend `:8080` 反向代理到 Vite dev server `:5173`（或前端直連 backend、由 Vite proxy 轉送 `/api/*`、`/ws/*`）
   - 生產模式：Go embed `web/dist/` 並 serve 在 `/`
4. App shell：
   - 三個分頁的 router（react-router）：`/approvals`、`/sent`、`/settings`
   - 共用 layout：頂部 nav、auto-mode toggle、connection status badge
   - WebSocket client：連 `/ws/ui`，提供 React context 廣播事件給子頁面
5. API client 抽象層：`web/src/api/client.ts`，封裝 fetch + 統一錯誤處理
6. 基本樣式：Tailwind CSS（utility-first，符合單人專案快速迭代）

## 非範圍（Out of Scope）

- 各分頁的內部功能（在 F-002 / F-003 / F-004 處理）
- 國際化（i18n）— 全程繁中即可
- 主題切換 — 預設深色或淺色擇一即可
- 行動裝置適配 — 桌面瀏覽器優先

## API Contract

本 feature 不新增 API endpoint。沿用既有：

| Endpoint | 用途 |
|----------|------|
| `GET /` | Serve `web/dist/index.html`（生產）或 redirect 到 Vite（開發）|
| `GET /assets/*` | Serve Vite build 產物 |
| `GET /ws/ui` | WebSocket 廣播事件 |

## Build / Dev workflow

- `cd web && npm install`
- 開發：`npm run dev`（port 5173），Vite proxy 把 `/api` `/ws` 轉到 `:8080`
- 建置：`npm run build` → `web/dist/`
- 生產：Go binary embed `web/dist/`（`go:embed web/dist`）

## 驗收標準

- 啟動 backend 後瀏覽 `http://localhost:8080/` 顯示新版 React app（不是舊的 app.html）
- `/approvals`、`/sent`、`/settings` 三個 route 都可訪問（內容可為 placeholder）
- 頂部 nav 有 auto-mode toggle，狀態與 backend 同步（透過既有 `/api/spaces/auto-mode` 或同等 endpoint）
- WebSocket 連線狀態顯示（連線中 / 斷線）
- 重新整理頁面不會白屏

## 技術備註

- Vite proxy 設定範例：
  ```ts
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
      '/ws':  { target: 'ws://localhost:8080', ws: true },
    },
  }
  ```
- Go embed 範例：`//go:embed all:web/dist` + `http.FileServer(http.FS(distFS))`
- 舊 `app.html` 暫時保留一個 sprint 作為 fallback（`/legacy` route），確認新 UI 穩定後刪除

## Scenarios

詳見 `f001-vite-react-skeleton.feature`
