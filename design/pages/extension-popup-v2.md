# Extension Popup v2（歷史同步增強）

## 對應 Feature

#87 F-004-fe1: popup sync buttons + settings 連結
#88 F-012-pipe1: extension scan loop（popup 進度顯示）
Issue #89 Sprint 6 UI Design

---

## 說明

在既有 Chrome extension popup（280px 寬）底部增加「歷史同步」功能區塊。
既有 UI（status badge / auto-mode toggle / 收件匣連結）維持不變，在下方加分隔線後追加。

---

## 版面

### 完整 Popup Layout（280px 寬）

```
┌────────────────────────────────────────┐  ← 280px fixed
│  ● 已連線              [auto: OFF]     │  ← 既有：ConnectionBadge + AutoMode toggle
│  ─────────────────────────────────── │
│  [📥 前往收件匣]                       │  ← 既有：收件匣連結
│  ─────────────────────────────────── │  ← 新增分隔線
│                                       │
│  歷史同步                              │  ← 新增：section 標題（sm, font-medium）
│                                       │
│  [同步此 Space 歷史]                   │  ← 新增：Sync current（只在 chat space 頁顯示）
│  [同步所有 Space 歷史]                 │  ← 新增：Sync all
│                                       │
│  ┌───────────────────────────────┐    │  ← 新增：SyncProgress 元件（只在 sync 中顯示）
│  │ ⏳ 同步中... 152 則（8 重複）  │    │
│  │ [進行中] badge                │    │
│  └───────────────────────────────┘    │
│                                       │
│  [→ Pending 訊息檢視]                 │  ← 新增：Settings 連結 hint
│                                       │
└────────────────────────────────────────┘
```

### 非 Chat Space 頁面（不顯示「同步此 Space」）

```
┌────────────────────────────────────────┐
│  ... 既有 UI ...                       │
│  ─────────────────────────────────── │
│  歷史同步                              │
│  [同步所有 Space 歷史]                 │  ← 只顯示 Sync All
│  ─────────────────────────────────── │
│  [→ Pending 訊息檢視]                 │
└────────────────────────────────────────┘
```

---

## 新增區塊規格

### 分隔線

```tsx
<hr className="border-[--color-border-default] my-2" aria-hidden="true" />
```

### Section 標題

```tsx
<p className="text-xs font-medium text-[--color-text-muted] px-3 mb-2 uppercase tracking-wider">
  歷史同步
</p>
```

### Sync 按鈕

兩個按鈕樣式相同：`Button variant="secondary" size="sm" fullWidth`。

| 按鈕 | data-testid | aria-label | 顯示條件 |
|------|-------------|-----------|---------|
| 同步此 Space 歷史 | `sync-history-current` | `同步此 Space 的歷史訊息` | 當前頁為 Google Chat space（content.js 偵測） |
| 同步所有 Space 歷史 | `sync-history-all` | `同步所有 Space 的歷史訊息` | 永遠顯示 |

States：

| State | 外觀 |
|-------|------|
| idle | 正常按鈕 |
| disabled（sync 進行中） | `disabled` + `aria-disabled="true"` + `title="同步進行中，請稍候"` |
| loading（點擊後建立 job 中） | 按鈕 loading spinner |

```tsx
<div className="flex flex-col gap-1.5 px-3">
  {/* 只在 chat space 頁顯示 */}
  {isOnChatSpacePage && (
    <Button
      variant="secondary"
      size="sm"
      fullWidth
      data-testid="sync-history-current"
      aria-label="同步此 Space 的歷史訊息"
      disabled={isSyncing}
      loading={isStartingCurrentSync}
      onClick={handleSyncCurrent}
      icon={<RefreshCw size={12} />}
    >
      同步此 Space 歷史
    </Button>
  )}
  <Button
    variant="secondary"
    size="sm"
    fullWidth
    data-testid="sync-history-all"
    aria-label="同步所有 Space 的歷史訊息"
    disabled={isSyncing}
    loading={isStartingAllSync}
    onClick={handleSyncAll}
    icon={<RefreshCw size={12} />}
  >
    同步所有 Space 歷史
  </Button>
</div>
```

### SyncProgress 元件（sync 進行中才顯示）

見 `components/SyncProgress/spec.md`。

- 條件渲染：`{syncStatus !== null && <SyncProgress ... />}`
- 同步完成後顯示 toast（popup 內的 toast，3 秒後自動消失）
- `TOAST.syncDone` / `TOAST.syncFailed`

### Pending 訊息連結

```tsx
<div className="border-t border-[--color-border-default] pt-2 mt-1">
  <a
    href="http://localhost:PORT/pending"
    target="_blank"
    rel="noopener noreferrer"
    className="flex items-center gap-2 px-3 py-2 text-sm text-[--color-text-link] hover:bg-[--color-surface-subtle] rounded-md transition-colors duration-150 focus:outline-none focus:ring-1 focus:ring-[--color-border-focus]"
    aria-label="在新分頁開啟 Pending 訊息檢視頁"
  >
    <ExternalLink size={12} aria-hidden="true" />
    Pending 訊息檢視
  </a>
</div>
```

---

## Popup 內 Toast

同步完成或失敗時，在 popup 底部顯示短暫 toast（3 秒）。
使用既有 Toast 元件，定位在 popup 底部 `position: fixed, bottom: 0`。

```tsx
// Popup 最外層容器相對定位
<div className="relative w-[280px] min-h-[...] overflow-hidden">
  {/* ... 主要內容 ... */}

  {/* Popup 內 Toast（z-toast） */}
  {toast && (
    <div
      role="status"
      aria-live="polite"
      className="absolute bottom-0 left-0 right-0 z-[--z-toast] animate-[--animate-slide-up]"
    >
      <Toast variant={toast.variant} message={toast.message} />
    </div>
  )}
</div>
```

---

## Testid 清單

| testid | 元素 | 說明 |
|--------|------|------|
| `sync-history-current` | `<button>` | 同步此 Space 按鈕 |
| `sync-history-all` | `<button>` | 同步所有 Space 按鈕 |
| `sync-progress` | `<div>` | SyncProgress 容器 |
| `sync-progress-status` | `<span>` | 狀態文字 |
| `sync-progress-count` | `<p>` | 計數文字 |
| `sync-progress-badge` | `<span>` | 狀態 badge |

---

## Accessibility

- `sync-history-current` / `sync-history-all`：disabled 時加 `aria-disabled="true"` + `title` tooltip
- SyncProgress：`role="status"` + `aria-live="polite"`（running 時），failed 改 `role="alert"`
- Pending 連結：`aria-label` 說明行為（在新分頁開啟）
- Popup 整體：`<main role="main">` 包裹主要內容

---

## 響應式

Popup 寬度固定 280px（Chrome extension 規格），不需 breakpoint。

---

## 使用的元件

| 元件 | 說明 |
|------|------|
| `Button` | 同步按鈕（secondary, sm, fullWidth） |
| `SyncProgress` | 進度顯示（`components/SyncProgress/spec.md`） |
| `Toast` | popup 內通知 |
| Lucide `RefreshCw` | 同步按鈕圖示 |
| Lucide `ExternalLink` | Pending 連結圖示 |
