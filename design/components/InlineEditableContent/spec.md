# InlineEditableContent

## 用途

Fact content 的行內顯示 / 編輯切換元件。  
- **顯示模式**：`<div>` 渲染 markdown（prose 樣式）  
- **編輯模式**：`<textarea>` + 「儲存」/ 「取消」按鈕  

用於 `CandidateFactRow` 與 `SpaceFactRow`（詳情頁）。

testid: `candidate-fact-content`（element: `<div>` 或 `<textarea>`）

---

## Props

| Prop | Type | Required | 說明 |
|------|------|----------|------|
| `value` | `string` | 是 | 目前 content 文字（markdown） |
| `isEditing` | `boolean` | 是 | 是否處於編輯模式（由父元件控制） |
| `onSave` | `(newValue: string) => Promise<void>` | 是 | 儲存 callback，父元件負責 PATCH API |
| `onCancel` | `() => void` | 是 | 取消 callback（回到 isEditing=false） |
| `isSaving` | `boolean` | 否，預設 `false` | 儲存 API 呼叫中 |
| `data-testid` | `string` | 否，預設 `"candidate-fact-content"` | 注入 testid |

---

## Modes

### 顯示模式（isEditing = false）

```
┌─────────────────────────────────────────────────────┐
│ <div> markdown render                               │
│                                                     │
│  這個 space 使用 **Go** 作為後端語言，API 框架選用     │
│  Gin，資料庫是 PostgreSQL。                           │
│                                                     │
└─────────────────────────────────────────────────────┘
```

- element：`<div>` with `data-testid`
- markdown 渲染：使用既有 markdown parser（`react-markdown` 或專案已有的渲染函數）
- 最大高度：`max-h-[120px] overflow-y-auto`（超長 content 可捲動）
- 樣式：`text-sm text-[--color-text-default] leading-[--leading-relaxed]`
- prose 基礎：`prose prose-sm max-w-none`（若使用 tailwindcss-typography）

### 編輯模式（isEditing = true）

```
┌─────────────────────────────────────────────────────┐
│ <textarea>                                          │
│                                                     │
│  這個 space 使用 Go 作為後端語言...                   │
│                                                     │
├─────────────────────────────────────────────────────┤
│  [儲存]  [取消]                                     │
└─────────────────────────────────────────────────────┘
```

- element：`<textarea>` with `data-testid`（覆蓋 div 的位置）
- `min-h-[80px] max-h-[240px]`，auto-resize（跟內容高度）
- `resize-none`
- 右下角：`[儲存 btn]` + `[取消 btn]`（`data-testid="candidate-fact-save-btn"` / `"candidate-fact-cancel-btn"`）

---

## States

| State | 外觀 |
|-------|------|
| `display` | div markdown render，無邊框 |
| `editing` | textarea + save/cancel buttons |
| `saving` | save btn loading spinner，textarea disabled，cancel disabled |
| `error`（save 失敗） | 父元件顯示 error toast（`TOAST.factSaveFailed`），元件回到 editing state |

---

## Textarea 樣式

```css
/* 所有 classes */
w-full resize-none
min-h-[80px] max-h-[240px] overflow-y-auto
text-sm text-[--color-text-default]
bg-[--color-surface-subtle]
border border-[--color-border-default] rounded-[--radius-sm]
px-3 py-2
focus:outline-none focus:ring-2 focus:ring-[--color-border-focus]
transition-colors duration-[--duration-fast]
disabled:opacity-50
```

---

## Save / Cancel 按鈕

儲存按鈕（`data-testid="candidate-fact-save-btn"`）：
- variant: `primary`，size: `sm`
- text: `儲存`（`BUTTON.save`）
- loading 時：spinner + 文字不變，disabled

取消按鈕（`data-testid="candidate-fact-cancel-btn"`）：
- variant: `ghost`，size: `sm`
- text: `取消`（`BUTTON.cancel`）
- loading 時：disabled

按鈕列 layout：`flex items-center justify-end gap-2 mt-2`

---

## Accessibility

- `<label htmlFor>` + `sr-only`：「fact 內容編輯」
- textarea 有明確 `aria-label="fact 內容"`
- isSaving 時：`aria-busy="true"` on textarea
- focus 在 textarea 進入編輯模式後自動移到 textarea（`autoFocus`）
- Escape 鍵觸發 cancel（父元件 `onKeyDown` 處理）
- Enter 鍵：允許換行（textarea 預設行為），**不**觸發 save

---

## Tailwind Classes 範例

```tsx
const textareaClasses = [
  "w-full resize-none",
  "min-h-[80px] max-h-[240px] overflow-y-auto",
  "text-sm text-[--color-text-default]",
  "bg-[--color-surface-subtle]",
  "border border-[--color-border-default] rounded-[--radius-sm]",
  "px-3 py-2",
  "focus:outline-none focus:ring-2 focus:ring-[--color-border-focus]",
  "transition-colors duration-[--duration-fast]",
  "disabled:opacity-50",
].join(" ");

const displayClasses = [
  "text-sm text-[--color-text-default] leading-[--leading-relaxed]",
  "max-h-[120px] overflow-y-auto",
  "prose prose-sm max-w-none",
].join(" ");
```

---

## 使用範例

見 `example.tsx`
