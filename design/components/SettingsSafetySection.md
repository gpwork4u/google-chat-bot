# SettingsSafetySection

## 用途

SettingsPage 全域設定（Global Section）內的安全護欄子區塊。提供：
1. 主 toggle：「啟用安全護欄」（`safety_rails_enabled`）
2. sub-toggle：「金錢偵測」（`safety_rules.money`）— 主 toggle OFF 時整組 grey out

讀寫端點：`GET / PATCH /api/safety/rules`（`API_PATHS.SAFETY_RULES`）。

---

## 版面 Wireframe

### 主 toggle ON（子規則可互動）

```
┌── Section: 安全護欄 ────────────────────────────────────────┐
│  [ShieldCheck icon]  安全護欄                                │  ← section header
│ ──────────────────────────────────────────────────────────  │
│  啟用安全護欄                              [toggle: ON]      │  ← 主開關
│  即使 Auto 模式開啟，也會攔截敏感內容等待人工審核              │  ← hint 文字
│ ──────────────────────────────────────────────────────────  │
│    金錢偵測                               [toggle: ON]       │  ← sub-toggle（縮排 16px）
│    偵測金額、轉帳、報價等金錢相關訊息                         │  ← sub-toggle hint
└──────────────────────────────────────────────────────────── ┘
```

### 主 toggle OFF（子規則 grey out）

```
┌── Section: 安全護欄 ────────────────────────────────────────┐
│  [ShieldCheck icon]  安全護欄                                │
│ ──────────────────────────────────────────────────────────  │
│  啟用安全護欄                              [toggle: OFF]     │
│  即使 Auto 模式開啟，也會攔截敏感內容等待人工審核              │
│ ──────────────────────────────────────────────────────────  │
│    金錢偵測                               [toggle: OFF]      │  ← opacity-50
│    偵測金額、轉帳、報價等金錢相關訊息                         │  ← aria-disabled="true"
└──────────────────────────────────────────────────────────── ┘
```

---

## 在 Settings 頁面的位置

安全護欄 section 插入於「Auto 模式 / Freshness / Debug」現有 Global Section 之後、Channels Section 之前，作為獨立 `<section>` 元素：

```
┌── Page ──────────────────────────────────────────────────┐
│ ┌── Global Section ───────────────────────────────────┐  │
│ │  Auto 模式 toggle                                   │  │
│ │  訊息新鮮度 input                                    │  │
│ │  Debug 模式 toggle                                   │  │
│ └─────────────────────────────────────────────────────┘  │
│                                                           │
│ ┌── Safety Section（新）─────────────────────────────┐   │  ← 這裡
│ │  啟用安全護欄 toggle                                │   │
│ │  └ 金錢偵測 sub-toggle                              │   │
│ └─────────────────────────────────────────────────────┘  │
│                                                           │
│ ┌── Channels Section ─────────────────────────────────┐  │
│ │  ...                                                │  │
│ └─────────────────────────────────────────────────────┘  │
```

---

## Props

| Prop | Type | Default | 說明 |
|------|------|---------|------|
| `enabled` | `boolean` | 必填 | 安全護欄主開關狀態（`safety_rails_enabled`） |
| `rules` | `{ money: boolean }` | 必填 | 各規則開關狀態 |
| `onEnabledChange` | `(val: boolean) => void` | 必填 | 主開關變更 callback |
| `onRuleChange` | `(rule: string, val: boolean) => void` | 必填 | 子規則變更 callback |
| `saving` | `boolean` | `false` | PATCH 中，顯示 saving 指示 |

---

## UX Text（對應 contracts.ts `LABELS.SAFETY_*`）

| 用途 | 文字 | contracts.ts 常數 |
|------|------|-------------------|
| Section 標題 | 安全護欄 | `LABELS.SAFETY_SECTION_TITLE` |
| 主 toggle label | 啟用安全護欄 | `LABELS.SAFETY_ENABLED_LABEL` |
| 主 toggle hint | 即使 Auto 模式開啟，也會攔截敏感內容等待人工審核 | `LABELS.SAFETY_ENABLED_HINT` |
| money toggle label | 金錢偵測 | `LABELS.SAFETY_RULE_MONEY_LABEL` |
| money toggle hint | 偵測金額、轉帳、報價等金錢相關訊息 | `LABELS.SAFETY_RULE_MONEY_HINT` |

**contracts.ts 需新增（engineer 實作時補入）**：

```ts
// LABELS（新增）
SAFETY_SECTION_TITLE: '安全護欄',
SAFETY_ENABLED_LABEL: '啟用安全護欄',
SAFETY_ENABLED_HINT: '即使 Auto 模式開啟，也會攔截敏感內容等待人工審核',
SAFETY_RULE_MONEY_LABEL: '金錢偵測',
SAFETY_RULE_MONEY_HINT: '偵測金額、轉帳、報價等金錢相關訊息',
```

---

## TestIDs（contracts.ts 對應）

| 元素 | `data-testid` | contracts.ts 常數 |
|------|--------------|-------------------|
| section 根容器 | `safety-section` | `TESTIDS.SAFETY_SECTION` |
| 主 toggle button | `safety-enabled-toggle` | `TESTIDS.SAFETY_ENABLED_TOGGLE` |
| 金錢偵測 toggle | `safety-rule-money-toggle` | `TESTIDS.SAFETY_RULE_MONEY_TOGGLE` |

**contracts.ts 需新增（engineer 實作時補入）**：

```ts
// TESTIDS（新增）
SAFETY_SECTION: 'safety-section',
SAFETY_ENABLED_TOGGLE: 'safety-enabled-toggle',
SAFETY_RULE_MONEY_TOGGLE: 'safety-rule-money-toggle',
```

**API_PATHS 需新增**：
```ts
SAFETY_RULES: '/api/safety/rules',
```

---

## States

| State | 描述 | 視覺 |
|-------|------|------|
| `enabled=true` | 主開關 ON | 子規則正常可互動 |
| `enabled=false` | 主開關 OFF | 子規則整組 `opacity-50` + `aria-disabled="true"` + `cursor-not-allowed`（toggle wrapper） |
| `saving=true` | PATCH 中 | 對應 toggle 右側顯示小 spinner（150ms fade in），`w-3 h-3`，同 ChannelCard saving state |

---

## Accessibility

- Section 根元素：`role="region"` + `aria-label="安全護欄設定"`
- 主 toggle：`role="switch"` + `aria-checked={enabled}` + `aria-label={LABELS.SAFETY_ENABLED_LABEL}`
- sub-toggle 區域：`<fieldset>` + `<legend className="sr-only">安全護欄子規則</legend>`
- 金錢偵測 toggle：`role="switch"` + `aria-checked={rules.money}` + `aria-label={LABELS.SAFETY_RULE_MONEY_LABEL}` + 主開關 OFF 時 `aria-disabled="true"`
- hint 文字：`id` 屬性，toggle button 帶 `aria-describedby`
- disabled 時 toggle wrapper 仍保留 `tabIndex={0}` 以維持 keyboard traversal，但 `aria-disabled="true"` 告知不可互動

---

## Toggle 共用規格

沿用 `ChannelCard/spec.md` 內定義的 inline Toggle 規格（不獨立拆元件）：

```
pill 形狀 w-10 h-6 rounded-full
ON：  bg-[--color-primary-600]
OFF： bg-[--color-neutral-300]
滑動圓點：w-5 h-5 bg-white rounded-full shadow-sm
transition-transform duration-200
最小觸控目標：min-w-[44px] min-h-[44px] wrapper button
keyboard：Space 切換
```

---

## Tailwind Classes

```tsx
// section 容器
const sectionClasses = [
  "rounded-md border border-[--color-border-default]",
  "bg-[--color-surface-default]",
  "shadow-[--shadow-card]",
  "overflow-hidden",
].join(" ");

// section header
const headerClasses = [
  "flex items-center gap-2 px-4 py-3",
  "border-b border-[--color-border-default]",
].join(" ");

const headerIconClasses = "w-4 h-4 text-[--color-text-secondary]";
const headerTitleClasses = "text-sm font-semibold text-[--color-text-default]";

// toggle row（主開關 + 每個 sub-toggle 共用）
const toggleRowClasses = [
  "flex items-center justify-between",
  "px-4 py-3",
  "border-b border-[--color-border-default] last:border-b-0",
].join(" ");

// sub-toggle row（縮排）
const subToggleRowClasses = [
  "flex items-center justify-between",
  "pl-8 pr-4 py-3",  // pl-8 = 32px 縮排
  "border-b border-[--color-border-default] last:border-b-0",
  "transition-opacity duration-150",
].join(" ");

// disabled 時套用在 sub-toggle row 外層 div
const disabledGroupClasses = "opacity-50 pointer-events-none";

// toggle label 文字
const labelClasses = "text-sm font-medium text-[--color-text-default]";
const hintClasses = "text-xs text-[--color-text-muted] mt-0.5";

// saving spinner（右側，fade in 150ms）
const savingSpinnerClasses = [
  "w-3 h-3 rounded-full border-2",
  "border-[--color-primary-300] border-t-[--color-primary-600]",
  "animate-spin",
  "transition-opacity duration-150",
].join(" ");
```

---

## 範例程式碼

```tsx
import { ShieldCheck } from 'lucide-react'
import { TESTIDS, LABELS, API_PATHS, TOAST } from '../contracts'

interface SafetyRules {
  money: boolean
}

interface SettingsSafetySectionProps {
  enabled: boolean
  rules: SafetyRules
  onEnabledChange: (val: boolean) => void
  onRuleChange: (rule: keyof SafetyRules, val: boolean) => void
  saving?: boolean
}

export function SettingsSafetySection({
  enabled,
  rules,
  onEnabledChange,
  onRuleChange,
  saving = false,
}: SettingsSafetySectionProps) {
  return (
    <section
      role="region"
      aria-label="安全護欄設定"
      data-testid={TESTIDS.SAFETY_SECTION}
      className="rounded-md border border-[--color-border-default] bg-[--color-surface-default] shadow-[--shadow-card] overflow-hidden"
    >
      {/* Section Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[--color-border-default]">
        <ShieldCheck className="w-4 h-4 text-[--color-text-secondary]" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-[--color-text-default]">
          {LABELS.SAFETY_SECTION_TITLE}
        </h2>
      </div>

      {/* 主開關：啟用安全護欄 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[--color-border-default]">
        <div>
          <p
            id="safety-enabled-label"
            className="text-sm font-medium text-[--color-text-default]"
          >
            {LABELS.SAFETY_ENABLED_LABEL}
          </p>
          <p
            id="safety-enabled-hint"
            className="text-xs text-[--color-text-muted] mt-0.5"
          >
            {LABELS.SAFETY_ENABLED_HINT}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saving && (
            <span
              className="w-3 h-3 rounded-full border-2 border-[--color-primary-300] border-t-[--color-primary-600] animate-spin"
              aria-hidden="true"
            />
          )}
          {/* Toggle（inline，同 ChannelCard 規格） */}
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label={LABELS.SAFETY_ENABLED_LABEL}
            aria-describedby="safety-enabled-hint"
            data-testid={TESTIDS.SAFETY_ENABLED_TOGGLE}
            onClick={() => onEnabledChange(!enabled)}
            className="relative inline-flex items-center justify-center w-11 h-11 -mr-1.5 rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[--color-border-focus]"
          >
            <span
              className={[
                "w-10 h-6 rounded-full transition-colors duration-200",
                enabled
                  ? "bg-[--color-primary-600]"
                  : "bg-[--color-neutral-300]",
              ].join(" ")}
            >
              <span
                className={[
                  "absolute w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200",
                  enabled ? "translate-x-[18px]" : "translate-x-[2px]",
                ].join(" ")}
              />
            </span>
          </button>
        </div>
      </div>

      {/* 子規則群組 */}
      <fieldset>
        <legend className="sr-only">安全護欄子規則</legend>

        {/* 金錢偵測 sub-toggle */}
        <div
          className={[
            "flex items-center justify-between pl-8 pr-4 py-3",
            "transition-opacity duration-150",
            !enabled ? "opacity-50 pointer-events-none" : "",
          ].filter(Boolean).join(" ")}
        >
          <div>
            <p
              id="safety-rule-money-label"
              className="text-sm font-medium text-[--color-text-default]"
            >
              {LABELS.SAFETY_RULE_MONEY_LABEL}
            </p>
            <p className="text-xs text-[--color-text-muted] mt-0.5">
              {LABELS.SAFETY_RULE_MONEY_HINT}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={rules.money}
            aria-label={LABELS.SAFETY_RULE_MONEY_LABEL}
            aria-describedby="safety-rule-money-label"
            aria-disabled={!enabled ? "true" : undefined}
            data-testid={TESTIDS.SAFETY_RULE_MONEY_TOGGLE}
            disabled={!enabled}
            onClick={() => enabled && onRuleChange('money', !rules.money)}
            className="relative inline-flex items-center justify-center w-11 h-11 -mr-1.5 rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[--color-border-focus] disabled:cursor-not-allowed"
          >
            <span
              className={[
                "w-10 h-6 rounded-full transition-colors duration-200",
                rules.money
                  ? "bg-[--color-primary-600]"
                  : "bg-[--color-neutral-300]",
              ].join(" ")}
            >
              <span
                className={[
                  "absolute w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200",
                  rules.money ? "translate-x-[18px]" : "translate-x-[2px]",
                ].join(" ")}
              />
            </span>
          </button>
        </div>
      </fieldset>
    </section>
  )
}
```

---

## Hook 介面（`useSafetyRules`）

Engineer 實作 `web/src/hooks/useSafetyRules.ts` 時的預期介面：

```ts
interface SafetyRulesState {
  enabled: boolean
  rules: { money: boolean }
}

function useSafetyRules(): {
  data: SafetyRulesState | undefined
  isLoading: boolean
  patch: (partial: Partial<SafetyRulesState>) => Promise<void>
  saving: boolean
}
```

- `patch` 成功 → `TOAST.SETTINGS_SAVED`
- `patch` 失敗 → `TOAST.SETTINGS_SAVE_FAILED`
- 使用 SWR，key = `API_PATHS.SAFETY_RULES`

---

## Loading / Error 狀態

| 狀態 | 顯示方式 |
|------|---------|
| loading | 骨架屏（同 SettingsPage 其他 section 的 skeleton 規格，`animate-pulse`） |
| error | section 內顯示 error banner，`bg-error-subtle text-error-strong`，含 retry 按鈕 |
