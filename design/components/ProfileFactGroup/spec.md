# ProfileFactGroup

## 用途

`/settings` 頁 Profile section 中，以 visibility 分組顯示 `ProfileFactItem` 的群組容器。每組顯示一個分組標題 + 成員列表 + 底部「新增」按鈕。

---

## 版面

```
┌─────────────────────────────────────────────────────────────────┐
│  [公開]                                                         │  ← 分組標題
│ ─────────────────────────────────────────────────────────────── │
│  我都用敬語回主管        [公開]   [鉛筆]  [垃圾桶]               │  ← ProfileFactItem
│  用輕鬆語氣               [公開]   [鉛筆]  [垃圾桶]               │
│ ─────────────────────────────────────────────────────────────── │
│  [+ 新增公開事實]                                               │  ← 新增按鈕
└─────────────────────────────────────────────────────────────────┘
```

**空狀態：**
```
┌─────────────────────────────────────────────────────────────────┐
│  [公開]                                                         │
│ ─────────────────────────────────────────────────────────────── │
│  尚無公開事實                                                   │  ← 空狀態提示
│ ─────────────────────────────────────────────────────────────── │
│  [+ 新增公開事實]                                               │
└─────────────────────────────────────────────────────────────────┘
```

**新增 inline 表單（點擊 + 後展開）：**
```
┌─────────────────────────────────────────────────────────────────┐
│  [公開]                                                         │
│ ─────────────────────────────────────────────────────────────── │
│  ... ProfileFactItems ...                                       │
│ ─────────────────────────────────────────────────────────────── │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ 名稱 [輸入框]                                               │ │
│  │ 內容 [textarea]                                             │ │
│  │                              [取消]  [新增]                 │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Props

| Prop | Type | Default | 說明 |
|------|------|---------|------|
| `visibility` | `FactVisibility` | 必填 | 此組的 visibility 類型 |
| `facts` | `ProfileFact[]` | 必填 | 此 visibility 的 facts 列表 |
| `onEdit` | `(fact: ProfileFact) => void` | 必填 | 編輯 callback |
| `onDelete` | `(id: string) => void` | 必填 | 刪除 callback |
| `onAdd` | `(key: string, value: string, visibility: FactVisibility) => void` | 必填 | 新增 callback |

---

## 分組標題樣式

| Visibility | 標題文字 | Badge 樣式 |
|------------|---------|-----------|
| `public` | 公開 | `bg-success-subtle text-success-strong` |
| `private` | 私人 | `bg-warning-subtle text-warning-strong` |
| `secret` | 機密 | `bg-error-subtle text-error-strong` |

標題格式：badge + 「說明小字」（optional）
- public：「供 AI 在所有回覆中參考」
- private：「僅供特定情境使用」
- secret：「AI 不會在回覆中揭露這些資訊」

---

## Accessibility

- 整組容器：`role="group"` + `aria-label="${VISIBILITY_LABELS[visibility]} 事實分組"`
- 事實列表：`<ul>` + `role="list"`（`ProfileFactItem` 各為 `<li role="listitem">`）
- 新增按鈕：`aria-label="新增${VISIBILITY_LABELS[visibility]}事實"`
- 新增表單：`role="form"` + `aria-label="新增${VISIBILITY_LABELS[visibility]}事實"`

---

## Tailwind Classes

```tsx
// 群組容器
const groupClasses = [
  "rounded-md border border-[--color-border-default]",
  "bg-[--color-surface-default]",
  "overflow-hidden",
].join(" ");

// 分組標題 bar
const groupHeaderClasses = [
  "flex items-center gap-2 px-4 py-2.5",
  "bg-[--color-surface-subtle]",
  "border-b border-[--color-border-default]",
].join(" ");

// 空狀態
const emptyClasses = [
  "px-4 py-4",
  "text-sm text-center text-[--color-text-muted]",
].join(" ");

// 新增按鈕列
const addBtnRowClasses = [
  "px-4 py-2",
  "border-t border-[--color-border-default]",
].join(" ");

// 新增按鈕
const addBtnClasses = [
  "inline-flex items-center gap-1 h-7 px-2",
  "text-xs text-[--color-text-secondary]",
  "border border-dashed border-[--color-border-strong] rounded-sm",
  "hover:bg-[--color-surface-muted] hover:border-[--color-border-strong]",
  "transition-colors duration-150",
  "focus:outline-none focus-visible:ring-1 focus-visible:ring-[--color-border-focus]",
].join(" ");
```

---

## 使用範例

見 `example.tsx`
