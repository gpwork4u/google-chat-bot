# SafetyBadge

## 用途

ApprovalCard 卡頭區域的警示 badge，顯示安全護欄觸發資訊。當 `draft.safety_flags` 非空時條件渲染，提示審核者此 draft 含需人工確認的敏感內容。

Sprint 4 支援唯一的 flag 類型：`money`（金錢偵測）。

---

## 外觀結構

```
┌─────────────────────────────────────┐
│  [AlertTriangle icon]  安全護欄  [金錢]  │  ← badge 主體（紅底）
└─────────────────────────────────────┘
         ↓ hover / focus
┌─────────────────────────────────────┐
│  draft 含明確匯款承諾與金額（reason）  │  ← Tooltip
└─────────────────────────────────────┘
```

**flag chip** `[金錢]` 顯示在主文字右側，為同色系但稍深的圓角 pill，視覺上與主體是一個整體。

---

## Variants

| Variant | 用途 | 背景 | 文字 | 邊框 |
|---------|------|------|------|------|
| `danger` | 安全護欄觸發（唯一 variant） | `--color-safety-badge-bg` | `--color-safety-badge-text` | `--color-safety-badge-border` |

---

## Design Tokens（新增至 `design/tokens/colors.css`）

```css
/* ── Safety Badge Colors（Sprint 4 新增）────────────────── */
--color-safety-badge-bg:      oklch(0.96 0.040 25);    /* error-subtle 衍生，更飽和 */
--color-safety-badge-text:    oklch(0.40 0.200 25);    /* error-strong，深紅 */
--color-safety-badge-border:  oklch(0.78 0.120 25);    /* 中紅邊框 */
--color-safety-badge-chip-bg: oklch(0.88 0.100 25);    /* chip 稍深背景 */

/* Dark mode overrides */
/* .dark 內 */
--color-safety-badge-bg:      oklch(0.22 0.060 25);
--color-safety-badge-text:    oklch(0.85 0.100 25);
--color-safety-badge-border:  oklch(0.35 0.120 25);
--color-safety-badge-chip-bg: oklch(0.30 0.100 25);
```

---

## Props

| Prop | Type | Default | 說明 |
|------|------|---------|------|
| `flags` | `string[]` | 必填 | 觸發的 safety flag 陣列，Sprint 4 僅支援 `["money"]` |
| `reason` | `string` | `''` | tooltip 顯示的觸發原因（`draft.safety_trigger_reason`） |
| `className` | `string` | `''` | 外部覆寫 class |

---

## Flag → Label 對照

| flag 值 | 顯示 chip 文字 | contracts.ts 常數 |
|---------|--------------|-------------------|
| `money` | 金錢 | `LABELS.SAFETY_FLAG_MONEY` |

---

## Sizes

Badge 尺寸固定（不提供 size prop），對齊 Badge.md `sm` 規格：

| 屬性 | 值 |
|------|-----|
| padding x | `px-2` |
| padding y | `py-0.5` |
| font size | `text-xs`（12px） |
| font weight | `font-medium` |
| border radius | `rounded-sm` |
| icon size | `w-3.5 h-3.5` |

---

## States

| State | 外觀變化 |
|-------|---------|
| default | 紅底白字，AlertTriangle icon |
| hover | cursor `default`（badge 本身非可互動），tooltip 顯示 |
| focus（tab 到 tooltip trigger button）| ring 2px `--color-border-focus`，tooltip 顯示 |
| tooltip visible | reason 文字顯示於 badge 正下方，最大寬 240px |

---

## Tooltip 規格

- **觸發方式**：hover 進入 badge（`onMouseEnter` / `onMouseLeave`）+ focus 進入 wrapper button（`onFocus` / `onBlur`）
- **顯示位置**：`top-full mt-1`（badge 正下方），超出視窗時自動反轉至 `bottom-full mb-1`
- **樣式**：
  ```
  bg-neutral-900  text-neutral-50  text-xs
  px-2.5 py-1.5  rounded-sm  shadow-md
  max-w-[240px]  whitespace-normal  z-50
  ```
- **動畫**：`opacity-0 → opacity-100`，150ms，`prefers-reduced-motion` 下取消動畫
- **若 reason 為空**：不顯示 tooltip trigger button，直接渲染靜態 badge span
- **ARIA**：wrapper button 帶 `aria-describedby` 指向 tooltip id；tooltip 元素帶 `role="tooltip"`

---

## Accessibility

- 若 reason 非空：整個 badge 包在 `<button type="button">` 中，支援 keyboard focus
  - `aria-label={LABELS.SAFETY_BADGE_ARIA_LABEL}`（例如「安全護欄警示，點擊查看詳情」）
  - `aria-describedby="safety-tooltip-{draft_id}"`
- 若 reason 為空：改用 `<span>` 包裹，`role="img"` + `aria-label`
- AlertTriangle icon：`aria-hidden="true"`（文字承擔語意）
- flag chip：`aria-hidden="true"`（語意由外層 aria-label 覆蓋）
- 對比度：`--color-safety-badge-text` 於 `--color-safety-badge-bg` 上 >= 4.5:1

---

## TestIDs（contracts.ts 對應）

| 元素 | `data-testid` | contracts.ts 常數 |
|------|--------------|-------------------|
| badge 根容器 | `safety-badge` | `TESTIDS.SAFETY_BADGE` |
| reason tooltip | `safety-reason` | `TESTIDS.SAFETY_REASON` |

**contracts.ts 需新增（engineer 實作時補入）**：

```ts
// TESTIDS（新增）
SAFETY_BADGE: 'safety-badge',
SAFETY_REASON: 'safety-reason',

// LABELS（新增）
SAFETY_BADGE_LABEL: '安全護欄',
SAFETY_FLAG_MONEY: '金錢',
SAFETY_BADGE_ARIA_LABEL: '安全護欄警示，點擊查看觸發原因',
```

---

## Tailwind Classes

```tsx
// badge 主體 wrapper
const badgeWrapperClasses = [
  "relative inline-flex items-center gap-1.5",
  "px-2 py-0.5",
  "text-xs font-medium",
  "rounded-sm border",
  "select-none",
  // 安全護欄紅色 tokens
  "bg-[--color-safety-badge-bg]",
  "text-[--color-safety-badge-text]",
  "border-[--color-safety-badge-border]",
  // focus state（當包在 button 時）
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[--color-border-focus]",
].join(" ");

// AlertTriangle icon
const iconClasses = "w-3.5 h-3.5 shrink-0";

// flag chip（"金錢" 等）
const chipClasses = [
  "inline-flex items-center",
  "px-1 py-0 rounded-xs",
  "text-2xs font-medium",
  "bg-[--color-safety-badge-chip-bg]",
].join(" ");

// tooltip
const tooltipClasses = [
  "absolute top-full mt-1 left-0 z-50",
  "px-2.5 py-1.5",
  "text-xs text-neutral-50",
  "bg-neutral-900 rounded-sm shadow-md",
  "max-w-[240px] whitespace-normal",
  "pointer-events-none",
  // 動畫（GPU 加速）
  "transition-opacity duration-150",
  "motion-reduce:transition-none",
].join(" ");
```

---

## 在 ApprovalCard 中的位置

```
卡頭右側，緊接在 category badge 左邊（更顯眼，優先吸引注意）：

[space_name]    [⚠ 安全護欄 金錢]  [閒聊 badge]  [▲]
sender_name · 5 分鐘前
```

SafetyBadge 比 category badge 更左，視覺權重更高。兩者之間 gap `gap-1.5`。

條件 render：
```tsx
{draft.safety_flags.length > 0 && (
  <SafetyBadge
    flags={draft.safety_flags}
    reason={draft.safety_trigger_reason ?? ''}
    data-testid={TESTIDS.SAFETY_BADGE}
    data-flags={draft.safety_flags.join(',')}
  />
)}
```

---

## 範例程式碼

```tsx
import { AlertTriangle } from 'lucide-react'
import { TESTIDS, LABELS } from '../contracts'

interface SafetyBadgeProps {
  flags: string[]
  reason?: string
  className?: string
  'data-flags'?: string
}

const FLAG_LABELS: Record<string, string> = {
  money: LABELS.SAFETY_FLAG_MONEY,  // '金錢'
}

export function SafetyBadge({ flags, reason = '', className = '', ...rest }: SafetyBadgeProps) {
  const [tooltipVisible, setTooltipVisible] = useState(false)
  const tooltipId = useId()

  const badgeContent = (
    <>
      <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{LABELS.SAFETY_BADGE_LABEL}</span>
      {flags.map((flag) => (
        <span
          key={flag}
          className="inline-flex items-center px-1 rounded-xs text-2xs font-medium bg-[--color-safety-badge-chip-bg]"
          aria-hidden="true"
        >
          {FLAG_LABELS[flag] ?? flag}
        </span>
      ))}
    </>
  )

  const baseClasses = [
    "relative inline-flex items-center gap-1.5",
    "px-2 py-0.5 text-xs font-medium rounded-sm border select-none",
    "bg-[--color-safety-badge-bg] text-[--color-safety-badge-text] border-[--color-safety-badge-border]",
    className,
  ].filter(Boolean).join(" ")

  if (!reason) {
    return (
      <span
        role="img"
        aria-label={LABELS.SAFETY_BADGE_ARIA_LABEL}
        className={baseClasses}
        data-testid={TESTIDS.SAFETY_BADGE}
        {...rest}
      >
        {badgeContent}
      </span>
    )
  }

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={LABELS.SAFETY_BADGE_ARIA_LABEL}
        aria-describedby={tooltipId}
        className={[baseClasses, "focus:outline-none focus-visible:ring-2 focus-visible:ring-[--color-border-focus]"].join(" ")}
        data-testid={TESTIDS.SAFETY_BADGE}
        onMouseEnter={() => setTooltipVisible(true)}
        onMouseLeave={() => setTooltipVisible(false)}
        onFocus={() => setTooltipVisible(true)}
        onBlur={() => setTooltipVisible(false)}
        {...rest}
      >
        {badgeContent}
      </button>

      {tooltipVisible && (
        <span
          id={tooltipId}
          role="tooltip"
          data-testid={TESTIDS.SAFETY_REASON}
          className={[
            "absolute top-full mt-1 left-0 z-50",
            "px-2.5 py-1.5 text-xs text-neutral-50",
            "bg-neutral-900 rounded-sm shadow-md",
            "max-w-[240px] whitespace-normal pointer-events-none",
            "transition-opacity duration-150 motion-reduce:transition-none",
          ].join(" ")}
        >
          {reason}
        </span>
      )}
    </span>
  )
}
```

---

## 使用限制

- 只在 `draft.safety_flags.length > 0` 時渲染，空陣列不渲染此元件
- `reason` 為選填；無 reason 時 badge 靜態顯示，不提供 tooltip
- Sprint 4 的 `flags` 陣列預期只含 `"money"` 一個元素；架構支援未來多 flag
