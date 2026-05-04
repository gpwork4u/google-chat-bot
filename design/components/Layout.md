# Layout

## 用途

App Shell — 所有頁面的共用外框，包含：
- 頂部 Navbar（品牌、路由 tabs、Auto-mode toggle、Connection badge）
- 主內容區（max-width 容器）

此 Layout 為 F-001 骨架的核心，同時為 F-003（Sent Log）和 F-004（Settings）預留插槽。

---

## 整體結構

```
┌──────────────────────────────────────────────────────────────────┐
│  Navbar (height: 48px, sticky top-0)                             │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ [bot icon] Chat Agent   Approvals  Sent  Settings           │ │
│  │                                          [Auto] [connection] │ │
│  └─────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────┤
│  Main Content（max-w-3xl mx-auto px-4）                          │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                                                             │ │
│  │  <Outlet /> — 子頁面內容注入                                │ │
│  │                                                             │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

---

## Navbar 細節

### 尺寸

- 高度：`h-12`（48px）
- `sticky top-0 z-[--z-sticky]`
- 背景：`bg-[--color-surface-default] border-b border-[--color-border-default]`
- Blur（毛玻璃，可選）：`backdrop-blur-sm bg-[--color-surface-default]/90`

### 內部 Flex 佈局

```
左側                          中間（絕對置中）      右側
[icon] [brand-text]           [Approvals][Sent][Settings]    [auto-toggle] [connection]
```

> 實作建議：使用三欄 `grid grid-cols-3` 讓中間 tab group 真正置中。

### 品牌（左側）

- Icon：`<BotMessageSquare />` Lucide，`size={18}`，`text-[--color-primary-600]`
- 文字：`"Chat Agent"`, `text-sm font-semibold text-[--color-text-default]`
- 連結：`to="/"` 或 `to="/approvals"`

### Nav Tabs（中間）

三個連結：**Approvals / Sent / Settings**

- 元素：`<NavLink>` (react-router)
- 文字：`text-sm font-medium`
- Padding：`px-3 py-1.5`，觸控最小目標透過負 margin 或 wrapper 達到 44px

#### Active 狀態

```
                      Approvals
                     ──────────   ← 底部 2px 線 border-b-2 border-primary-600
```

```tsx
// NavLink className 函數
className={({ isActive }) =>
  isActive
    ? "text-[--color-primary-600] border-b-2 border-[--color-primary-600] pb-[calc(0.375rem-1px)]"
    : "text-[--color-text-muted] hover:text-[--color-text-secondary] border-b-2 border-transparent pb-[calc(0.375rem-1px)]"
}
```

注意：`pb` 減 1px 補回 border 佔的空間，避免 active/inactive 高度不一致（CLS）。

#### Inactive Hover

`hover:text-[--color-text-secondary]`，150ms transition

### Auto-mode Toggle（右側）

- 元素：`<button role="switch" aria-checked={autoMode}`
- 外觀：pill toggle，`w-8 h-4.5`（32×18px）
- OFF：背景 `bg-[--color-neutral-300]`，thumb `translate-x-0`
- ON：背景 `bg-[--color-primary-600]`，thumb `translate-x-3.5`
- Thumb：`w-3 h-3`，`bg-white rounded-full`，`transition-transform duration-150`
- Label：視覺標籤「Auto」`text-xs text-[--color-text-muted] mr-1.5`
- Accessible label：`aria-label="自動模式 開/關"`

```
[Auto]  [○────]   ← OFF
[Auto]  [────●]   ← ON（indigo）
```

### Connection Badge（右側）

使用 `Badge` 元件（`dot` 模式，見 `Badge.md`）。

| ReadyState | Status         | Label   |
|------------|----------------|---------|
| 1 (OPEN)   | `connected`    | 已連線  |
| 0 (CONNECTING) / 3 (CLOSING) | `reconnecting` | 重連中 |
| 3 (CLOSED) | `offline`      | 離線    |

```tsx
// react-use-websocket ReadyState 對應
import { ReadyState } from 'react-use-websocket'

const statusMap = {
  [ReadyState.OPEN]:        { status: 'connected',    label: '已連線' },
  [ReadyState.CONNECTING]:  { status: 'reconnecting', label: '重連中' },
  [ReadyState.CLOSING]:     { status: 'reconnecting', label: '重連中' },
  [ReadyState.CLOSED]:      { status: 'offline',      label: '離線'   },
}
```

---

## 主內容區

```tsx
<main className="max-w-3xl mx-auto w-full px-4 py-4">
  <Outlet />
</main>
```

- `max-w-3xl`（768px）— inbox 最佳閱讀寬度
- `px-4` 小螢幕邊距
- `py-4` 頂部空間

---

## 響應式（桌面優先）

此 app 為桌面瀏覽器優先（spec: F-001 Out of Scope：行動裝置適配）。

| 螢幕寬度   | 變化                                               |
|------------|----------------------------------------------------|
| >= 768px   | 正常三欄 navbar                                    |
| < 768px    | Brand 文字縮短或隱藏；nav tabs 保持可見；toggle + badge 縮為 icon-only |

---

## 完整 Navbar Tailwind Classes

```tsx
// Navbar wrapper
<nav
  className={[
    "sticky top-0 z-[--z-sticky]",
    "h-12 flex items-stretch",
    "bg-[--color-surface-default]/90 backdrop-blur-sm",
    "border-b border-[--color-border-default]",
  ].join(" ")}
  role="navigation"
  aria-label="主要導覽"
>
  {/* 三欄 grid */}
  <div className="grid grid-cols-3 items-center w-full max-w-3xl mx-auto px-4 gap-4">
    {/* 左：Brand */}
    <Link to="/approvals" className="flex items-center gap-1.5 text-sm font-semibold text-[--color-text-default]">
      <BotMessageSquare size={18} className="text-[--color-primary-600]" aria-hidden="true" />
      <span>Chat Agent</span>
    </Link>

    {/* 中：Nav tabs */}
    <div className="flex items-stretch justify-center gap-1">
      {[
        { to: "/approvals", label: "Approvals" },
        { to: "/sent",      label: "Sent" },
        { to: "/settings",  label: "Settings" },
      ].map(({ to, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            [
              "px-3 text-sm font-medium",
              "flex items-center border-b-2 transition-colors duration-150",
              isActive
                ? "text-[--color-primary-600] border-[--color-primary-600]"
                : "text-[--color-text-muted] border-transparent hover:text-[--color-text-secondary]",
            ].join(" ")
          }
        >
          {label}
        </NavLink>
      ))}
    </div>

    {/* 右：Controls */}
    <div className="flex items-center justify-end gap-3">
      {/* Auto-mode toggle */}
      <label className="flex items-center gap-1.5 cursor-pointer select-none">
        <span className="text-xs text-[--color-text-muted]">Auto</span>
        <button
          role="switch"
          aria-checked={autoMode}
          aria-label="自動模式"
          onClick={toggleAutoMode}
          className={[
            "relative w-8 h-[18px] rounded-full",
            "transition-colors duration-150 focus-visible:outline-none",
            "focus-visible:ring-2 focus-visible:ring-[--color-border-focus]",
            autoMode ? "bg-[--color-primary-600]" : "bg-[--color-neutral-300]",
          ].join(" ")}
        >
          <span className={[
            "absolute top-[3px] left-[3px]",
            "w-3 h-3 rounded-full bg-white",
            "transition-transform duration-150 shadow-xs",
            autoMode ? "translate-x-[14px]" : "translate-x-0",
          ].join(" ")} />
        </button>
      </label>

      {/* Connection badge */}
      <ConnectionBadge readyState={readyState} />
    </div>
  </div>
</nav>
```

---

## 元件拆分建議

```
web/src/components/
├── Layout.tsx              # Navbar + <Outlet /> 外框
├── ConnectionBadge.tsx     # 連線狀態 dot badge
└── AutoModeToggle.tsx      # Auto toggle（可選拆出）
```

---

## Accessibility

- `<nav role="navigation" aria-label="主要導覽">`
- Nav tabs 使用 `<NavLink>`（原生 `<a>`），keyboard-navigable
- Active tab：`aria-current="page"`（react-router NavLink 自動加）
- Auto toggle：`role="switch"` + `aria-checked`
- Connection badge：`role="status"` + `aria-label`（見 Badge.md）
- 全部互動元素有 `focus-visible:ring-2` focus state
