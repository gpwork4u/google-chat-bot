# Pending Viewer 頁（/pending）

## 對應 Feature

#86 F-013-fe1: Pending viewer 頁
Issue #89 Sprint 6 UI Design

---

## Layout（沿用既有 Layout：Navbar + main area）

### 桌面（>= 768px）

```
┌──────────────────────────────────────────────────────────────┐
│  Navbar（48px）                            [ConnectionBadge]  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  max-w-4xl mx-auto px-4 pt-4 pb-16                          │
│                                                              │
│  ┌─── Page Header ────────────────────────────────────────┐  │
│  │  Pending 訊息                               12 筆       │  │  ← 右側顯示目前 tab count
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─── Tab Bar ─────────────────────────────────────────────┐ │
│  │  [Pending (12)]  [Skipped (5)]  [Drafted (3)]           │ │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─── PendingFilterBar（sticky top-[48px]）───────────────┐  │
│  │  [Space ▼]  [發話人...]  [關鍵字...]  [ ] 只看 @我      │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─── Message List ───────────────────────────────────────┐  │
│  │  [MessageRow]                                          │  │
│  │  [MessageRow]                                          │  │
│  │  [MessageRow]                                          │  │
│  │  ...                                                   │  │
│  │                                                        │  │
│  │  [載入更多]（有 next_offset 時顯示）                    │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Mobile（< 768px）

```
┌────────────────────────────────────────┐
│  Navbar                  [Connection]  │
├────────────────────────────────────────┤
│  Pending 訊息                    12 筆 │
│  ─────────────────────────────────── │
│  [Pending (12)][Skipped (5)][Draft(3)]│  ← Tab bar 佔滿寬度
│  ─────────────────────────────────── │
│  [FilterBar — 兩行]                   │
│  ─────────────────────────────────── │
│  [MessageRow]                         │
│  [MessageRow]                         │
│  ...                                  │
│  [載入更多]                            │
└────────────────────────────────────────┘
```

---

## Tab Bar 規格

- 容器：`<div role="tablist" aria-label="訊息狀態分類">`
- 各 Tab：`<button role="tab" aria-selected={isActive} aria-controls="panel-{tab}" data-testid="pending-tab-{tab}">`
- Tab 內容：`{Label} ({count})`（count 每次 API response 更新）

| Tab | data-testid | aria-controls |
|-----|-------------|---------------|
| Pending | `pending-tab-pending` | `panel-pending` |
| Skipped | `pending-tab-skipped` | `panel-skipped` |
| Drafted | `pending-tab-drafted` | `panel-drafted` |

### Tab 樣式

```tsx
// Active tab
const activeTabClasses = [
  "flex items-center gap-1.5 px-4 py-2.5",
  "text-sm font-medium",
  "text-[--color-primary-600]",
  "border-b-2 border-[--color-primary-500]",
  "focus:outline-none focus:ring-2 focus:ring-[--color-border-focus] focus:ring-inset",
].join(" ");

// Inactive tab
const inactiveTabClasses = [
  "flex items-center gap-1.5 px-4 py-2.5",
  "text-sm text-[--color-text-secondary]",
  "border-b-2 border-transparent",
  "hover:text-[--color-text-default] hover:border-[--color-border-strong]",
  "transition-colors duration-150",
  "focus:outline-none focus:ring-2 focus:ring-[--color-border-focus] focus:ring-inset",
].join(" ");

// Count badge（inline，非獨立元件）
const countClasses = "text-xs text-[--color-text-muted] ml-0.5";
```

### Tab keyboard 行為

- `Left / Right Arrow`：在 tab 間移動焦點
- `Enter / Space`：啟用當前聚焦的 tab
- `Tab`：跳出 tablist，進入下方 panel

---

## 頁面狀態（State Machine）

| 狀態 | 描述 | 顯示方式 |
|------|------|---------|
| `loading` | 初始載入（GET /api/claude/pending） | Skeleton rows × 3（animate-pulse） |
| `loaded` | 資料正常 | MessageRow 列表 |
| `empty` | 目前 tab 沒有任何訊息 | EmptyState 元件 |
| `error` | API 失敗 | ErrorBanner + retry 按鈕 |
| `load-more` | 點「載入更多」時 | 按鈕 loading，新 rows append |

---

## Empty State（pending-empty-state）

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│               [CheckCheck icon, 40px]                │  ← text-neutral-300
│                                                      │
│          目前沒有等待處理的訊息 🎉                    │  ← text-base font-medium text-text-muted
│          所有訊息都已處理完畢                         │  ← text-sm text-text-muted
│                                                      │
└──────────────────────────────────────────────────────┘
```

注意：「目前沒有等待處理的訊息 🎉」文字對應 `TOAST.pendingEmpty` UX text key（此處非 toast，是頁面內顯示）。

```tsx
<div
  role="status"
  aria-label="目前沒有等待處理的訊息"
  data-testid="pending-empty-state"
  className="flex flex-col items-center justify-center py-20 text-center"
>
  <CheckCheck
    size={40}
    className="text-[--color-neutral-300] mb-4"
    aria-hidden="true"
  />
  <p className="text-base font-medium text-[--color-text-muted] mb-1">
    目前沒有等待處理的訊息 🎉
  </p>
  <p className="text-sm text-[--color-text-muted]">
    所有訊息都已處理完畢
  </p>
</div>
```

Skipped / Drafted tab 為空時：
- Skipped empty：`沒有已略過的訊息` / `CheckSquare` icon
- Drafted empty：`沒有草稿中的訊息` / `FileText` icon

---

## Error State

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│          [AlertTriangle icon, 32px]                  │  ← text-error-default
│                                                      │
│          載入失敗                                     │  ← text-base font-medium
│          無法取得訊息列表                             │  ← text-sm text-text-muted
│                                                      │
│          [↺ 重試]                                    │  ← Button variant="secondary"
│                                                      │
└──────────────────────────────────────────────────────┘
```

```tsx
<div role="alert" className="flex flex-col items-center justify-center py-20 text-center">
  <AlertTriangle size={32} className="text-[--color-error-default] mb-4" aria-hidden="true" />
  <p className="text-base font-medium text-[--color-text-default] mb-1">載入失敗</p>
  <p className="text-sm text-[--color-text-muted] mb-6">無法取得訊息列表</p>
  <Button variant="secondary" icon={<RefreshCw size={14} />} onClick={onRetry} aria-label="重新載入訊息列表">
    重試
  </Button>
</div>
```

---

## Skeleton Loading State

```tsx
function MessageRowSkeleton() {
  return (
    <div className="flex flex-col gap-2 px-4 py-3 border-b border-[--color-border-default] animate-pulse">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-5 w-20 bg-[--color-neutral-200] rounded-xs" />  {/* space badge */}
          <div className="h-4 w-16 bg-[--color-neutral-200] rounded" />     {/* sender */}
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-12 bg-[--color-neutral-200] rounded" />     {/* time */}
          <div className="h-7 w-14 bg-[--color-neutral-200] rounded-sm" /> {/* button */}
        </div>
      </div>
      <div className="h-3 w-48 bg-[--color-neutral-200] rounded hidden md:block" /> {/* msg id */}
      <div className="space-y-1.5">
        <div className="h-4 bg-[--color-neutral-200] rounded w-full" />
        <div className="h-4 bg-[--color-neutral-200] rounded w-3/4" />
      </div>
    </div>
  );
}
```

---

## 載入更多（Load More）

```tsx
{hasMore && (
  <div className="flex justify-center py-4">
    <Button
      variant="secondary"
      size="sm"
      loading={isLoadingMore}
      onClick={handleLoadMore}
      data-testid="pending-load-more"
    >
      載入更多
    </Button>
  </div>
)}
```

---

## WS Live Update 行為

- Subscribe `pending_changed` event
- 收到後：呼叫 SWR `mutate()`（revalidate），不顯示通知
- Debounce：client 端不需額外 debounce（server 端已 debounce 200ms）
- 若 pending_changed.reason === 'new_message'：新 row 從列表頂部插入（slide-down animation）
- 若 pending_changed.reason === 'skipped' / 'drafted'：對應 row fade-out 後移除

---

## Keyboard 行為（頁面層級）

| 按鍵 | 行為 |
|------|------|
| `Tab` | 一般 tab focus 順序：tab bar → filter bar → message rows → load more |
| `Arrow Left / Right` | 在 tab bar 內切換 tab（tablist keyboard pattern） |
| `Escape` | 關閉任何展開的 SkipReasonMenu |

---

## 頁面 Spacing

- 最大寬度：`max-w-4xl mx-auto`
- 頁面 padding：`px-4`，`pt-4 pb-16`
- Tab bar 底部有 border-b（分隔 filter bar）
- Filter bar 為 sticky（top: 48px = Navbar 高度）
- Message list：無額外 padding（row 自有 px-4 py-3）

---

## 使用的元件

| 元件 | Spec |
|------|------|
| Navbar | `components/Layout.md` |
| PendingFilterBar | `components/PendingFilterBar/spec.md` |
| MessageRow | `components/MessageRow/spec.md` |
| SkipReasonMenu | `components/SkipReasonMenu/spec.md` |
| Button | `components/Button.md` |
| Badge | `components/Badge.md` |
| Toast | `components/Toast/spec.md` |

---

## 圖示清單

| 用途 | Lucide Icon |
|------|------------|
| Pending empty state | `<CheckCheck />` |
| Skipped empty | `<CheckSquare />` |
| Drafted empty | `<FileText />` |
| 載入失敗 | `<AlertTriangle />` |
| 重試 | `<RefreshCw />` |
| 展開 body | `<ChevronDown />` |（若用 icon，非文字） |

---

## DOM Testid 清單

（供 frontend engineer 加進 `specs/contracts/dom.md`）

| testid | 元素 | 說明 |
|--------|------|------|
| `pending-tab-pending` | `<button role="tab">` | 切到 Pending tab |
| `pending-tab-skipped` | `<button role="tab">` | 切到 Skipped tab |
| `pending-tab-drafted` | `<button role="tab">` | 切到 Drafted tab |
| `pending-row` | `<article>` | 每筆訊息 row，附 `data-message-id` |
| `pending-skip-btn` | `<button>` | Skip 按鈕 |
| `pending-unskip-btn` | `<button>` | Unskip 按鈕 |
| `pending-skip-reason-menu` | `<div role="dialog">` | Skip reason popover |
| `pending-skip-reason-option` | `<button>` | Reason 選項，附 `data-reason` |
| `space-filter` | `<select>` | Space 篩選（沿用既有命名） |
| `sender-filter` | `<input>` | Sender 篩選 |
| `body-filter` | `<input>` | Body 篩選 |
| `mentioned-filter` | `<input type=checkbox>` | Mentioned only |
| `pending-load-more` | `<button>` | 載入更多 |
| `pending-empty-state` | `<div>` | 空狀態容器 |
| `pending-row-expand` | `<button>` | 展開 body 全文 |
