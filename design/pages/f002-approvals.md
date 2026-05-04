# F-002: Approval Queue 頁 — 頁面規格

## 對應 Feature
Issue #(F-002) F-002: Approval Queue 頁

## 對應 Scenarios（f002-approval-queue.feature）

| Scenario                     | 設計元素                                      |
|------------------------------|-----------------------------------------------|
| 載入 pending drafts           | Draft list + skeleton loading                 |
| 直接 Approve 送出             | ApprovalCard → approving → done → toast       |
| 編輯後 Approve                | Textarea 編輯 + Approve                       |
| Reject 丟棄                   | ApprovalCard → done → toast                   |
| 新 draft 即時加入             | WS event → prepend to list                   |
| 他端送出後自動移除            | WS event → remove from list                  |
| j/k 移動焦點                  | ApprovalCard isFocused highlight              |
| Enter/e/x 快捷                | ApprovalCard keyboard shortcuts              |
| 空狀態                        | EmptyState 元件                               |
| API 失敗                      | ErrorState 元件 + retry                       |
| Categorize 標籤              | Badge variant per category                   |

---

## 頁面 Wireframe

### 正常狀態（有 pending drafts）

```
┌──────────────────────────────────────────────────────────┐
│  [Navbar]                                                │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  max-w-3xl mx-auto px-4 py-4                             │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ [Page Header]                                      │  │
│  │  Approvals                    3 個待處理            │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │  ← ApprovalCard #1（focused）
│  │ ●  Team #engineering         [工程]  [▼]            │  │    左側 2px 藍色 border-l
│  │    Alice · 3 分鐘前                                 │  │
│  │    ─────────────────────────────────────────────── │  │
│  │    ┌───────────────────────────────────────────┐   │  │
│  │    │ 好的，我看看那個 PR 的 review 意見。       │   │  │
│  │    └───────────────────────────────────────────┘   │  │
│  │    [debug ▶]                                        │  │
│  │    [✓ Approve] [⊙ Edit Saved] [✕ Reject]  [j↓][k↑][↵][e][x] │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │  ← ApprovalCard #2
│  │    Team #general             [閒聊]  [▼]            │  │
│  │    Bob · 12 分鐘前                                  │  │
│  │    ─────────────────────────────────────────────── │  │
│  │    ┌───────────────────────────────────────────┐   │  │
│  │    │ 哈哈好啊，我們下週約一下！                 │   │  │
│  │    └───────────────────────────────────────────┘   │  │
│  │    [debug ▶]                                        │  │
│  │    [✓ Approve] [⊙ Edit Saved] [✕ Reject]            │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │  ← ApprovalCard #3
│  │    ...                                              │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 空狀態（Inbox zero）

```
┌──────────────────────────────────────────────────────────┐
│  [Navbar]                                                │
├──────────────────────────────────────────────────────────┤
│                                                          │
│          ┌────────────────────────────────┐              │
│          │                                │              │
│          │     [CheckCheck icon, 40px]    │              │  ← Lucide CheckCheck，text-neutral-300
│          │                                │              │
│          │       Inbox zero               │              │  ← text-base font-medium text-text-muted
│          │    沒有待處理的草稿             │              │  ← text-sm text-text-muted
│          │                                │              │
│          └────────────────────────────────┘              │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 錯誤狀態

```
┌──────────────────────────────────────────────────────────┐
│  [Navbar]                                                │
├──────────────────────────────────────────────────────────┤
│                                                          │
│          ┌────────────────────────────────┐              │
│          │                                │              │
│          │   [AlertTriangle icon, 32px]   │              │  ← text-error-default
│          │                                │              │
│          │    載入失敗                     │              │  ← text-base font-medium
│          │    無法取得草稿列表             │              │  ← text-sm text-text-muted
│          │                                │              │
│          │    [↺ 重試]                     │              │  ← Button variant="secondary"
│          │                                │              │
│          └────────────────────────────────┘              │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Loading 狀態（初始載入）

```
┌──────────────────────────────────────────────────────────┐
│  [Navbar]                                                │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │  ← Skeleton card
│  │  ████████████████   ██████████   ▓▓▓▓              │  │    animate-pulse
│  │  ████████          ─────────────────               │  │    bg-neutral-200
│  │  ████████████████████████████                      │  │
│  │  ████████████████████████████████████              │  │
│  │                                                    │  │
│  │  ██████   ██████████   ████████                    │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │  ← Skeleton card
│  │  ████████████████   ██████████   ▓▓▓▓              │  │
│  │  ████████                                          │  │
│  │  ████████████████████████████████████████████████  │  │
│  │                                                    │  │
│  │  ██████   ██████████   ████████                    │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## Page Header

```tsx
<header className="flex items-baseline justify-between mb-4">
  <h1 className="text-lg font-semibold text-[--color-text-default]">
    Approvals
  </h1>
  {drafts.length > 0 && (
    <span className="text-xs text-[--color-text-muted]">
      {drafts.length} 個待處理
    </span>
  )}
</header>
```

---

## 鍵盤快捷鍵邏輯（ApprovalsPage 管理）

```tsx
// 以下邏輯由 ApprovalsPage 管理，不在 ApprovalCard 內
// （卡片只接受 isFocused prop，操作 callback 由 Page 執行）

useEffect(() => {
  function handleKeyDown(e: KeyboardEvent) {
    // 若焦點在 textarea 內，e/Enter 不觸發快捷
    const inTextarea = (e.target as HTMLElement).tagName === 'TEXTAREA'

    switch (e.key) {
      case 'j':
        if (!inTextarea) {
          e.preventDefault()
          setFocusedIndex(i => Math.min(i + 1, drafts.length - 1))
        }
        break
      case 'k':
        if (!inTextarea) {
          e.preventDefault()
          setFocusedIndex(i => Math.max(i - 1, 0))
        }
        break
      case 'Enter':
        if (!inTextarea) {
          e.preventDefault()
          handleApprove(drafts[focusedIndex].id, editedContent[drafts[focusedIndex].id])
        }
        break
      case 'e':
        if (!inTextarea) {
          e.preventDefault()
          focusTextarea(focusedIndex)  // 讓 textarea 取得 focus
        }
        break
      case 'x':
        if (!inTextarea) {
          e.preventDefault()
          handleReject(drafts[focusedIndex].id)
        }
        break
      case 'Escape':
        // textarea 失去 focus
        blurTextarea(focusedIndex)
        break
    }
  }
  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}, [drafts, focusedIndex, editedContent])
```

---

## Skeleton Card 元件

```tsx
// SkeletonCard（loading state 佔位）
function SkeletonCard() {
  return (
    <div className="rounded-md border border-[--color-border-default] px-4 py-3 animate-pulse">
      <div className="flex items-start justify-between mb-2">
        <div className="flex flex-col gap-1.5">
          <div className="h-3.5 w-32 bg-[--color-neutral-200] rounded" />
          <div className="h-2.5 w-20 bg-[--color-neutral-200] rounded" />
        </div>
        <div className="h-5 w-12 bg-[--color-neutral-200] rounded-xs" />
      </div>
      <div className="h-[72px] bg-[--color-neutral-200] rounded-sm mb-3" />
      <div className="flex gap-2">
        <div className="h-7 w-20 bg-[--color-neutral-200] rounded-sm" />
        <div className="h-7 w-24 bg-[--color-neutral-200] rounded-sm" />
        <div className="h-7 w-16 bg-[--color-neutral-200] rounded-sm" />
      </div>
    </div>
  )
}
```

---

## EmptyState 元件

```tsx
function EmptyState() {
  return (
    <div
      role="status"
      aria-label="沒有待處理的草稿"
      className="flex flex-col items-center justify-center py-20 text-center"
    >
      <CheckCheck
        size={40}
        className="text-[--color-neutral-300] mb-4"
        aria-hidden="true"
      />
      <p className="text-base font-medium text-[--color-text-muted] mb-1">
        Inbox zero
      </p>
      <p className="text-sm text-[--color-text-muted]">
        沒有待處理的草稿
      </p>
    </div>
  )
}
```

---

## ErrorState 元件

```tsx
function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center py-20 text-center"
    >
      <AlertTriangle
        size={32}
        className="text-[--color-error-default] mb-4"
        aria-hidden="true"
      />
      <p className="text-base font-medium text-[--color-text-default] mb-1">
        載入失敗
      </p>
      <p className="text-sm text-[--color-text-muted] mb-6">
        無法取得草稿列表
      </p>
      <Button
        variant="secondary"
        icon={<RefreshCw size={14} />}
        onClick={onRetry}
        aria-label="重新載入草稿列表"
      >
        重試
      </Button>
    </div>
  )
}
```

---

## 使用的元件

| 元件           | Spec                                         |
|----------------|----------------------------------------------|
| Layout / Navbar | `components/Layout.md`                      |
| ApprovalCard   | `components/ApprovalCard.md`                 |
| Button         | `components/Button.md`                       |
| Badge          | `components/Badge.md`                        |
| Toast          | `components/Toast.md`                        |

---

## 圖示清單

| 用途         | Lucide Icon       |
|--------------|-------------------|
| Inbox zero   | `<CheckCheck />`  |
| 載入失敗     | `<AlertTriangle />`|
| 重試         | `<RefreshCw />`   |
| Approve      | `<Check />`       |
| Edit Saved   | `<Save />`        |
| Reject       | `<X />`           |
| Context 展開 | `<ChevronDown />` |
| Debug 展開   | `<ChevronRight />`|
