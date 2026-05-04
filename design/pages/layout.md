# App Layout — 共用頁面結構

## 對應 Feature
- F-001: Vite + React 骨架

## 整體架構

```
┌──────────────────────────────────────────────────────────────────────┐
│  Navbar（sticky top-0, h-12, z-sticky）                               │
│  bg-surface/90 backdrop-blur + border-b                              │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ [BotIcon] Chat Agent  │  Approvals  Sent  Settings  │  [Auto] [●] │
│  └────────────────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────────────┤
│  <main> max-w-3xl mx-auto px-4 py-4                                  │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                                                                │  │
│  │  <Outlet />                                                    │  │
│  │  ↑ /approvals → ApprovalsPage                                  │  │
│  │  ↑ /sent      → SentPage（Sprint 2）                           │  │
│  │  ↑ /settings  → SettingsPage（Sprint 2）                       │  │
│  │                                                                │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

## 路由結構

```tsx
// web/src/App.tsx
<BrowserRouter>
  <Routes>
    <Route path="/" element={<Layout />}>
      <Route index element={<Navigate to="/approvals" replace />} />
      <Route path="approvals" element={<ApprovalsPage />} />
      <Route path="sent"      element={<SentPage />} />       {/* Sprint 2 */}
      <Route path="settings"  element={<SettingsPage />} />   {/* Sprint 2 */}
    </Route>
    <Route path="legacy" element={<LegacyPage />} />  {/* 舊 app.html fallback */}
    <Route path="*" element={<Navigate to="/approvals" replace />} />
  </Routes>
</BrowserRouter>
```

## Navbar 元件清單

| 區塊         | 元件                  | Spec                               |
|--------------|-----------------------|------------------------------------|
| Brand        | `<Link>`              | `Layout.md` → 品牌區域             |
| Nav Tabs     | `<NavLink>` × 3       | `Layout.md` → Nav Tabs             |
| Auto Toggle  | `<AutoModeToggle />`  | `Layout.md` → Auto-mode Toggle     |
| Connection   | `<ConnectionBadge />` | `Badge.md` → Connection Badge      |

## Spacing / Sizing 快速參考

| 元素          | Token          | 實際值 |
|---------------|----------------|--------|
| Navbar height | `h-12`         | 48px   |
| Content max-w | `max-w-3xl`    | 768px  |
| Content px    | `px-4`         | 16px   |
| Content py    | `py-4`         | 16px   |

## SentPage / SettingsPage Placeholder（Sprint 1 用）

Sprint 1 中，`/sent` 和 `/settings` 顯示 placeholder，不影響 Layout 骨架完整性：

```tsx
// SentPage.tsx（Sprint 1 placeholder）
export function SentPage() {
  return (
    <div className="py-12 text-center text-[--color-text-muted] text-sm">
      Sent log — Sprint 2 coming soon
    </div>
  )
}

// SettingsPage.tsx（Sprint 1 placeholder）
export function SettingsPage() {
  return (
    <div className="py-12 text-center text-[--color-text-muted] text-sm">
      Settings — Sprint 2 coming soon
    </div>
  )
}
```
