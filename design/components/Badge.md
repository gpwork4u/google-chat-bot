# Badge

## 用途

行內標籤，用於顯示：
1. **Category Badge** — ApprovalCard 的 draft 分類（daily-chat / work-coordination / engineering / skip）
2. **Connection Badge** — Navbar 的 WebSocket 連線狀態（已連線 / 重連中 / 離線）
3. 一般狀態標籤（成功 / 警告 / 錯誤）

---

## Variants

### Category Badge

| Category            | Label    | 背景 token                       | 文字 token                      | 邊框 token                       |
|---------------------|----------|----------------------------------|----------------------------------|----------------------------------|
| `daily-chat`        | 閒聊     | `--color-category-chat-bg`       | `--color-category-chat-text`     | `--color-category-chat-border`   |
| `work-coordination` | 工作協調 | `--color-category-work-bg`       | `--color-category-work-text`     | `--color-category-work-border`   |
| `engineering`       | 工程     | `--color-category-eng-bg`        | `--color-category-eng-text`      | `--color-category-eng-border`    |
| `skip`              | 略過     | `--color-category-skip-bg`       | `--color-category-skip-text`     | `--color-category-skip-border`   |

### Connection Badge（Navbar 用）

| Status      | Label   | Dot Color                    | Text Color                     |
|-------------|---------|------------------------------|--------------------------------|
| `connected` | 已連線  | `bg-success-default`         | `text-text-secondary`          |
| `reconnecting` | 重連中 | `bg-warning-default`        | `text-text-secondary`          |
| `offline`   | 離線    | `bg-error-default`           | `text-text-secondary`          |

Connection Badge 使用 `dot + text` 格式（一個小圓點 + 狀態文字），不使用純色背景填滿。

### Status Badge（一般用）

| Variant   | 用途   | 背景                    | 文字                  |
|-----------|--------|-------------------------|-----------------------|
| `success` | 成功   | `bg-success-subtle`     | `text-success-strong` |
| `warning` | 警告   | `bg-warning-subtle`     | `text-warning-strong` |
| `error`   | 錯誤   | `bg-error-subtle`       | `text-error-strong`   |
| `info`    | 資訊   | `bg-info-subtle`        | `text-info-strong`    |

---

## Sizes

| Size | Padding（x / y）  | Font Size     | Radius        |
|------|-------------------|---------------|---------------|
| `sm` | `px-1.5` / `py-0.5` | `text-2xs`  | `rounded-xs`  |
| `md` | `px-2` / `py-0.5`   | `text-xs`   | `rounded-xs`  |

> Badge 通常使用 `sm`（12px 字），在空間受限的卡片環境保持密度。

---

## Props

| Prop       | Type                                                                    | Default     | 說明               |
|------------|-------------------------------------------------------------------------|-------------|--------------------|
| `variant`  | `'chat' \| 'work' \| 'eng' \| 'skip' \| 'success' \| 'warning' \| 'error' \| 'info'` | 必填 | 樣式 |
| `size`     | `'sm' \| 'md'`                                                          | `'sm'`      | 尺寸               |
| `dot`      | `boolean`                                                               | `false`     | 顯示前置 dot       |
| `children` | `React.ReactNode`                                                       | 必填        | 標籤文字           |

---

## Accessibility

- Badge 為純視覺元素，不可互動
- 若 Badge 是唯一傳達狀態的方式，需加 `aria-label`（例如：Connection Badge）
- Connection Badge: `<span role="status" aria-label="連線狀態：已連線">`

---

## Tailwind Classes

```tsx
// Category Badge 基礎
const categoryBase = [
  "inline-flex items-center gap-1",
  "px-1.5 py-0.5",
  "text-2xs font-medium tracking-wide",
  "rounded-xs border",
  "select-none",
].join(" ");

// Category 顏色 map
const categoryColors: Record<string, string> = {
  "daily-chat":
    "bg-[--color-category-chat-bg] text-[--color-category-chat-text] border-[--color-category-chat-border]",
  "work-coordination":
    "bg-[--color-category-work-bg] text-[--color-category-work-text] border-[--color-category-work-border]",
  engineering:
    "bg-[--color-category-eng-bg] text-[--color-category-eng-text] border-[--color-category-eng-border]",
  skip:
    "bg-[--color-category-skip-bg] text-[--color-category-skip-text] border-[--color-category-skip-border]",
};

// Connection Badge（dot style）
const dotColors: Record<string, string> = {
  connected:    "bg-[--color-success-default]",
  reconnecting: "bg-[--color-warning-default] animate-pulse",
  offline:      "bg-[--color-error-default]",
};
```

---

## 使用範例

```tsx
// Category badges
<Badge variant="chat">閒聊</Badge>
<Badge variant="work">工作協調</Badge>
<Badge variant="eng">工程</Badge>
<Badge variant="skip">略過</Badge>

// Connection Badge
<span role="status" aria-label={`連線狀態：${statusLabel}`}
  className="inline-flex items-center gap-1.5 text-xs text-[--color-text-muted]">
  <span className={`w-2 h-2 rounded-full ${dotColors[status]}`} aria-hidden="true" />
  {statusLabel}
</span>

// Status badge
<Badge variant="success">已送出</Badge>
<Badge variant="error">送出失敗</Badge>
```

---

## Category Label 對照

| category（API 值）  | 顯示 Label（繁中） |
|---------------------|-------------------|
| `daily-chat`        | 閒聊              |
| `work-coordination` | 工作協調          |
| `engineering`       | 工程              |
| `skip`              | 略過              |

此對照表供 ApprovalCard 元件使用，與 Gherkin `f002-approval-queue.feature` Scenario Outline 一致。
