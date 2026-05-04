# F-001: Vite + React 骨架 — 頁面規格

## 對應 Feature
Issue #3 F-001: Vite + React 骨架

## 對應 Scenarios（f001-vite-react-skeleton.feature）

| Scenario                        | 設計元素                          |
|---------------------------------|-----------------------------------|
| 訪問首頁顯示新版 App             | App shell + React mount 標記      |
| Approvals / Sent / Settings 分頁 | NavLink tabs                      |
| 重新整理保留路由                  | Go fallback handler               |
| WebSocket 連線狀態顯示           | ConnectionBadge 三狀態            |
| Auto-mode toggle 與 backend 同步 | AutoModeToggle                    |

## 頁面結構

見 `pages/layout.md` — F-001 主要工作是建立 Layout，子頁面內容為 placeholder。

## App Shell HTML（index.html）

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Google Chat Agent</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

注意：`<title>` 必須包含 "Google Chat Agent"（對應 Scenario 驗收條件）。

## Loading 狀態（初始化前）

在 React 掛載前，`#root` 可以顯示最小化的 loading indicator（避免白屏）：

```html
<!-- body 加入，React 掛載後自動被覆蓋 -->
<div id="root">
  <div style="min-height:100dvh;display:flex;align-items:center;justify-content:center;">
    <span style="font-family:system-ui;font-size:14px;color:#64748b;">載入中...</span>
  </div>
</div>
```

## main.tsx 結構

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { WebSocketProvider } from './ws/WebSocketProvider'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <WebSocketProvider>
        <App />
      </WebSocketProvider>
    </BrowserRouter>
  </React.StrictMode>
)
```

## index.css 結構

```css
@import "tailwindcss";

/* === Design Tokens（從 design/tokens/ 複製） === */

@theme {
  /* colors.css @theme 內容 */
  /* typography.css @theme 內容 */
  /* spacing.css @theme 內容 */
}

.dark {
  /* colors.css .dark 內容 */
}

/* prefers-reduced-motion（spacing.css 內容）*/
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

/* === Global Base Styles === */
html {
  font-family: var(--font-sans);
  font-size: var(--text-base);
  line-height: var(--leading-normal);
  color: var(--color-text-default);
  background-color: var(--color-surface-subtle);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

/* Scrollbar（密度優先，細 scrollbar） */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
  background: var(--color-border-strong);
  border-radius: var(--radius-full);
}
::-webkit-scrollbar-thumb:hover {
  background: var(--color-neutral-400);
}
```
