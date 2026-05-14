# MessageRow

## 用途

Pending viewer (`/pending`) 三個 tab（Pending / Skipped / Drafted）共用的訊息列表 row。
每一筆 `messages` 表記錄對應一個 `<article>` row，依所在 tab 呈現不同欄位與操作按鈕。

---

## 版面

### 桌面（>= 768px）

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ [space_name badge]  Alice                             3 分鐘前   [@我]  [Skip]   │
│ MSG-ID: spaces/AAA/messages/BBB (monospace, xs)                                   │
│ ─────────────────────────────────────────────────────────────────────────────────│
│ body 文字（最多 100 字，若更長顯示「... 展開」按鈕）                              │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### Skipped tab 附加欄

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ [space_name badge]  Alice                             3 分鐘前   [@我]  [Unskip] │
│ MSG-ID: spaces/AAA/messages/BBB                                                   │
│ 略過原因：[不相關（非對象）] by [手動] ─────────────────────────────────────────│
│ body 文字...                                                                      │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### Mobile（< 768px）

```
┌───────────────────────────────────────────┐
│ [space_name]  [@我]                       │
│ Alice · 3 分鐘前                          │
│ ─────────────────────────────────────────│
│ body 文字...（100 字 truncate）           │
│ [展開]    ────────── [Skip] / [Unskip]   │
└───────────────────────────────────────────┘
```

---

## Sections 細節

### Header 列（flex, items-start, justify-between）

| 區塊 | 內容 | 樣式 |
|------|------|------|
| 左 — Space badge | `space_name` | Badge variant="info"（自訂色，見 tokens） |
| 左 — sender | `sender_name` | `text-sm font-medium text-[--color-text-default] ml-2` |
| 中 — message_id | `spaces/…/messages/…` | `text-2xs font-mono text-[--color-text-muted]`，桌面才顯示 |
| 右 — observed_at | 相對時間（如「3 分鐘前」），hover 顯示完整 ISO tooltip | `text-xs text-[--color-text-muted]` |
| 右 — mentioned badge | `@我`（只在 mentioned=true 時顯示） | Badge variant="info" size="sm" |
| 右 — 動作按鈕 | Pending tab: Skip；Skipped tab: Unskip；Drafted tab: 無 | 見 Props |

### Body 列

- 預設截斷 100 字（字元，非 bytes），末尾加 `...`
- 若 body 為空字串 → 顯示 `(空訊息)` placeholder，樣式 `italic text-[--color-text-placeholder]`
- 有展開按鈕時：`<button data-testid="pending-row-expand">展開</button>`，點擊後顯示全文，按鈕文字改為「收合」
- body 換行：`whitespace-pre-wrap`（保留換行符）

### Skipped 原因列（只在 Skipped tab 顯示）

```
略過原因：[reason label badge]  by [skipped_by badge]
```

| skip_reason 值 | 顯示文字 |
|----------------|---------|
| `pure-ack` | 單純回應 |
| `overheard` | 無關對話 |
| `policy-redline` | 政策紅線 |
| `not-targeted` | 不相關（非對象） |
| `low-info` | 資訊不足 |
| `manual-other` | 手動其他 |

| skipped_by 值 | badge 顏色 token | 顯示文字 |
|---------------|------------------|---------|
| `skill` | `--color-skipped-skill-*` | 自動（skill） |
| `manual` | `--color-skipped-manual-*` | 手動 |
| `backend_auto` | `--color-skipped-auto-*` | 後台自動 |

---

## Props

| Prop | Type | Default | 說明 |
|------|------|---------|------|
| `message` | `PendingMessage` | 必填 | 訊息資料物件 |
| `tab` | `'pending' \| 'skipped' \| 'drafted'` | 必填 | 所在 tab，決定顯示欄位 |
| `onSkip` | `(messageId: string) => void` | - | Skip 按鈕 callback（Pending tab 才用） |
| `onUnskip` | `(messageId: string) => void` | - | Unskip 按鈕 callback（Skipped tab 才用） |

### PendingMessage 型別

```ts
interface PendingMessage {
  message_id: string;
  space_key: string;
  space_name: string;
  sender_name: string;
  body: string;
  observed_at: string;       // ISO 8601
  mentioned: boolean;
  skip_reason?: string;      // skip reason 值（Skipped tab 才有）
  skipped_by?: string;       // 'skill' | 'manual' | 'backend_auto'
}
```

---

## States

| State | 外觀 |
|-------|------|
| default | 白色背景，bottom border `--color-border-default` |
| hover | `bg-[--color-surface-subtle]`（transition 150ms） |
| skip-loading | Skip / Unskip 按鈕顯示 spinner，disabled；row opacity 0.7 |
| expanded-body | body 全文顯示，展開按鈕文字改「收合」 |

---

## Accessibility

- Row container：`<article role="article" data-testid="pending-row" data-message-id={message_id}>`
- Skip 按鈕：`aria-label="略過此訊息"` + `data-testid="pending-skip-btn"`
- Unskip 按鈕：`aria-label="復原略過"` + `data-testid="pending-unskip-btn"`
- 展開按鈕：`data-testid="pending-row-expand"` + `aria-expanded={isExpanded}`
- mentioned badge：`aria-label="此訊息 @你"`
- observed_at：`<time datetime={ISO}>`，`title={ISO}` 作 tooltip
- body 為空 placeholder：加 `aria-label="（空訊息）"`

---

## Keyboard 行為

- `Tab`：在 row 的互動元素間移動（展開按鈕 → Skip/Unskip 按鈕）
- `Enter` / `Space`：觸發聚焦的按鈕
- `Escape`：收合展開的 body（若已展開）

---

## Tailwind Classes

```tsx
// Row container
const rowClasses = [
  "group",
  "flex flex-col gap-2",
  "px-4 py-3",
  "border-b border-[--color-border-default]",
  "bg-[--color-surface-default]",
  "hover:bg-[--color-surface-subtle]",
  "transition-colors duration-150",
].join(" ");

// Header 列
const headerClasses = "flex items-start justify-between gap-2";

// Space name badge（inline style，沿用 Badge 元件 info variant）
// sender_name
const senderClasses = "text-sm font-medium text-[--color-text-default]";

// observed_at
const timeClasses = "text-xs text-[--color-text-muted] shrink-0";

// message_id（桌面才顯示）
const msgIdClasses = "hidden md:block text-2xs font-mono text-[--color-text-muted] select-all";

// body
const bodyClasses = [
  "text-sm text-[--color-text-secondary]",
  "leading-relaxed",
  "whitespace-pre-wrap break-words",
].join(" ");

// body placeholder
const bodyPlaceholderClasses = "text-sm italic text-[--color-text-placeholder]";

// 展開按鈕
const expandBtnClasses = [
  "text-xs text-[--color-text-link]",
  "hover:underline",
  "focus:outline-none focus:underline",
].join(" ");
```

---

## 使用的元件

| 元件 | 說明 |
|------|------|
| `Badge` | space_name badge（info variant）、mentioned badge、skipped-by badge |
| `Button` | Skip / Unskip 按鈕（size="sm"，variant="secondary" for Skip，variant="ghost" for Unskip） |
| `SkipReasonMenu` | Skip 按鈕觸發的 popover |
