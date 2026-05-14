# SkipReasonMenu

## 用途

使用者點擊 Skip 按鈕後彈出的 reason 選單 popover。提供 6 個原因選項，確認後呼叫 `POST /api/claude/skip`。

---

## 版面

```
┌──────────────────────────────────────┐
│  略過原因                        [×] │  ← 標題列
│  ─────────────────────────────────── │
│  ○ 單純回應         pure-ack         │
│  ○ 無關對話         overheard        │
│  ○ 政策紅線         policy-redline   │
│  ○ 不相關（非對象） not-targeted     │
│  ○ 資訊不足         low-info         │
│  ○ 手動其他         manual-other     │
│  ─────────────────────────────────── │
│  [取消]              [確認 Skip]      │
└──────────────────────────────────────┘
```

---

## 觸發機制

- **觸發**：MessageRow 內的 Skip 按鈕（`data-testid="pending-skip-btn"`）
- **定位**：使用 Radix UI `<Popover>` 或 custom popover，定位在 Skip 按鈕旁（優先靠下，overflow 時翻轉）
- **Z-index**：`var(--z-dropdown)` = 100
- **關閉**：按 `×` 按鈕 / 按 `Escape` / 點 overlay 外部

---

## 選項清單

| 值（reason） | 顯示文字（繁中） |
|--------------|-----------------|
| `pure-ack` | 單純回應 |
| `overheard` | 無關對話 |
| `policy-redline` | 政策紅線 |
| `not-targeted` | 不相關（非對象） |
| `low-info` | 資訊不足 |
| `manual-other` | 手動其他 |

---

## Props

| Prop | Type | Default | 說明 |
|------|------|---------|------|
| `messageId` | `string` | 必填 | 要 skip 的 message_id |
| `isOpen` | `boolean` | 必填 | Popover 開關狀態 |
| `onClose` | `() => void` | 必填 | 關閉 callback |
| `onConfirm` | `(reason: SkipReason) => Promise<void>` | 必填 | 確認 skip callback |
| `anchorRef` | `RefObject<HTMLElement>` | 必填 | 錨點元素（Skip 按鈕） |

### SkipReason 型別

```ts
type SkipReason =
  | 'pure-ack'
  | 'overheard'
  | 'policy-redline'
  | 'not-targeted'
  | 'low-info'
  | 'manual-other';
```

---

## States

| State | 描述 | 外觀 |
|-------|------|------|
| idle | 等待選擇 | 各選項可點擊；確認按鈕 disabled（未選原因時） |
| selected | 已選原因 | 選中項 radio 填色，確認按鈕 enabled |
| confirming | 點確認後 loading | 確認按鈕顯示 spinner，所有 option disabled |
| closed | 關閉 | unmount |

---

## Testid

| testid | 元素 | 說明 |
|--------|------|------|
| `pending-skip-reason-menu` | `<div role="dialog">` | Popover 容器 |
| `pending-skip-reason-option` | `<button>` | 每個選項按鈕，附 `data-reason={reason}` |

---

## Accessibility

- Container：`role="dialog"` + `aria-modal="true"` + `aria-label="選擇略過原因"` + `data-testid="pending-skip-reason-menu"`
- 標題：`<h2 id="skip-reason-title">略過原因</h2>`，container 加 `aria-labelledby="skip-reason-title"`
- 選項：`<button role="option" aria-pressed={isSelected} data-testid="pending-skip-reason-option" data-reason={reason}>`
- Focus trap：打開時 focus 移至第一個選項；關閉時 focus 返回 Skip 按鈕
- ESC 鍵：關閉 menu，focus 返回 Skip 按鈕

---

## Keyboard 行為

| 按鍵 | 行為 |
|------|------|
| `Tab` / `Shift+Tab` | 在選項和按鈕間循環（focus trap 在 dialog 內） |
| `Enter` / `Space` | 選取聚焦的選項 / 觸發按鈕 |
| `Escape` | 關閉 menu，不 skip |

---

## Tailwind Classes

```tsx
// Popover 容器
const menuClasses = [
  "absolute z-[--z-dropdown]",
  "w-72",
  "bg-[--color-surface-default]",
  "border border-[--color-border-default]",
  "rounded-lg shadow-elevated",
  "p-4",
  "animate-slide-up",   // var(--animate-slide-up)
].join(" ");

// 選項 button（未選中）
const optionClasses = [
  "w-full flex items-center gap-3",
  "px-3 py-2",
  "text-sm text-[--color-text-default]",
  "rounded-md",
  "hover:bg-[--color-surface-subtle]",
  "focus:outline-none focus:bg-[--color-surface-subtle]",
  "transition-colors duration-150",
].join(" ");

// 選項 button（已選中）
const optionSelectedClasses = [
  "w-full flex items-center gap-3",
  "px-3 py-2",
  "text-sm font-medium text-[--color-primary-600]",
  "rounded-md",
  "bg-[--color-primary-50]",
  "focus:outline-none",
].join(" ");

// 確認按鈕
const confirmBtnClasses = "flex-1";   // 使用 Button 元件 variant="primary"

// 取消按鈕
const cancelBtnClasses = "";   // 使用 Button 元件 variant="ghost"
```

---

## 使用的元件

| 元件 | 說明 |
|------|------|
| `Button` | 取消（ghost）/ 確認 Skip（primary，loading state） |
