# ProfileFactItem

## 用途

`/settings` 頁 Profile section 中的單筆事實記錄元件。每一列顯示一個 key-value pair 以及其 visibility 和操作按鈕（編輯/刪除）。

---

## 版面

```
┌─────────────────────────────────────────────────────────────────┐
│  我都用敬語回主管          [public]      [edit]  [delete]        │
│  [我的口頭禪是「好的沒問題」] → 展開欄位（編輯中）              │
└─────────────────────────────────────────────────────────────────┘
```

### 狀態版面

**View（預設）：**
```
  key_text                    [visibility]   [鉛筆]  [垃圾桶]
```

**Edit（內聯編輯）：**
```
  ┌──────────────────────────────────────────────────────┐
  │ key  [輸入框...]                                     │
  │ value [textarea...]                                  │
  │ visibility [select: public ▼]                       │
  │                     [取消]  [儲存]                   │
  └──────────────────────────────────────────────────────┘
```

---

## Props

| Prop | Type | Default | 說明 |
|------|------|---------|------|
| `fact` | `ProfileFact`（見下方） | 必填 | Profile fact 資料 |
| `onEdit` | `(fact: ProfileFact) => void` | 必填 | 儲存編輯 callback |
| `onDelete` | `(id: string) => void` | 必填 | 刪除 callback |

### ProfileFact 型別

```ts
type FactVisibility = "public" | "private" | "secret";

interface ProfileFact {
  id: string;
  key: string;
  value: string;
  visibility: FactVisibility;
}
```

---

## Visibility Badge

| Visibility | 文字 | 背景 | 文字色 |
|------------|------|------|--------|
| `public` | 公開 | `bg-success-subtle` | `text-success-strong` |
| `private` | 私人 | `bg-warning-subtle` | `text-warning-strong` |
| `secret` | 機密 | `bg-error-subtle` | `text-error-strong` |

---

## States

| State | 描述 |
|-------|------|
| `view` | 顯示 key + visibility badge + 操作按鈕 |
| `edit` | 展開 inline 編輯表單 |
| `deleting` | 點擊刪除後，呈現確認對話（inline confirm，不用 modal） |
| `saving` | 儲存中，按鈕顯示 spinner |
| `error` | 儲存/刪除失敗，顯示 error 訊息 |

### 刪除確認（inline confirm）

```
  key_text           [確認刪除？]  [取消]  [確認刪除]
```

- 不彈 modal，在同一列 inline 顯示
- 確認刪除按鈕：`Button` variant="danger" size="sm"
- 取消按鈕：`Button` variant="ghost" size="sm"

---

## Accessibility

- 列容器：`role="listitem"`
- 編輯按鈕：`aria-label="編輯：${fact.key}"` + focus state
- 刪除按鈕：`aria-label="刪除：${fact.key}"`
- 編輯表單：`role="form"` + `aria-label="編輯 ${fact.key}"`
- Key input：`<label>` 連結，必填 `aria-required="true"`
- Value textarea：`<label>` 連結
- Visibility select：`<label>` 連結

---

## Tailwind Classes

```tsx
// 列容器
const rowClasses = [
  "flex items-center gap-2 py-2",
  "border-b border-[--color-border-default] last:border-b-0",
].join(" ");

// key 文字
const keyClasses = "flex-1 text-sm text-[--color-text-default] truncate min-w-0";

// visibility badge
const visibilityBadgeClasses = {
  public:  "text-xs px-1.5 py-0.5 rounded-[--radius-xs] bg-[--color-success-subtle] text-[--color-success-strong]",
  private: "text-xs px-1.5 py-0.5 rounded-[--radius-xs] bg-[--color-warning-subtle] text-[--color-warning-strong]",
  secret:  "text-xs px-1.5 py-0.5 rounded-[--radius-xs] bg-[--color-error-subtle] text-[--color-error-strong]",
};

// 操作按鈕
const actionBtnClasses = [
  "flex items-center justify-center w-7 h-7",
  "min-w-[44px] min-h-[44px]",  // 觸控目標 -m 補償
  "rounded-sm",
  "text-[--color-text-muted] hover:text-[--color-text-default]",
  "hover:bg-[--color-surface-muted]",
  "transition-colors duration-150",
  "focus:outline-none focus-visible:ring-1 focus-visible:ring-[--color-border-focus]",
].join(" ");

// 編輯表單
const editFormClasses = [
  "mt-1 p-3",
  "bg-[--color-surface-subtle]",
  "border border-[--color-border-default] rounded-sm",
  "space-y-2",
].join(" ");

// 表單 input / textarea
const inputClasses = [
  "w-full h-8 px-2.5",
  "text-sm text-[--color-text-default]",
  "bg-[--color-surface-default]",
  "border border-[--color-border-default] rounded-sm",
  "focus:outline-none focus:border-[--color-border-focus]",
  "focus:ring-1 focus:ring-[--color-border-focus]",
].join(" ");
```

---

## 使用範例

見 `example.tsx`
