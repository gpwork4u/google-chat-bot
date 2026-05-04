# 技術選型調查報告（Sprint 1）

## 調查日期
2026-05-04

## 調查範圍
僅針對 Sprint 1 待決定的前端細節進行 survey。已決定的後端 / DB / extension / 部署方式不再調查。

## 既有選型（直接沿用）

| 層 | 選擇 | 來源 |
|----|------|------|
| Backend | Go (`net/http` + 既有 hub) | repo 既有 |
| DB | PostgreSQL + pgvector | repo 既有 |
| Extension | Chrome MV3 | repo 既有 |
| 部署 | docker-compose（本地） | repo 既有 |
| E2E 測試框架 | playwright-bdd | SpecFlow 標配 |

---

## 1. Go embed Vite build 整合

### 結論：採 `//go:embed all:web/dist` + `http.FS` + Vite proxy 開發

**生產（單一 binary）**

```go
// internal/httpapi/web/web.go (新增 sibling 檔，與 app.html 並存一個 sprint)
package web

import (
    "embed"
    "io/fs"
    "net/http"
)

//go:embed all:dist
var distFS embed.FS

func DistHandler() http.Handler {
    sub, _ := fs.Sub(distFS, "dist")
    return http.FileServer(http.FS(sub))
}
```

注意：`//go:embed` 在 build 時若找不到 `web/dist/` 會直接編譯失敗。為了讓 Go 開發者在沒有跑過 `npm run build` 時也能 `go build`，**約定 commit 一個 `dist/.gitkeep` + 空的 `dist/index.html` placeholder**，或用 `go:embed dist/*` 搭配條件 build tag（推薦前者，簡單）。

**開發（兩個 server）**

- Go 在 `:8080` 跑 API + WS
- Vite 在 `:5173` 跑前端 dev server
- Vite `vite.config.ts` 設 proxy：
  ```ts
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8080',
      '/ws':  { target: 'ws://localhost:8080', ws: true, changeOrigin: true },
    },
  }
  ```
- 開發者在 `http://localhost:5173/` 開發；生產時所有資源由 Go 一個 port 提供。

### 為什麼這個寫法
- **單一 binary**：部署只要 `go build` 後丟一個檔案，符合 repo 既有 docker 部署精神
- **開發 HMR**：Vite proxy 是業界標準寫法，比讓 Go 反向代理 Vite 簡單（不用啟兩個 docker service）
- **不需第三方 lib**：`olivere/vite` / `torenware/vite-go` 提供 manifest 自動注入，但 SPA 場景用不到（單一 entry）

### 路由 fallback（重要）
React Router 用 client-side routing，使用者重新整理 `/settings` 時，Go 必須回 `index.html`（不是 404）。實作：

```go
// 收到路徑非 /api/* 也非 /ws/* 也非 /assets/* 時，serve index.html
mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
    if strings.HasPrefix(r.URL.Path, "/api/") || strings.HasPrefix(r.URL.Path, "/ws/") {
        http.NotFound(w, r); return
    }
    // 嘗試實體檔，否則回 index.html
    if _, err := fs.Stat(distFS, "dist"+r.URL.Path); err == nil && r.URL.Path != "/" {
        web.DistHandler().ServeHTTP(w, r); return
    }
    indexHTML, _ := fs.ReadFile(distFS, "dist/index.html")
    w.Header().Set("Content-Type", "text/html; charset=utf-8")
    w.Write(indexHTML)
})
```

### 參考
- [Embed Vite app in a Go Binary - Tushar Choudhari](https://www.tushar.ch/writing/embed-vite-app-in-go-binary)
- [Baking a React App into a Go server](https://vishnubharathi.codes/blog/baking-a-react-app-into-a-go-server/)
- [Go Embed Vite - Feng's Notes](https://ofeng.org/posts/go-embed-vite/)

---

## 2. Tailwind CSS 4 vs 3

### 結論：採 **Tailwind 4**（搭配 `@tailwindcss/vite` plugin）

| 比較 | Tailwind 3 | Tailwind 4 |
|------|-----------|-----------|
| 狀態 | 維護中 | 2025 GA、2026 已穩定 |
| 引擎 | PostCSS / JIT | Oxide（Rust，2-5x 快）|
| 設定 | `tailwind.config.js` | CSS `@theme` directive |
| Vite 整合 | PostCSS plugin | 專屬 `@tailwindcss/vite` plugin |
| 瀏覽器需求 | 較寬 | Chrome 111+ / Safari 16.4+ / Firefox 128+ |

### 為什麼 v4
- 單人桌面瀏覽器使用，2026 年瀏覽器需求完全 OK
- 設定更少（CSS-first）、build 更快
- Vite plugin 比 PostCSS pipeline 簡單

### 安裝
```bash
npm install -D tailwindcss @tailwindcss/vite
```

`vite.config.ts`：
```ts
import tailwind from '@tailwindcss/vite'
export default { plugins: [react(), tailwind()] }
```

`src/index.css`：
```css
@import "tailwindcss";

@theme {
  --color-brand: #4f46e5;
  /* design tokens 由 ui-designer 定義 */
}
```

### 參考
- [Tailwind v4 Upgrade Guide](https://tailwindcss.com/docs/upgrade-guide)
- [Tailwind v4 vs v3 (2026)](https://frontend-hero.com/tailwind-v4-vs-v3)

---

## 3. WebSocket 在 React 中的實踐

### 結論：採 **react-use-websocket** + Context Provider

評估後，本專案 F-002 / F-003 都需要訂閱 WS 事件，且要做：
- 自動重連（exponential backoff）
- 連線狀態 badge
- 多元件共用同一條連線

自行寫 hook 可行但要寫 reconnect / cleanup / 多元件共享，省不了多少時間。

### 選型對比

| 方案 | 優點 | 缺點 |
|------|------|------|
| 純 useEffect + ref | 零依賴 | 重連、共享、清理都要自己寫 |
| **react-use-websocket** | 重連 + 共享連線 + 訊息佇列 | 多 ~3KB 依賴 |
| socket.io-client | 自動斷線重連 | 後端不是 socket.io，不適用 |

### 實作建議

```tsx
// web/src/ws/WebSocketProvider.tsx
import useWebSocket, { ReadyState } from 'react-use-websocket'

const WS_URL = (() => {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${location.host}/ws/ui`
})()

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const { lastJsonMessage, readyState, sendJsonMessage } = useWebSocket(WS_URL, {
    shouldReconnect: () => true,
    reconnectAttempts: 100,
    reconnectInterval: (attempt) => Math.min(1000 * 2 ** attempt, 30000),
    share: true,
  })
  return (
    <WSContext.Provider value={{ lastJsonMessage, readyState, sendJsonMessage }}>
      {children}
    </WSContext.Provider>
  )
}
```

### 參考
- [react-use-websocket GitHub](https://github.com/robtaussig/react-use-websocket)
- [WebSockets in React: Hooks, Lifecycle, Pitfalls](https://websocket.org/guides/frameworks/react/)

---

## 4. 狀態管理

### 結論：**React Context + hooks，不引入額外狀態管理庫**

理由：
- 單人桌面 app，全域狀態僅 3 項：`auto_mode`、`ws_status`、`drafts list`
- drafts list 用 hook 局部管理（在 `/approvals` 頁），不需提到全域
- `auto_mode` / `ws_status` 用 Context 單向 broadcast，重渲染成本可忽略
- 引入 Zustand / Jotai 等於多一個概念，這個 sprint 不值得

未來若 Sprint 3+ 出現複雜跨頁狀態（例如語氣學習資料），再評估升級到 Zustand。

### 參考
- [React State Management 2026](https://www.pkgpulse.com/blog/react-state-management-2026)
- [Do You Need State Management in 2025?](https://dev.to/saswatapal/do-you-need-state-management-in-2025-react-context-vs-zustand-vs-jotai-vs-redux-1ho)

---

## 5. HTTP Client / Data Fetching

### 結論：採 **SWR**（不用 TanStack Query，不用裸 fetch wrapper）

| 方案 | Bundle | 適合度 |
|------|--------|--------|
| 裸 fetch wrapper | 0KB | 要自己處理 loading / error / dedup / refetch，重複造輪 |
| **SWR** | ~4KB | 簡單、stale-while-revalidate 完美符合 inbox 場景 |
| TanStack Query | ~13KB | 功能強但 mutation orchestration / devtools 對單人專案 overkill |

### 為什麼 SWR
- F-002 inbox 是典型「拉取列表 + WS 推送變化」場景，SWR 的 `mutate(key, newData, false)` 直接打進 cache，配 WS 完美
- F-003 sent log、F-004 settings 都是讀取為主，SWR 足夠
- API mutation（POST approve / reject）用 `swr/mutation` 或直接 fetch 後 `mutate(key)` 觸發 revalidate

### 約定
建立 `web/src/api/client.ts` 統一封裝 base URL / 錯誤處理 / JSON parse，SWR 的 fetcher 用這個 client。

```ts
// web/src/api/client.ts
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } })
  if (!r.ok) throw new ApiError(r.status, await r.text())
  return r.json() as Promise<T>
}
```

### 參考
- [SWR vs TanStack Query 2026](https://dev.to/jake_kim_bd3065a6816799db/swr-vs-tanstack-query-2026-which-react-data-fetching-library-should-you-choose-342c)

---

## 6. playwright-bdd 整合策略

### 結論：testharness 跟既有 `.claude/scripts/run-sprint-tests.sh` 對接

流程：
1. `docker compose up -d`（啟 Postgres + Go backend，前端已 embed 在 binary）
2. 等 backend `/healthz` 200
3. `cd test && npx bddgen`（產出 `.generated/` Playwright tests）
4. `npx playwright test`
5. Coverage check：所有 `specs/features/*.feature` 內 scenario 都被執行

待辦（在 QA issue 處理）：
- `test/playwright.config.ts`：設 `baseURL: http://localhost:8080`、瀏覽器只跑 chromium
- `test/features/` 從 `specs/features/*.feature` symlink 或 copy
- `test/steps/`：UI steps（page navigation / 點擊 / 表單）+ API steps（fetch + assert response）+ WS steps（用 `ws` 套件 inject 事件，或透過 backend 提供的 debug endpoint）

### Pitfall
- WebSocket 事件測試最痛：直接從 Playwright 拉一個 ws client 做不到「推一個 fake event 給 React app」。
- 解法：F-002 spec 中的 `draft_created` / `draft_removed` scenario 改用 **真實 backend 行為觸發**（例如：跑另一條 API 模擬 draft 進入）；如後端沒有對應觸發點，QA 階段必須跟 tech-lead / engineer 討論是否要加 debug endpoint。

### 參考
- [Playwright + Docker Compose CI](https://lachiejames.com/elevate-your-ci-cd-dockerized-e2e-tests-with-github-actions/)
- [playwright-bdd 官方文件](https://vitalets.github.io/playwright-bdd/)

---

## 7. 最終選型 Cheatsheet（給 engineer 用）

```
web/
├── package.json              # vite, react, react-dom, react-router-dom,
│                             # tailwindcss, @tailwindcss/vite,
│                             # swr, react-use-websocket,
│                             # typescript, @types/react, @vitejs/plugin-react
├── vite.config.ts            # plugins: react, tailwindcss; server.proxy /api /ws
├── tsconfig.json             # strict: true, jsx: react-jsx
├── index.html                # <div id="root">
├── src/
│   ├── main.tsx              # ReactDOM.createRoot + BrowserRouter
│   ├── App.tsx               # routes: /approvals /sent /settings
│   ├── index.css             # @import "tailwindcss"; @theme {...}
│   ├── api/client.ts         # fetch wrapper
│   ├── ws/WebSocketProvider.tsx  # react-use-websocket + Context
│   ├── components/
│   │   ├── Layout.tsx        # nav + auto-mode toggle + connection badge
│   │   └── ConnectionBadge.tsx
│   └── pages/
│       ├── ApprovalsPage.tsx
│       ├── SentPage.tsx
│       └── SettingsPage.tsx
└── dist/                     # build 產物，go embed
    └── .gitkeep              # 確保 //go:embed 在沒 build 時也能編
```

Go side 變更（這個 sprint 內，由 frontend lane engineer 一起改）：
- 新增 `internal/httpapi/web/web.go`（embed.FS + DistHandler）
- 在 main router 接上 `mux.Handle("/", reactSPAHandler)`，但保留 `app.html` 在 `/legacy` 一個 sprint
- API endpoint 結構若不符 F-002 spec 預期（`/api/inbox` 回傳 schema），engineer 一併改齊
