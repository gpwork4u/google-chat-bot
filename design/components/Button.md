# Button

## 用途

觸發操作或提交。ApprovalCard 的三個操作按鈕（Approve / Edit Saved / Reject）基於此元件。

---

## Variants

| Variant   | 用途               | 背景                          | 文字                      | 邊框                         |
|-----------|--------------------|-------------------------------|---------------------------|------------------------------|
| `primary`   | 主要操作（Approve） | `bg-primary-600`              | `text-text-inverse`       | 無                           |
| `secondary` | 次要操作（Edit Saved） | `bg-surface-muted`         | `text-text-secondary`     | `border border-border-default` |
| `danger`    | 破壞性操作（Reject） | `bg-error-default`           | `text-text-inverse`       | 無                           |
| `ghost`     | 低優先級行動         | 透明                          | `text-text-secondary`     | 無，hover 時顯示背景          |

---

## Sizes

| Size | 高度     | Padding（x / y）     | Font Size     | Icon Size |
|------|----------|----------------------|---------------|-----------|
| `sm` | 28px     | `px-2.5` / `py-1`   | `text-xs`     | 12px      |
| `md` | 32px     | `px-3` / `py-1.5`   | `text-sm`     | 14px      |
| `lg` | 40px     | `px-4` / `py-2`     | `text-base`   | 16px      |

> 最小觸控目標：`min-w-[44px] min-h-[44px]`（含 padding 計算，或使用 touch-action area 包裹）

---

## Props

| Prop        | Type                                              | Default     | 說明                          |
|-------------|---------------------------------------------------|-------------|-------------------------------|
| `variant`   | `'primary' \| 'secondary' \| 'danger' \| 'ghost'` | `'primary'` | 按鈕樣式                      |
| `size`      | `'sm' \| 'md' \| 'lg'`                            | `'md'`      | 按鈕尺寸                      |
| `disabled`  | `boolean`                                         | `false`     | 禁用                          |
| `loading`   | `boolean`                                         | `false`     | 顯示 spinner，block 互動      |
| `icon`      | `React.ReactNode`                                 | —           | 前置圖示（Lucide icon）        |
| `iconRight` | `React.ReactNode`                                 | —           | 後置圖示                      |
| `fullWidth` | `boolean`                                         | `false`     | 撐滿容器寬度                  |
| `type`      | `'button' \| 'submit' \| 'reset'`                 | `'button'`  | HTML button type              |

---

## States

| State      | 外觀變化                                                                 |
|------------|--------------------------------------------------------------------------|
| `default`  | 標準外觀                                                                 |
| `hover`    | `primary`/`danger`: `brightness-110`；`secondary`: `bg-surface-subtle`   |
| `active`   | `scale-[0.97]` — 150ms ease-out，給明確點擊回饋                         |
| `focus`    | `outline-none ring-2 ring-border-focus ring-offset-1`                   |
| `disabled` | `opacity-50 cursor-not-allowed pointer-events-none`                     |
| `loading`  | 顯示 spinner（前置），文字保持 visible（避免 layout shift），`disabled` |

---

## Keyboard

- `Enter` / `Space` — 觸發 click
- `Tab` / `Shift+Tab` — 在 focus 間跳轉

---

## Accessibility

- `role="button"`（使用 `<button>` 元素則預設）
- `disabled` 狀態設 `aria-disabled="true"` 並加 `tabIndex={-1}`
- `loading` 狀態設 `aria-busy="true"` 並加 `aria-label` 描述進行中操作
- Focus ring 顏色對比 >= 3:1 對背景（WCAG 2.1 1.4.11）

---

## Tailwind Classes（完整範例）

```tsx
// base — 所有 variant 共用
const base = [
  "inline-flex items-center justify-center gap-1.5",
  "font-medium font-sans",
  "rounded-sm",
  "transition-all duration-150 ease-out",
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[--color-border-focus] focus-visible:ring-offset-1",
  "select-none cursor-pointer",
  "disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
  "active:scale-[0.97]",
].join(" ");

// variant classes
const variants = {
  primary:   "bg-[--color-primary-600] text-[--color-text-inverse] hover:bg-[--color-primary-500]",
  secondary: "bg-[--color-surface-muted] text-[--color-text-secondary] border border-[--color-border-default] hover:bg-[--color-surface-subtle]",
  danger:    "bg-[--color-error-default] text-[--color-text-inverse] hover:bg-[--color-error-strong]",
  ghost:     "bg-transparent text-[--color-text-secondary] hover:bg-[--color-surface-muted]",
};

// size classes
const sizes = {
  sm: "h-7 px-2.5 py-1 text-xs",
  md: "h-8 px-3 py-1.5 text-sm",
  lg: "h-10 px-4 py-2 text-base",
};
```

---

## 使用範例

```tsx
// Approve（primary，ApprovalCard 用）
<Button variant="primary" size="sm" icon={<CheckIcon size={14} />}>
  Approve
</Button>

// Edit Saved（secondary）
<Button variant="secondary" size="sm" icon={<SaveIcon size={14} />}>
  Edit Saved
</Button>

// Reject（danger）
<Button variant="danger" size="sm" icon={<XIcon size={14} />}>
  Reject
</Button>

// Loading
<Button variant="primary" loading aria-label="送出中">
  Approve
</Button>

// Disabled
<Button variant="primary" disabled>
  Approve
</Button>
```

---

## Icon 規格

使用 [Lucide React](https://lucide.dev/icons/)。**禁止使用 emoji 作為圖示。**

| 用途        | Lucide Icon     |
|-------------|-----------------|
| Approve     | `<Check />`     |
| Edit Saved  | `<Save />`      |
| Reject      | `<X />`         |
| Retry       | `<RefreshCw />` |
| Loading     | `<Loader2 />`（加 `animate-spin`） |
| Settings    | `<Settings />`  |
| Inbox zero  | `<CheckCheck />` |
