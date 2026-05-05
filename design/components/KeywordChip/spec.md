# KeywordChip

## 用途

可刪除的關鍵字標籤，用於 `ChannelCard` 的 blocked_keywords 輸入區。使用者可新增關鍵字並以此元件呈現，點擊 X 按鈕刪除。亦可複用於 FilterBar 的 space 已選標籤。

---

## 版面

```
┌─────────────────────┐
│  薪水   [×]         │
└─────────────────────┘
```

- 圓角 pill 樣式（`rounded-full`）
- 左側顯示關鍵字文字，右側為 X 刪除按鈕
- 整體高度：`h-6`（24px）
- 觸控目標：X 按鈕本身 `min-w-[44px] min-h-[44px]`（使用 padding 或 touch-action 補足）

---

## Variants

| Variant | 用途 | 背景 | 文字 | 邊框 |
|---------|------|------|------|------|
| `default` | ChannelCard blocked_keywords | `bg-surface-muted` | `text-text-secondary` | `border-border-default` |
| `filter` | FilterBar 已選 space | `bg-surface-muted` | `text-text-secondary` | `border-border-default` |
| `error` | 重複 / 非法關鍵字 | `bg-error-subtle` | `text-error-strong` | `border-error-default` |

> 目前 `default` 與 `filter` 樣式相同，保留語意分離以便未來獨立調整。

---

## Props

| Prop | Type | Default | 說明 |
|------|------|---------|------|
| `label` | `string` | 必填 | 顯示的關鍵字文字 |
| `onDelete` | `() => void` | 必填 | 點擊 X 的 callback |
| `variant` | `'default' \| 'filter' \| 'error'` | `'default'` | 樣式 variant |
| `disabled` | `boolean` | `false` | 禁用刪除操作 |

---

## States

| State | 描述 | 視覺變化 |
|-------|------|---------|
| `default` | 正常顯示 | 標準外觀 |
| `hover`（X 按鈕） | 滑鼠懸停 X 按鈕 | X 按鈕背景輕微填色 |
| `focus`（X 按鈕） | 鍵盤 focus | `ring-1 ring-border-focus` |
| `disabled` | 不可刪除 | X 按鈕 `opacity-40 cursor-not-allowed` |
| `error` | 非法關鍵字 | error 色系 |

---

## Accessibility

- 整個 chip 不是可聚焦元素，焦點在 X 按鈕上
- X 按鈕：`aria-label="刪除關鍵字 ${label}"`
- X 按鈕：`type="button"`（避免 form submit）
- disabled 時：`aria-disabled="true"` + `tabIndex={-1}`
- Chip 容器：`aria-label="${label}"` 供 screen reader 識別（可選）

---

## Tailwind Classes

```tsx
// chip 外框
const chipClasses = (variant: string) => {
  const base = [
    "inline-flex items-center gap-1 h-6 pl-2 pr-1",
    "text-xs rounded-[--radius-full]",
    "border",
    "select-none",
  ];
  const variantMap = {
    default: "bg-[--color-surface-muted] text-[--color-text-secondary] border-[--color-border-default]",
    filter:  "bg-[--color-surface-muted] text-[--color-text-secondary] border-[--color-border-default]",
    error:   "bg-[--color-error-subtle] text-[--color-error-strong] border-[--color-error-default]",
  };
  return [...base, variantMap[variant]].join(" ");
};

// X 按鈕
const deleteBtnClasses = (disabled: boolean) => [
  "flex items-center justify-center",
  "w-4 h-4 -mr-0.5",
  "rounded-full",
  "transition-colors duration-150",
  disabled
    ? "opacity-40 cursor-not-allowed"
    : [
        "text-[--color-text-muted] hover:text-[--color-text-default]",
        "hover:bg-[--color-neutral-300]",
        "focus:outline-none focus-visible:ring-1 focus-visible:ring-[--color-border-focus]",
      ].join(" "),
].filter(Boolean).join(" ");
```

---

## 使用範例

見 `example.tsx`
