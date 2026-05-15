# /space-facts/candidates 頁

## 對應 Feature

#102 F-015-fe1: Space facts candidates 頁

---

## 頁面說明

列出所有 status=candidate 的 facts，按 space 分組。  
使用者可逐筆 approve / edit / reject，或對整個 space 批次操作。

---

## Layout（桌面 >= 768px）

```
┌──────────────────────────────────────────────────────────────────────┐
│  Navbar（48px）                                    [ConnectionBadge]  │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  max-w-3xl mx-auto px-4 pt-4 pb-16                                  │
│                                                                      │
│  ┌─── Page Header ───────────────────────────────────────────────┐   │
│  │  Space Facts 待審核              [總數 badge：12 筆待審核]     │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌─── Space Group: Team #frontend ───────────────────────────────┐   │
│  │                                                                │   │
│  │  Space Group Header:                                          │   │
│  │  Team #frontend   [3 筆]   [Approve all]  [Reject all]        │   │
│  │  ──────────────────────────────────────────────────────────   │   │
│  │                                                                │   │
│  │  [CandidateFactRow — fact 1]                                  │   │
│  │  [CandidateFactRow — fact 2]                                  │   │
│  │  [CandidateFactRow — fact 3]                                  │   │
│  │                                                                │   │
│  └────────────────────────────────────────────────────────────── ┘   │
│                                                                      │
│  ┌─── Space Group: Project Alpha ────────────────────────────────┐   │
│  │  ...                                                           │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Layout（Mobile < 640px）

```
┌─────────────────────────────────────────┐
│  Navbar              [ConnectionBadge]  │
├─────────────────────────────────────────┤
│  Space Facts 待審核             12 筆   │
│  ─────────────────────────────────────  │
│                                         │
│  ┌── Team #frontend ─────────────────┐  │
│  │  3 筆                             │  │
│  │  [Approve all] [Reject all]       │  │  ← 兩個 batch btn 並排
│  │                                   │  │
│  │  [CandidateFactRow]               │  │  ← 全寬卡片
│  │  [CandidateFactRow]               │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌── Project Alpha ───────────────────┐ │
│  │  ...                              │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

---

## 主容器 testid

```html
<main data-testid="space-facts-candidates-page">
  ...
</main>
```

---

## Space Group Header

每個 space 的分組標題列，包含批次操作按鈕。

```tsx
<div className="flex items-center justify-between mb-3">
  <div className="flex items-center gap-2">
    <h2 className="text-sm font-semibold text-[--color-text-default]">
      {spaceName}
    </h2>
    <span className="text-xs text-[--color-text-muted]">
      {count} 筆
    </span>
  </div>
  <div className="flex items-center gap-2">
    {/* Batch Approve */}
    <button
      type="button"
      data-testid="space-facts-batch-approve"
      onClick={handleBatchApprove}
      disabled={isBatchProcessing}
      aria-label={`Approve all ${count} facts in ${spaceName}`}
      className="h-7 px-3 text-xs font-medium text-[--color-text-inverse] bg-[--color-primary-500] hover:bg-[--color-primary-600] rounded-[--radius-sm] focus:outline-none focus:ring-2 focus:ring-[--color-border-focus] disabled:opacity-50 transition-colors duration-150"
    >
      {isBatchApproving
        ? <Loader2 size={12} className="animate-spin mr-1" />
        : null}
      Approve all in space
    </button>

    {/* Batch Reject */}
    <button
      type="button"
      data-testid="space-facts-batch-reject"
      onClick={handleBatchRejectClick}
      disabled={isBatchProcessing}
      aria-label={`Reject all ${count} facts in ${spaceName}`}
      className="h-7 px-3 text-xs font-medium text-[--color-text-inverse] bg-[--color-error-default] hover:bg-[--color-error-strong] rounded-[--radius-sm] focus:outline-none focus:ring-2 focus:ring-[--color-error-default] disabled:opacity-50 transition-colors duration-150"
    >
      Reject all in space
    </button>
  </div>
</div>
```

> `space-facts-batch-approve` 與 `space-facts-batch-reject` 這對 testid 每個 space group 各出現一次。  
> QA test 會用 `within(spaceGroupEl)` 取得各自的 button。

---

## 頁面狀態

| 狀態 | 顯示 |
|------|------|
| `loading` | Page Header skeleton + 2 個 Space Group skeleton（每組 3 列 CandidateFactRow skeleton） |
| `empty`（無候選）| `data-testid="space-facts-empty-state"` — 置中圖示 + 「目前沒有待審核的 fact」 |
| `loaded` | 正常顯示各 space group |
| `error`（API 失敗）| error banner + 重試按鈕 |

### Empty State

```tsx
<div
  data-testid="space-facts-empty-state"
  className="flex flex-col items-center justify-center py-16 gap-3"
>
  <CheckCircle size={40} className="text-[--color-success-default]" aria-hidden="true" />
  <p className="text-sm font-medium text-[--color-text-default]">太棒了！</p>
  <p className="text-sm text-[--color-text-muted]">目前沒有待審核的 fact</p>
</div>
```

---

## 使用的元件

| 元件 | 說明 |
|------|------|
| `CandidateFactRow` | 每筆 candidate 列 |
| `ConfirmDialog` | Reject / Batch reject 確認 |
| `Toast` | 操作結果通知 |

---

## Batch Approve 行為

SWR optimistic update（見 `specs/tech-survey-sprint-7.md` §3）：
1. 取得該 space 所有 candidate fact ids
2. Optimistic：立即從 UI 移除
3. `Promise.allSettled` 平行打 POST `/api/space-facts/{id}/approve`
4. Revalidate（true）
5. Toast：`TOAST.batchApproveDone`（「已核准 {N} 條 fact」）

Batch Reject 需先顯示 `ConfirmDialog` 確認後才批次執行。

---

## 響應式行為

| 斷點 | 行為 |
|------|------|
| `>= 768px` | Space Group Header 水平排列（name + batch btns） |
| `< 640px` | Batch btns 換行（`flex-wrap`），或縮短 label |

---

## 頁面 Spacing

- 最大寬度：`max-w-3xl mx-auto`
- 頁面 padding：`px-4 sm:px-6 pt-4 pb-16`
- Space group 間距：`space-y-8`
- Space group 內 fact rows 間距：`space-y-3`

---

## 鍵盤導航

- Tab：在頁面元素間移動
- 在 CandidateFactRow 內：Tab 切換 category badge / visibility select / source toggle / action btns
- Enter：觸發聚焦按鈕
- Escape：取消編輯 / 關閉 ConfirmDialog
