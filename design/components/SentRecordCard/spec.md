# SentRecordCard

## 用途

`/sent` 頁的核心列表元件。每張卡片代表一筆已送出的訊息記錄，支援 collapsed / expanded 兩種檢視狀態。設計為高密度列表，需同時承載 mode badge、edited badge 和可展開的詳情區。

---

## 卡片版面

### Collapsed（預設）

```
┌─────────────────────────────────────────────────────────────────┐
│  Team #frontend                    [approved]  [使用者編輯過]  [▼] │  ← 標題行
│  Alice · 5分鐘前（2026-05-04 10:00）                              │  ← meta 行
│  ─────────────────────────────────────────────────────────────  │
│  觸發：你好嗎                                                      │  ← 觸發訊息（1行截斷）
│  送出：還行，謝謝（最多 2 行截斷）                                   │  ← 送出內容
└─────────────────────────────────────────────────────────────────┘
```

### Expanded（點擊後）

```
┌─────────────────────────────────────────────────────────────────┐
│  Team #frontend                    [approved]  [使用者編輯過]  [▲] │
│  Alice · 5分鐘前                                                  │
│  ─────────────────────────────────────────────────────────────  │
│  觸發：你好嗎                                                      │
│  送出：還行，謝謝                                                  │
│  ─────────────────────────────────────────────────────────────  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ 上下文（最近對話）                                             │ │  ← 展開區塊
│  │ Alice: 你那邊進度怎樣？                                        │ │
│  │ Bot:   快好了，明天給你                                        │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Props

| Prop | Type | Default | 說明 |
|------|------|---------|------|
| `record` | `SentRecord`（見下方） | 必填 | 送出記錄資料 |
| `defaultExpanded` | `boolean` | `false` | 初始展開狀態 |
| `onExpand` | `(id: string, expanded: boolean) => void` | — | 展開狀態變更 callback |

### SentRecord 型別

```ts
interface SentRecord {
  id: string;
  space_id: string;
  space_name: string;
  sender_id: string;
  sender_name: string;
  trigger_message: string;
  sent_content: string;
  mode: "approved" | "auto";
  edited_by_user: boolean;
  category: "daily-chat" | "work-coordination" | "engineering" | "skip";
  sent_at: string;  // ISO 8601
}
```

---

## Variants / 狀態

| State | 描述 | 視覺變化 |
|-------|------|---------|
| `collapsed` | 預設，顯示摘要 | 展開 icon 為 ChevronDown |
| `expanded` | 顯示完整詳情 | 展開 icon 為 ChevronUp，顯示上下文區塊 |
| `hover` | 滑鼠懸停 | `bg-surface-subtle`（hover 整行） |

---

## Badge 規格

### Mode Badge

| Mode | 背景 | 文字 | 邊框 |
|------|------|------|------|
| `approved` | `--color-mode-approved-bg` | `--color-mode-approved-text` | `--color-mode-approved-border` |
| `auto` | `--color-mode-auto-bg` | `--color-mode-auto-text` | `--color-mode-auto-border` |

文字內容：
- `approved` → 「已審核」
- `auto` → 「自動」

### Edited Badge（有條件顯示）

- 只在 `edited_by_user === true` 時顯示
- 樣式：`bg-surface-muted text-text-muted border border-border-default`
- 文字：「使用者編輯過」
- 字型：`text-xs`

---

## 各區域細節

### 標題行（Header）

- `space_name`：`text-sm font-semibold text-text-default truncate`，最大寬度撐滿（flex grow）
- Badges：flex-shrink-0，右對齊
- 展開 toggle 按鈕：`<button>` 元素，最小 44×44pt 觸控目標（含 padding），`aria-expanded`、`aria-controls`
- Badge 間距：`gap-1.5`

### Meta 行

- `sender_name`：`text-xs text-text-muted`
- 分隔符 `·`：`text-xs text-text-muted mx-1`
- `sent_at`：relative time（"5 分鐘前"），`text-xs text-text-muted`
- `title` attribute：ISO 8601 完整時間（hover 顯示 tooltip）

### 觸發訊息行

- label 前綴：`text-xs text-text-placeholder`「觸發：」
- 內容：`text-xs text-text-muted truncate`（單行截斷）

### 送出內容行

- label 前綴：`text-xs text-text-secondary font-medium`「送出：」
- 內容：`text-sm text-text-default line-clamp-2`（collapsed 最多 2 行，expanded 全顯示）

### 展開詳情區

- 背景：`bg-surface-muted rounded-sm px-3 py-2 mt-2`
- 標題：`text-xs font-medium text-text-secondary mb-1.5`「上下文」
- 每則訊息：sender（`font-medium`）+ 內容，`text-xs text-text-muted`
- 最大高度：`max-h-[200px] overflow-y-auto`

---

## Accessibility

- 整張卡片外框：`role="article"` + `aria-label="${space_name} 的送出記錄，來自 ${sender_name}"`
- 展開 toggle：`aria-expanded={isExpanded}` + `aria-controls="${record.id}-detail"`
- 詳情區：`id="${record.id}-detail"` + `role="region"` + `aria-label="詳情"`
- Mode badge：`aria-label="送出方式：${modeText}"`
- Edited badge：`aria-label="使用者曾編輯此草稿"`
- 時間元素：`<time dateTime={sent_at}>`

---

## Tailwind Classes

```tsx
// 卡片外框
const cardClasses = (isExpanded: boolean) => [
  "group relative rounded-md border border-[--color-border-default]",
  "bg-[--color-surface-default]",
  "shadow-[--shadow-card]",
  "hover:bg-[--color-surface-subtle]",
  "transition-colors duration-150",
  "cursor-pointer",
  "px-4 py-3",
].join(" ");

// mode badge
const modeBadgeClasses = {
  approved: [
    "inline-flex items-center gap-1 px-1.5 py-0.5",
    "text-xs font-medium rounded-[--radius-xs]",
    "bg-[--color-mode-approved-bg] text-[--color-mode-approved-text]",
    "border border-[--color-mode-approved-border]",
  ].join(" "),
  auto: [
    "inline-flex items-center gap-1 px-1.5 py-0.5",
    "text-xs font-medium rounded-[--radius-xs]",
    "bg-[--color-mode-auto-bg] text-[--color-mode-auto-text]",
    "border border-[--color-mode-auto-border]",
  ].join(" "),
};

// edited badge
const editedBadgeClasses = [
  "inline-flex items-center px-1.5 py-0.5",
  "text-xs rounded-[--radius-xs]",
  "bg-[--color-surface-muted] text-[--color-text-muted]",
  "border border-[--color-border-default]",
].join(" ");

// 展開 toggle 按鈕
const toggleBtnClasses = [
  "flex-shrink-0 flex items-center justify-center",
  "w-7 h-7 -mr-1",           // 視覺尺寸
  "min-w-[44px] min-h-[44px]", // 觸控目標（含負 margin 補償）
  "rounded-sm",
  "text-[--color-text-muted]",
  "hover:bg-[--color-surface-muted]",
  "transition-colors duration-150",
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[--color-border-focus]",
].join(" ");
```

---

## 動畫

- 展開/收合：`max-h` transition（`max-h-0 overflow-hidden` → `max-h-[200px]`），`duration-200 ease-out`
- 尊重 `prefers-reduced-motion`：使用 `motion-safe:transition-[max-height]`

---

## 使用範例

見 `example.tsx`
