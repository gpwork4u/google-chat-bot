# /space-facts/{space_key} 頁（per-space 詳情頁）

## 對應 Feature

#104 F-015-fe2（部分）: per-space 詳情頁

---

## 頁面說明

顯示單一 space 的所有 approved facts，依 5 種 category 分 section。  
提供 edit / delete 操作，以及「重新 mine」和「手動新增」入口。

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
│  │  Team #frontend / Space 事實                                  │   │
│  │  ← 返回設定                                                   │   │
│  │                          [重新 mine 此 space] [新增 fact]     │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌─── Section: 產品 ─────────────────────────────────────────────┐   │
│  │  data-testid="space-facts-section-product"                    │   │
│  │                                                               │   │
│  │  [產品 badge]  Section header                                 │   │
│  │  ──────────────────────────────────────────────────────────   │   │
│  │  [SpaceFactRow]                                               │   │
│  │  [SpaceFactRow]                                               │   │
│  │                                                               │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌─── Section: 我的角色 ──────────────────────────────────────────┐   │
│  │  data-testid="space-facts-section-my-role"                    │   │
│  │  [SpaceFactRow]  ...                                          │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌─── Section: 術語 ──────────────────────────────────────────────┐  │
│  │  data-testid="space-facts-section-glossary"                   │   │
│  │  ...                                                          │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌─── Section: 決議 ──────────────────────────────────────────────┐  │
│  │  data-testid="space-facts-section-pinned-decision"            │   │
│  │  ...                                                          │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌─── Section: 人物 ──────────────────────────────────────────────┐  │
│  │  data-testid="space-facts-section-relation"                   │   │
│  │  ...                                                          │   │
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
│  ← 返回設定                             │
│  Team #frontend  Space 事實             │
│  ─────────────────────────────────────  │
│  [重新 mine 此 space]                   │  ← 全寬 button（mobile）
│  [新增 fact]                            │
│  ─────────────────────────────────────  │
│                                         │
│  [產品 badge]  產品                     │
│  ─────────────────────────────────────  │
│  [SpaceFactRow]                         │
│  [SpaceFactRow]                         │
│                                         │
│  [我的角色 badge]  我的角色              │
│  ─────────────────────────────────────  │
│  ...                                    │
└─────────────────────────────────────────┘
```

---

## 主容器 testid

```html
<main data-testid="space-facts-detail-page">
  ...
</main>
```

---

## Page Header 元件

```tsx
<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
  <div>
    {/* 返回連結 */}
    <a
      href="/settings"
      className="inline-flex items-center gap-1 text-xs text-[--color-text-link] hover:underline mb-1"
    >
      <ChevronLeft size={14} aria-hidden="true" />
      返回設定
    </a>
    <h1 className="text-xl font-semibold text-[--color-text-default]">
      {spaceName}
      <span className="text-base font-normal text-[--color-text-muted] ml-2">
        Space 事實
      </span>
    </h1>
  </div>

  <div className="flex items-center gap-2 flex-wrap">
    {/* 重新 mine */}
    <button
      type="button"
      data-testid="space-facts-mine-again-btn"
      onClick={handleMineAgain}
      disabled={isMining}
      aria-label="重新 mine 此 space"
      className="h-9 px-4 text-sm font-medium inline-flex items-center gap-1.5 border border-[--color-border-default] text-[--color-text-secondary] hover:bg-[--color-surface-muted] rounded-[--radius-sm] focus:outline-none focus:ring-2 focus:ring-[--color-border-focus] disabled:opacity-50 transition-colors duration-150"
    >
      <RefreshCw size={15} aria-hidden="true" />
      重新 mine 此 space
    </button>

    {/* 新增 fact */}
    <button
      type="button"
      data-testid="space-facts-add-btn"
      onClick={() => setShowAddModal(true)}
      aria-label="手動新增 fact"
      className="h-9 px-4 text-sm font-medium inline-flex items-center gap-1.5 text-[--color-text-inverse] bg-[--color-primary-500] hover:bg-[--color-primary-600] rounded-[--radius-sm] focus:outline-none focus:ring-2 focus:ring-[--color-border-focus] transition-colors duration-150"
    >
      <Plus size={15} aria-hidden="true" />
      新增 fact
    </button>
  </div>
</div>
```

---

## Section Header

每個 category section 的標題（5 個 section 各一）：

```tsx
<section data-testid={`space-facts-section-${sectionTestIdSuffix}`}>
  <div className="flex items-center gap-2 mb-3">
    <CategoryBadge category={category} size="md" />
    <span className="text-sm font-semibold text-[--color-text-default]">
      {categoryLabel}
    </span>
    <span className="text-xs text-[--color-text-muted]">
      {count} 筆
    </span>
  </div>
  <div className="space-y-3">
    {/* SpaceFactRow × N */}
  </div>
</section>
```

Section testid suffix 對應：

| category | testid suffix |
|----------|--------------|
| `product` | `product` |
| `my-role` | `my-role` |
| `glossary` | `glossary` |
| `pinned-decision` | `pinned-decision` |
| `relation` | `relation` |

---

## SpaceFactRow（approved fact row）

testid: `space-facts-row`（`<article>`），附 `data-fact-id`

```
┌──────────────────────────────────────────────────────────────────┐
│  [公開 ▼]                               [編輯]  [刪除]           │
│  ──────────────────────────────────────────────────────────────  │
│  這個 space 使用 **Go** 作為後端語言，API 框架選用 Gin...          │
└──────────────────────────────────────────────────────────────────┘
```

```tsx
<article
  data-testid="space-facts-row"
  data-fact-id={fact.id}
  className="border border-[--color-border-default] rounded-[--radius-md] bg-[--color-surface-default] p-4 hover:border-[--color-border-strong] transition-colors duration-150"
>
  <div className="flex items-center justify-between gap-2 mb-3">
    <VisibilitySelect
      value={fact.visibility}
      onChange={(v) => handlePatch(fact.id, { visibility: v })}
      disabled={isEditing || isPatching}
    />
    <div className="flex items-center gap-2">
      {/* 編輯按鈕 */}
      <button
        type="button"
        aria-label="編輯此 fact"
        onClick={handleEditClick}
        className="h-7 px-3 text-xs font-medium text-[--color-text-secondary] border border-[--color-border-default] hover:bg-[--color-surface-muted] rounded-[--radius-sm] focus:outline-none focus:ring-2 focus:ring-[--color-border-focus] transition-colors duration-150"
      >
        編輯
      </button>
      {/* 刪除按鈕 */}
      <button
        type="button"
        aria-label="刪除此 fact"
        onClick={handleDeleteClick}
        className="h-7 px-3 text-xs font-medium text-[--color-error-default] border border-[--color-error-default]/40 hover:bg-[--color-error-subtle] rounded-[--radius-sm] focus:outline-none focus:ring-2 focus:ring-[--color-error-default] transition-colors duration-150"
      >
        刪除
      </button>
    </div>
  </div>

  {/* Content（InlineEditableContent） */}
  <InlineEditableContent
    value={fact.content}
    isEditing={isEditing}
    onSave={handleSave}
    onCancel={handleCancelEdit}
    isSaving={isSaving}
    data-testid="candidate-fact-content"  // 沿用同一個 testid（InlineEditableContent 規格）
  />
</article>
```

---

## Empty State

當整個頁面無 approved facts：

```tsx
<div
  data-testid="space-facts-empty-state"
  className="flex flex-col items-center justify-center py-20 gap-3"
>
  <Database size={40} className="text-[--color-text-muted]" aria-hidden="true" />
  <p className="text-sm font-medium text-[--color-text-default]">
    此 space 尚無 facts
  </p>
  <p className="text-sm text-[--color-text-muted] text-center max-w-xs">
    點擊「重新 mine 此 space」讓 AI 從歷史訊息萃取 context，或手動新增。
  </p>
</div>
```

---

## 頁面狀態

| 狀態 | 顯示 |
|------|------|
| `loading` | Section skeleton × 2 + SpaceFactRow skeleton × 3 |
| `empty` | `space-facts-empty-state` |
| `loaded` | 5 個 category section（無 facts 的 section 不顯示） |
| `error` | error banner + 重試 |

---

## Mine Again 行為

1. 點擊 `space-facts-mine-again-btn`
2. POST `/api/space-facts/mining-queue { space_key }`
3. 成功 → toast `TOAST.miningEnqueued`（「已加入 mining queue」）
4. 已在跑 → toast `TOAST.miningAlreadyRunning`（「Mining 已在進行中」）
5. 按鈕 loading 狀態 200ms 後解除（不等 mining 完成）

---

## 使用的元件

| 元件 | 說明 |
|------|------|
| `CategoryBadge` | Section header 的分類 badge |
| `VisibilitySelect` | 每列 fact 的 visibility select |
| `InlineEditableContent` | 每列 fact 的 content 顯示 / 編輯 |
| `ConfirmDialog` | Delete fact 確認 |
| `AddFactModal` | 手動新增 fact |
| `Toast` | 操作結果通知 |

---

## 頁面 Spacing

- 最大寬度：`max-w-3xl mx-auto`
- 頁面 padding：`px-4 sm:px-6 pt-4 pb-16`
- Section 間距：`space-y-8`
- Section 內 rows 間距：`space-y-3`

---

## 響應式行為

| 斷點 | 行為 |
|------|------|
| `>= 640px` | Page Header 按鈕水平排列 |
| `< 640px` | 按鈕換行（`flex-wrap`）或各自全寬 |

---

## 鍵盤導航

- Tab：在各 section 和元素間移動
- Enter：觸發聚焦按鈕
- Escape：取消行內編輯 / 關閉 Modal / 關閉 ConfirmDialog
