# SyncProgress

## 用途

Chrome extension popup 中的歷史同步進度顯示區塊。在同步進行中（status=running）時顯示 spinner + 計數；同步完成或失敗後顯示狀態 badge；使用 toast 提示最終結果。

---

## 版面（在 extension popup 280px 寬容器內）

### 同步進行中

```
┌─────────────────────────────────┐
│ ⏳ 同步中...                    │  ← spinner（14px）+ 文字
│    152 則已讀取（8 則重複）     │  ← 計數文字（xs，muted）
│    [進行中] badge               │  ← warning variant badge
└─────────────────────────────────┘
```

### 同步完成

```
┌─────────────────────────────────┐
│ ✓ 同步完成                      │  ← Check icon + 文字（success 色）
│   新增 144 則・重複 8 則         │  ← 明細文字（xs）
│   [完成] badge                  │
└─────────────────────────────────┘
```

### 同步失敗

```
┌─────────────────────────────────┐
│ ✕ 同步失敗                      │  ← AlertCircle icon + 文字（error 色）
│   請重試                        │
│   [失敗] badge                  │
└─────────────────────────────────┘
```

---

## Props

| Prop | Type | Default | 說明 |
|------|------|---------|------|
| `status` | `'running' \| 'completed' \| 'failed' \| null` | 必填 | null 表示尚未 sync，不顯示此元件 |
| `totalMessages` | `number` | `0` | 目前已讀取訊息數（running 時使用） |
| `duplicateMessages` | `number` | `0` | 重複訊息數（running/completed 時使用） |
| `insertedMessages` | `number` | `0` | 新增訊息數（completed 時使用） |
| `spaceKey` | `string \| null` | `null` | 若是單一 space sync，顯示 space 名稱 |

---

## States

| status | 圖示 | 主文字 | 副文字 | Badge |
|--------|------|--------|--------|-------|
| `running` | `<Loader2>` 旋轉 | `同步中...` | `{total} 則已讀取（{dup} 則重複）` | warning「進行中」 |
| `completed` | `<Check>` | `同步完成` | `新增 {ins} 則・重複 {dup} 則` | success「完成」 |
| `failed` | `<AlertCircle>` | `同步失敗` | `請重試` | error「失敗」 |

---

## Testid

| testid | 元素 | 說明 |
|--------|------|------|
| `sync-progress` | `<div>` | SyncProgress 容器 |
| `sync-progress-status` | `<span>` | 狀態文字（同步中.../同步完成/同步失敗） |
| `sync-progress-count` | `<p>` | 計數文字 |
| `sync-progress-badge` | `<span>` | 狀態 badge（進行中/完成/失敗） |

---

## Accessibility

- Container：`role="status"` + `aria-live="polite"`（讓螢幕閱讀器播報狀態更新）
- running 時：`aria-label="正在同步歷史訊息，已讀取 {total} 則"`
- completed：`aria-label="同步完成，新增 {ins} 則"`
- failed：`aria-label="同步失敗，請重試"` + `role="alert"` 改用（即時讀出）
- Loader2 spinner：`aria-hidden="true"` + CSS `animate-spin`

---

## Tailwind Classes

```tsx
// 容器（在 popup 分隔線之後）
const progressClasses = [
  "flex flex-col gap-1.5",
  "px-3 py-2.5",
  "bg-[--color-surface-subtle]",
  "rounded-md",
  "border border-[--color-border-default]",
].join(" ");

// status 圖示 + 文字列
const statusRowClasses = "flex items-center gap-2";

// running 狀態顏色
const runningTextClasses = "text-sm font-medium text-[--color-warning-strong]";
// completed 狀態顏色
const completedTextClasses = "text-sm font-medium text-[--color-success-strong]";
// failed 狀態顏色
const failedTextClasses = "text-sm font-medium text-[--color-error-strong]";

// 計數文字
const countClasses = "text-xs text-[--color-text-muted] pl-5";  // pl-5 對齊 icon 右邊
```

---

## 使用的元件

| 元件 | 說明 |
|------|------|
| `Badge` | 狀態 badge（warning/success/error variant） |
| Lucide `Loader2` | 旋轉 spinner（running 狀態） |
| Lucide `Check` | 完成圖示 |
| Lucide `AlertCircle` | 失敗圖示 |
