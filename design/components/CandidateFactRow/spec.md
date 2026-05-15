# CandidateFactRow

## 用途

`/space-facts/candidates` 頁面的核心列元件。每列代表一筆待審核的 candidate fact。  
支援：顯示 / 行內編輯 / approve / reject / 展開來源訊息。

testid: `candidate-fact-row`（element: `<article>`），附 `data-fact-id` attribute

---

## 子元件 testids（對齊 `specs/contracts/dom.md` Sprint 7）

| testid | element | 說明 |
|--------|---------|------|
| `candidate-fact-row` | `<article>` | 列容器，附 `data-fact-id` |
| `candidate-fact-content` | `<div>` / `<textarea>` | content 顯示 / 編輯區 |
| `candidate-fact-category` | `<span>` | CategoryBadge |
| `candidate-fact-visibility-select` | `<select>` | VisibilitySelect |
| `candidate-fact-source-toggle` | `<button>` | source 展開 button |
| `candidate-fact-source-list` | `<ul>` | source messages 列表 |
| `candidate-fact-approve-btn` | `<button>` | 核准 |
| `candidate-fact-edit-btn` | `<button>` | 進入編輯模式 |
| `candidate-fact-reject-btn` | `<button>` | 拒絕（觸發 ConfirmDialog） |
| `candidate-fact-save-btn` | `<button>` | 編輯模式 → 儲存 |
| `candidate-fact-cancel-btn` | `<button>` | 編輯模式 → 取消 |

---

## Props

| Prop | Type | Required | 說明 |
|------|------|----------|------|
| `fact` | `CandidateFact` | 是 | fact 資料（見型別定義） |
| `onApprove` | `(id: string) => Promise<void>` | 是 | approve callback |
| `onReject` | `(id: string) => Promise<void>` | 是 | reject callback（confirm 確認後呼叫） |
| `onPatch` | `(id: string, patch: Partial<FactPatch>) => Promise<void>` | 是 | 編輯儲存 + visibility change callback |

### 型別定義

```ts
type Category = "product" | "my-role" | "glossary" | "pinned-decision" | "relation";
type Visibility = "public" | "private" | "secret";

interface CandidateFact {
  id: string;
  space_key: string;
  category: Category;
  content: string;        // markdown
  visibility: Visibility;
  source_message_ids: number[];
  created_at: string;     // ISO 8601
}

interface FactPatch {
  content?: string;
  visibility?: Visibility;
  category?: Category;
}
```

---

## 版面規格

### 顯示模式（非編輯）

```
┌───────────────────────────────────────────────────────────────┐
│ [產品 badge]                            [公開 ▼]              │  ← 頂列：category + visibility
│ ─────────────────────────────────────────────────────────── │
│  這個 space 使用 **Go** 作為後端語言，API 框架選用 Gin...      │  ← content（markdown）
│                                                               │
│  [▶ 來源訊息（3 則）]                                         │  ← source toggle
│ ─────────────────────────────────────────────────────────── │
│  [核准]   [編輯]   [拒絕]                                     │  ← action buttons
└───────────────────────────────────────────────────────────────┘
```

### 編輯模式（isEditing = true）

```
┌───────────────────────────────────────────────────────────────┐
│ [產品 ▼ select]                         [公開 ▼]              │  ← category 也變成 select
│ ─────────────────────────────────────────────────────────── │
│  ┌───────────────────────────────────────────────────────┐   │
│  │ <textarea>                                            │   │
│  │  這個 space 使用 Go 作為後端語言...                    │   │
│  └───────────────────────────────────────────────────────┘   │
│                                        [儲存]  [取消]        │
└───────────────────────────────────────────────────────────────┘
```

---

## States

### Row-level States

| State | 描述 | 視覺 |
|-------|------|------|
| `idle` | 預設，可互動 | 正常外觀 |
| `editing` | 行內編輯中 | textarea 顯示，action btns 換成 save/cancel |
| `approving` | Approve API 進行中 | approve btn loading，其他 btn disabled，row `opacity-75` |
| `saving` | PATCH API 進行中 | save btn loading，cancel disabled |
| `rejecting` | ConfirmDialog 開啟 | 等待 user 確認 |
| `reject-loading` | Reject API 進行中 | ConfirmDialog confirm btn loading |
| `done` | approve/reject 完成 | `opacity-0 scale-95 -translate-y-1` → unmount（200ms） |
| `error` | API 失敗 | 父元件 toast，row 回到 idle |

---

## 樣式規格

### 卡片外框

```css
position: relative;
border: 1px solid var(--color-border-default);
border-radius: var(--radius-md);
background: var(--color-surface-default);
padding: var(--spacing-4);   /* 16px */
transition: opacity 200ms ease, transform 200ms ease;
```

hover 時：`hover:border-[--color-border-strong]`  
`approving` 時：`opacity-75`  
`done` 時：`opacity-0 -translate-y-1 scale-95`（transition 後 unmount）

### 頂列 layout

```css
display: flex;
align-items: center;
justify-content: space-between;
gap: var(--spacing-2);
margin-bottom: var(--spacing-3);
```

### Category select（編輯模式）

與 VisibilitySelect 同樣樣式，height `h-8`，options 為 5 種 category。

### Action Buttons

按鈕列：`flex items-center gap-2 mt-3`

| Button | testid | Variant | Size | 文字（`BUTTON.*`） |
|--------|--------|---------|------|------------------|
| Approve | `candidate-fact-approve-btn` | `primary` | `sm` | `核准` |
| Edit | `candidate-fact-edit-btn` | `secondary` | `sm` | `編輯` |
| Reject | `candidate-fact-reject-btn` | `danger` | `sm` | `拒絕` |

Button `sm` 規格：`h-7 px-3 text-xs font-medium`（最小觸控 target 由 padding 補足，row 夠寬）

---

## Accessibility

- `<article role="article" aria-label="fact：{category} - {content 前 30 字}">` + `data-fact-id`
- Approve btn：`aria-label="核准此 fact"`，`aria-busy` 在 approving 時
- Edit btn：`aria-label="編輯此 fact"`
- Reject btn：`aria-label="拒絕此 fact"`
- 編輯模式下：focus 自動移到 textarea
- Keyboard：Tab 在卡片內各元素間移動；Escape 取消編輯

---

## 動畫

- 進場：`animate-[--animate-slide-up]`（卡片 mount 時）
- 離場（done）：`transition-all duration-200 opacity-0 -translate-y-1 scale-95` → setTimeout unmount
- 狀態切換：`transition-opacity duration-150`

---

## Visibility 快速更改

VisibilitySelect `onChange` 直接觸發 `onPatch({ visibility: newVal })`，不需進入編輯模式。  
成功後 toast `TOAST.factEdited`。

---

## 使用範例

見 `example.tsx`
