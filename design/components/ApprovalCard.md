# ApprovalCard

## 用途

Approval Queue 頁（`/approvals`）的核心卡片元件。每張卡片代表一個 pending draft，使用者可以直接 Approve / Edit / Reject。支援鍵盤快捷鍵操作，設計為 inbox-style 高密度排版。

---

## 卡片狀態（五種）

| State       | 描述                            | 視覺表現                                                              |
|-------------|---------------------------------|-----------------------------------------------------------------------|
| `pending`   | 預設，等待操作                  | 正常外觀，Approve / Edit Saved / Reject 三鈕可用                     |
| `approving` | 點擊 Approve 後，等待 API 回應  | Approve 按鈕 `loading`，其他兩鈕 `disabled`，卡片 `opacity-75`        |
| `sending`   | API 回應後，draft sender 處理中 | 整張卡片顯示 "送出中..." 覆蓋，`opacity-60`                          |
| `done`      | 成功送出 / 拒絕                 | 觸發 slide-out 動畫後從 list 移除                                     |
| `error`     | API 失敗                        | 顯示 error banner 在卡片內（紅色小字 + retry icon），不移除卡片       |

---

## 卡片版面（Wireframe）

```
┌─────────────────────────────────────────────────────────────────┐
│  ← FOCUSED 時：左側 2px 藍色 border-l highlight                  │
│                                                                   │
│  [space_name]                              [category badge]  [▲] │  ← 卡頭：space + category + 展開 context toggle
│  sender_name · created_at（relative time）                       │
│ ─────────────────────────────────────────────────────────────── │
│  context_messages（折疊，預設收合）                               │  ← 可展開的對話上下文
│  ▶ 顯示 3 則上下文                                               │
│ ─────────────────────────────────────────────────────────────── │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ draft textarea                                              │ │  ← 可編輯
│  │ （min-h: 64px，max-h: 200px，overflow-y auto）              │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  [debug ▶]（折疊，點擊展開 categorize_reason）                    │  ← debug 折疊區
│                                                                   │
│  [✓ Approve]   [⊙ Edit Saved]   [✕ Reject]     [j↓][k↑][↵][e][x] │  ← 按鈕列 + 快捷鍵 hint
└─────────────────────────────────────────────────────────────────┘
```

---

## 各區域細節

### 1. 卡頭（Header）

```
[space_name]                              [category badge]  [▲]
sender_name · created_at
```

- `space_name`：`text-sm font-semibold text-text-default`（space display_name）
- `sender_name`：`text-xs text-text-muted`
- `created_at`：relative time（"5 分鐘前"），`text-xs text-text-muted`，`title` attribute 放 ISO 8601 完整時間
- Category Badge：右對齊，使用 `Badge` 元件（spec: `Badge.md`）
- Context 展開 toggle：`<ChevronDown />` 圖示按鈕，`aria-expanded`

### 2. Context Messages（折疊區）

- 預設：`hidden`（collapsed）
- 展開後顯示最近 N 則對話（N 由 backend 提供）
- 每則：`sender_name`（粗） + 訊息內容（細），`text-xs`
- 最大高度 `max-h-[160px] overflow-y-auto`，避免極長對話撐爆卡片
- 背景：`bg-surface-muted rounded-sm px-3 py-2`

```
┌─────────────────────────────┐
│ Alice: 你那邊進度怎樣？      │
│ Bob:   快好了，明天給你       │
│ Alice: 好的感謝              │
└─────────────────────────────┘
```

### 3. Draft Textarea

- `<textarea>` 元素，`resize-none`（禁止手動 resize，自動跟內容增高）
- `min-h-[64px] max-h-[200px] overflow-y-auto`
- Auto-resize：使用 `onInput` 事件調整 `scrollHeight`（或用 react-textarea-autosize）
- 樣式：`text-sm text-text-default bg-surface-subtle border border-border-default rounded-sm px-3 py-2`
- Focus：`focus:outline-none focus:border-border-focus focus:ring-1 focus:ring-[--color-border-focus]`
- Label：`<label>` 設為 visually-hidden（`sr-only`），文字「草稿內容」

### 4. Debug 折疊區

- 折疊按鈕：`text-xs text-text-muted`，`aria-expanded`
- 展開後顯示：
  - `categorize_reason`（分類原因）
  - `context_source`（上下文來源）
- 背景：`bg-surface-muted rounded-xs px-3 py-2 text-xs font-mono`

### 5. 按鈕列

```
[✓ Approve]   [⊙ Edit Saved]   [✕ Reject]     [j↓ k↑ ↵ e x]
```

- 按鈕：`Button` 元件，size `sm`（`h-7`）
- 快捷鍵 hint：右對齊，`text-xs text-text-muted`，只在 focused 卡片顯示（keyboard user hint）
- 快捷鍵 hint 格式：`<kbd>` 元素，`bg-surface-muted border border-border-default rounded-xs px-1 text-2xs`

---

## Focus（鍵盤導航）

當此卡片為當前焦點（j/k 移動後）：
- 左側邊框：`border-l-2 border-l-[--color-border-focus]`（2px 藍線）
- 背景微亮：`bg-surface-subtle`
- 快捷鍵 hint 顯示

非焦點：
- `border-l-2 border-l-transparent`（保持佔位，避免 layout shift）

---

## Props

| Prop         | Type                                                          | Default     | 說明                                |
|--------------|---------------------------------------------------------------|-------------|-------------------------------------|
| `draft`      | `Draft`（見下方型別）                                         | 必填        | Draft 資料                          |
| `isFocused`  | `boolean`                                                     | `false`     | 是否為鍵盤焦點卡片                  |
| `status`     | `'pending' \| 'approving' \| 'sending' \| 'done' \| 'error'` | `'pending'` | 卡片狀態                            |
| `onApprove`  | `(id: string, content: string) => void`                       | 必填        | Approve callback                    |
| `onReject`   | `(id: string) => void`                                        | 必填        | Reject callback                     |
| `onSave`     | `(id: string, content: string) => void`                       | 必填        | Edit Saved callback                 |
| `onRetry`    | `(id: string) => void`                                        | —           | Error 狀態下 retry callback         |

### Draft 型別

```ts
interface Draft {
  id: string;
  space_id: string;
  space_name: string;
  sender_id: string;
  sender_name: string;
  original_message: string;
  context_messages: Array<{
    sender_name: string;
    content: string;
    created_at: string;
  }>;
  draft_content: string;
  category: "daily-chat" | "work-coordination" | "engineering" | "skip";
  debug: {
    categorize_reason: string;
    context_source: string;
  };
  created_at: string;  // ISO 8601
}
```

---

## 狀態視覺對照

### pending（正常）

```
┌─────────────────────────────────────────────────────┐  border-neutral-200
│ border-l-2 border-l-transparent                     │
│ Team #frontend          [閒聊 badge]  [▼]            │
│ Alice · 5 分鐘前                                     │
│ ───────────────────────────────────────────────────  │
│ ┌──────────────────────────────────────────────────┐ │
│ │ 好的，沒問題！                                    │ │
│ └──────────────────────────────────────────────────┘ │
│ [debug ▶]                                            │
│                                                      │
│ [✓ Approve] [⊙ Edit Saved] [✕ Reject]                │
└─────────────────────────────────────────────────────┘
```

### focused（j/k 移動到此）

```
┌─────────────────────────────────────────────────────┐  border-neutral-200
│ border-l-2 border-l-primary-500  bg-surface-subtle  │  ← 左側藍線 + 淡背景
│ Team #frontend          [閒聊 badge]  [▼]            │
│ Alice · 5 分鐘前                                     │
│ ─────────────────────────────────────────────────── │
│ ┌──────────────────────────────────────────────────┐ │
│ │ 好的，沒問題！                                    │ │
│ └──────────────────────────────────────────────────┘ │
│ [debug ▶]                                            │
│                                                      │
│ [✓ Approve] [⊙ Edit Saved] [✕ Reject]  [j↓][k↑][↵][e][x] │
└─────────────────────────────────────────────────────┘
```

### approving（送出中）

```
┌─────────────────────────────────────────────────────┐  opacity-75
│ Team #frontend          [閒聊 badge]                 │
│ Alice · 5 分鐘前                                     │
│ ─────────────────────────────────────────────────── │
│ ┌──────────────────────────────────────────────────┐ │
│ │ 好的，沒問題！                                    │ │
│ └──────────────────────────────────────────────────┘ │
│                                                      │
│ [⟳ 送出中...] [⊙ Edit Saved]disabled [✕ Reject]disabled │
└─────────────────────────────────────────────────────┘
```

### error（API 失敗）

```
┌─────────────────────────────────────────────────────┐
│ Team #frontend          [閒聊 badge]                 │
│ Alice · 5 分鐘前                                     │
│ ─────────────────────────────────────────────────── │
│ ┌──────────────────────────────────────────────────┐ │  ← error banner
│ │ ⚠ 送出失敗                           [↺ 重試]    │ │  text-error-strong bg-error-subtle
│ └──────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────┐ │
│ │ 好的，沒問題！                                    │ │
│ └──────────────────────────────────────────────────┘ │
│                                                      │
│ [✓ Approve] [⊙ Edit Saved] [✕ Reject]               │
└─────────────────────────────────────────────────────┘
```

---

## Tailwind Classes 範例

```tsx
// 卡片外框
const cardClasses = (isFocused: boolean, status: string) => [
  "relative rounded-md border border-[--color-border-default]",
  "bg-[--color-surface-default]",
  "shadow-[--shadow-card]",
  "transition-all duration-150",
  // focus 左側 highlight
  "border-l-2",
  isFocused
    ? "border-l-[--color-border-focus] bg-[--color-surface-subtle]"
    : "border-l-transparent",
  // 狀態透明度
  status === "approving" ? "opacity-75" : "",
  status === "sending"   ? "opacity-60" : "",
].filter(Boolean).join(" ");

// 卡片 padding
const cardPadding = "px-4 py-3";

// space_name
const spaceNameClasses = "text-sm font-semibold text-[--color-text-default] truncate";

// sender + time
const metaClasses = "text-xs text-[--color-text-muted]";

// textarea
const textareaClasses = [
  "w-full resize-none",
  "min-h-[64px] max-h-[200px] overflow-y-auto",
  "text-sm text-[--color-text-default]",
  "bg-[--color-surface-subtle]",
  "border border-[--color-border-default] rounded-sm",
  "px-3 py-2",
  "focus:outline-none focus:border-[--color-border-focus]",
  "focus:ring-1 focus:ring-[--color-border-focus]",
  "transition-colors duration-150",
].join(" ");

// kbd hint
const kbdClasses = [
  "inline-flex items-center justify-center",
  "h-4 px-1",
  "text-2xs text-[--color-text-muted]",
  "bg-[--color-surface-muted]",
  "border border-[--color-border-default]",
  "rounded-xs",
  "font-mono",
].join(" ");

// error banner
const errorBannerClasses = [
  "flex items-center justify-between gap-2",
  "px-3 py-2 mb-2",
  "text-xs text-[--color-error-strong]",
  "bg-[--color-error-subtle]",
  "rounded-xs",
].join(" ");
```

---

## 鍵盤快捷鍵 Hint 顯示邏輯

```tsx
// 只在 isFocused && 非 loading 時顯示
{isFocused && status === 'pending' && (
  <div className="flex items-center gap-1 text-xs text-[--color-text-muted]" aria-hidden="true">
    <kbd className={kbdClasses}>j</kbd><span>↓</span>
    <kbd className={kbdClasses}>k</kbd><span>↑</span>
    <kbd className={kbdClasses}>↵</kbd>
    <kbd className={kbdClasses}>e</kbd>
    <kbd className={kbdClasses}>x</kbd>
  </div>
)}
```

---

## Accessibility

- 整張卡片：`role="article"` + `aria-label={`${space_name}：來自 ${sender_name} 的草稿`}`
- Textarea：搭配 `<label htmlFor>` + `sr-only`
- Approve 按鈕：`aria-label={`核准 ${space_name} 的草稿`}`
- Reject 按鈕：`aria-label={`拒絕 ${space_name} 的草稿`}`
- Context 折疊：`aria-expanded` + `aria-controls`
- Debug 折疊：同上
- 鍵盤快捷鍵 hint：`aria-hidden="true"`（純視覺，快捷鍵邏輯另外實作）
- 所有圖示（Lucide）：`aria-hidden="true"`，文字說明由按鈕 label 承擔

---

## 動畫

- **卡片進場**：`animate-[--animate-slide-up]`
- **卡片移除**（done 狀態）：`opacity-0 -translate-y-1 scale-95`，150ms，transition 後從 DOM 移除
- **focus 切換**：`transition-colors duration-150`（border + background 漸變）
- **Error banner**：`animate-[--animate-fade-in]`

---

## 使用範例

```tsx
<ApprovalCard
  draft={draft}
  isFocused={focusedIndex === index}
  status={draftStatus[draft.id] ?? 'pending'}
  onApprove={(id, content) => handleApprove(id, content)}
  onReject={(id) => handleReject(id)}
  onSave={(id, content) => handleSave(id, content)}
  onRetry={(id) => handleRetry(id)}
/>
```
