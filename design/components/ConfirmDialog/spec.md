# ConfirmDialog

## 用途

用於不可復原的破壞性操作的確認步驟，包括：
- **Reject fact**（candidates 頁）：確認後 POST `/api/space-facts/{id}/reject`
- **Delete fact**（詳情頁）：確認後 DELETE `/api/space-facts/{id}`
- **Batch reject**（candidates 頁）：確認後批次 POST reject

此元件沿用既有 `<dialog>` HTML 元素，不依賴第三方 modal 庫。

---

## Props

| Prop | Type | Required | 說明 |
|------|------|----------|------|
| `isOpen` | `boolean` | 是 | 控制 dialog 顯示 |
| `title` | `string` | 是 | dialog 標題（清楚說明操作） |
| `description` | `string` | 是 | 操作說明與不可復原警告 |
| `confirmLabel` | `string` | 否，預設 `"確定"` | 確認按鈕文字（`BUTTON.confirm`） |
| `cancelLabel` | `string` | 否，預設 `"取消"` | 取消按鈕文字（`BUTTON.cancel`） |
| `variant` | `'danger' \| 'warning'` | 否，預設 `'danger'` | 確認按鈕的顏色語意 |
| `isLoading` | `boolean` | 否，預設 `false` | 操作進行中（spinner） |
| `onConfirm` | `() => Promise<void> \| void` | 是 | 點擊確定的 callback |
| `onCancel` | `() => void` | 是 | 點擊取消或 Escape 的 callback |

---

## 版面規格

```
┌──────────────────────────────────────────────────────────────┐  ← overlay: fixed inset-0 bg-[--color-surface-overlay]
│                                                              │
│            ┌────────────────────────────────────┐           │
│            │  ⚠ 確定拒絕？                       │  ← title  │
│            │                                    │           │
│            │  此操作不可復原。被拒絕的 fact 無法  │  ← desc   │
│            │  再次核准，需重新執行 mining。        │           │
│            │                                    │           │
│            │  [取消]                [拒絕]       │  ← btns   │
│            └────────────────────────────────────┘           │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

- dialog 容器：`max-w-sm w-full mx-4` + `rounded-[--radius-lg] shadow-[--shadow-elevated]`
- 背景：`bg-[--color-surface-default]`
- padding：`p-6`
- Z-index：`z-[--z-modal]`
- Overlay：`fixed inset-0 bg-[--color-surface-overlay] z-[--z-overlay]`

---

## States

| State | 描述 |
|-------|------|
| `open` | dialog 可見，兩個 button 可互動 |
| `loading` | 點確定後：confirm btn loading spinner，cancel btn disabled，overlay 防止關閉 |
| `closed` | dialog 隱藏（`display: none` 或 unmount） |

---

## 樣式細節

### 標題

```css
text-base font-semibold text-[--color-text-default] mb-2
```

### 描述

```css
text-sm text-[--color-text-secondary] leading-[--leading-relaxed]
```

### 按鈕列

```
flex items-center justify-end gap-3 mt-5
```

取消按鈕：`variant="ghost"` size `md`  
確認按鈕：`variant="danger"` size `md`，loading 時 spinner + disabled

---

## Accessibility

- 使用原生 `<dialog>` 元素（自動管理 focus trap）
- `aria-labelledby`：指向 title 元素 id
- `aria-describedby`：指向 description 元素 id
- `aria-modal="true"`
- Escape 鍵：觸發 `onCancel`（`<dialog>` 原生支援 `cancel` event）
- 開啟時自動 focus 到取消按鈕（safe default：避免誤觸確認）
- 背景可點擊觸發 `onCancel`（overlay click handler）

---

## 動畫

dialog 進場：`animate-[--animate-fade-in]` + dialog 本身 `animate-[--animate-slide-up]`  
持續時間：`--duration-normal`（200ms）

---

## Tailwind Classes 範例

```tsx
// Overlay
const overlayClasses = [
  "fixed inset-0",
  "bg-[--color-surface-overlay]",
  "z-[--z-overlay]",
  "flex items-center justify-center p-4",
  "animate-[--animate-fade-in]",
].join(" ");

// Dialog container
const dialogClasses = [
  "relative",
  "max-w-sm w-full",
  "bg-[--color-surface-default]",
  "rounded-[--radius-lg]",
  "shadow-[--shadow-elevated]",
  "p-6",
  "z-[--z-modal]",
  "animate-[--animate-slide-up]",
].join(" ");
```

---

## 使用範例

見 `example.tsx`

---

## 標準 dialog 文字

### Reject fact
- title：`確定拒絕？`
- description：`此操作不可復原。被拒絕的 fact 無法再次核准，需重新執行 mining 才會產生新的 candidate。`
- confirmLabel：`拒絕`

### Delete fact
- title：`確定刪除？`
- description：`刪除後此 fact 將永久移除，無法復原。`
- confirmLabel：`刪除`

### Batch reject
- title：`確定拒絕全部？`
- description：`將拒絕此 space 的所有 N 筆 candidate facts，此操作不可復原。`
- confirmLabel：`全部拒絕`
