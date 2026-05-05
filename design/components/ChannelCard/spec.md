# ChannelCard

## 用途

`/settings` 頁 Channels section 中每個 Chat Space 的設定卡片。每張卡片獨立管理一個 space 的 per-channel 設定，任意變更即時 PATCH backend。

---

## 版面

```
┌─────────────────────────────────────────────────────────────────┐
│  Team #frontend                                                  │
│  space_id: spaces/AAAA                      [AAAA 空間] readonly │
│ ─────────────────────────────────────────────────────────────── │
│  啟用此空間                             [toggle: ON]             │
│  只在 @提及 時觸發                      [toggle: OFF]            │
│  ─────────────────────────────────────────────────────────────  │
│  Auto 模式覆寫                                                   │
│  ○ 繼承全域  ● 強制開啟  ○ 強制關閉                              │
│  ─────────────────────────────────────────────────────────────  │
│  封鎖關鍵字                                                      │
│  [薪水 ×] [辭職 ×]  [輸入關鍵字, Enter 新增...]                  │
└─────────────────────────────────────────────────────────────────┘
```

**卡片停用狀態**（enabled = false）：
- 除「啟用此空間」toggle 外，其他所有控制項 `disabled` + `opacity-50`
- 卡片整體有輕微 `opacity-75`

---

## Props

| Prop | Type | Default | 說明 |
|------|------|---------|------|
| `space` | `SpaceSetting`（見下方） | 必填 | Space 設定資料 |
| `onEnabledChange` | `(spaceId: string, enabled: boolean) => void` | 必填 | 啟用/停用 callback |
| `onMentionOnlyChange` | `(spaceId: string, mentionOnly: boolean) => void` | 必填 | Mention-only callback |
| `onAutoModeOverrideChange` | `(spaceId: string, override: AutoModeOverride) => void` | 必填 | Auto-mode override callback |
| `onBlockedKeywordsChange` | `(spaceId: string, keywords: string[]) => void` | 必填 | Blocked keywords callback |

### SpaceSetting 型別

```ts
type AutoModeOverride = "inherit" | "always_on" | "always_off";

interface SpaceSetting {
  space_id: string;
  space_name: string;
  enabled: boolean;
  mention_only: boolean;
  auto_mode_override: AutoModeOverride;
  blocked_keywords: string[];
}
```

---

## 各區域細節

### Header

- `space_name`：`text-sm font-semibold text-text-default`
- `space_id`（readonly）：`text-xs text-text-muted font-mono`，值為 `spaces/AAAA` 格式
- 不可互動，純展示

### Toggle 控制項

用於「啟用此空間」和「只在 @提及 時觸發」。

**Toggle 元件規格**（inline，不獨立拆元件）：

- 外觀：pill 形狀，`w-10 h-6 rounded-full`
- ON：`bg-primary-600`；OFF：`bg-neutral-300`
- 滑動圓點：`w-5 h-5 bg-white rounded-full shadow-sm`，transition `translate-x-0` → `translate-x-4`
- 最小觸控目標：`min-w-[44px] min-h-[44px]`（wrapper button）
- Keyboard：`Space` 切換
- ARIA：`role="switch"` + `aria-checked={value}` + `aria-label="..."`

### Auto-mode Override Radio Group

三個選項，水平排列：
- `繼承全域`（inherit）
- `強制開啟`（always_on）
- `強制關閉`（always_off）

規格：
- `<fieldset>` + `<legend className="sr-only">Auto 模式覆寫</legend>`
- 每個選項：`<input type="radio">` + `<label>`
- 選中：`text-primary-600 font-medium`；未選中：`text-text-secondary`
- Radio 點：`accent-color: var(--color-primary-600)`（CSS accent-color）

### Blocked Keywords

- 使用 `KeywordChipInput` 元件（見 `KeywordChip/spec.md`）
- Label：「封鎖關鍵字」，`text-xs font-medium text-text-secondary`
- 說明文字：「含有這些關鍵字的訊息不會觸發草稿」，`text-xs text-text-muted`

---

## 停用狀態行為

```
enabled = false：
  卡片整體：opacity-75
  mention_only toggle：disabled + opacity-50
  auto_mode_override radio：disabled + opacity-50
  blocked_keywords input：disabled + opacity-50
  啟用此空間 toggle：保持可互動（不受影響）
```

---

## States

| State | 描述 |
|-------|------|
| `enabled` | 全部控制項可互動 |
| `disabled`（整卡） | 非啟用 toggle 以外的控制項不可互動 |
| `saving` | 某項設定 PATCH 中，顯示儲存指示（小 spinner 在修改的控制項旁，duration 150ms fade in） |
| `error` | PATCH 失敗，在卡片底部顯示 error banner |

---

## Accessibility

- 卡片：`role="region"` + `aria-label="${space_name} 設定"`
- 啟用 toggle：`role="switch"` + `aria-checked={enabled}` + `aria-label="啟用 ${space_name}"`
- Mention-only toggle：`role="switch"` + `aria-checked={mention_only}` + `aria-label="只在被 @提及 時觸發"`
- Auto-mode radio group：`<fieldset>` + `<legend>`（sr-only 或可見）
- Blocked keywords label：`<label>` 連結至 `KeywordChipInput` 的 input
- 停用控制項：`aria-disabled="true"` + 視覺 `opacity-50`

---

## Tailwind Classes

```tsx
// 卡片外框
const cardClasses = (enabled: boolean) => [
  "rounded-md border border-[--color-border-default]",
  "bg-[--color-surface-default]",
  "shadow-[--shadow-card]",
  "overflow-hidden",
  "transition-opacity duration-150",
  !enabled ? "opacity-75" : "",
].filter(Boolean).join(" ");

// section 分隔
const sectionClasses = "border-t border-[--color-border-default] px-4 py-3";

// header
const headerClasses = "px-4 py-3";

// toggle 外框 button（觸控目標）
const toggleWrapperClasses = [
  "relative inline-flex items-center justify-center",
  "w-11 h-11 -mr-1.5",   // 44pt 觸控目標
  "rounded-sm",
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[--color-border-focus]",
].join(" ");

// toggle track
const trackClasses = (checked: boolean) => [
  "w-10 h-6 rounded-full",
  "transition-colors duration-200",
  checked ? "bg-[--color-primary-600]" : "bg-[--color-neutral-300]",
].join(" ");

// toggle thumb
const thumbClasses = (checked: boolean) => [
  "absolute w-5 h-5 bg-white rounded-full",
  "shadow-[--shadow-xs]",
  "transition-transform duration-200",
  checked ? "translate-x-[18px]" : "translate-x-[2px]",
].join(" ");
```

---

## 使用範例

見 `example.tsx`
