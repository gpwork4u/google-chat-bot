# Toast

## 用途

短暫的操作回饋通知。ApprovalCard 操作後顯示：
- Approve 後：「已送出」（success）
- Reject 後：「已丟棄」（info/neutral）
- API 錯誤時：「操作失敗，請重試」（error）

---

## Variants

| Variant   | 用途          | 背景                    | 文字                    | 圖示               |
|-----------|---------------|-------------------------|-------------------------|--------------------|
| `success` | 成功操作      | `bg-surface-default`    | `text-success-strong`   | `<CheckCircle />`（green） |
| `error`   | 操作失敗      | `bg-surface-default`    | `text-error-strong`     | `<XCircle />`（red） |
| `info`    | 中性資訊      | `bg-surface-default`    | `text-text-secondary`   | `<Info />`（blue） |

> 採用白底（淺色）/ 深色底（深色模式）一致的卡片樣式，保持簡潔。不使用彩色背景。

---

## 視覺規格

```
┌─────────────────────────────────────────────┐
│  [icon]  主要訊息文字                [close] │
└─────────────────────────────────────────────┘
```

- 位置：**右下角** `fixed bottom-4 right-4`，z-index: `var(--z-toast)`
- 寬度：`min-w-[240px] max-w-[360px]`
- Padding：`px-4 py-3`
- Radius：`rounded-md`
- Shadow：`shadow-elevated`
- Border：`border border-border-default`

---

## 動畫

- **進場**：`slide-in`（從右滑入）— 300ms ease-spring
- **出場**：`fade-out`（透明度降至 0）— 200ms ease-in
- **自動關閉**：3000ms 後觸發出場動畫
- 尊重 `prefers-reduced-motion`：動畫禁用時直接顯示/消失

---

## Props

| Prop       | Type                               | Default     | 說明                   |
|------------|------------------------------------|-------------|------------------------|
| `variant`  | `'success' \| 'error' \| 'info'`   | `'success'` | 樣式                   |
| `message`  | `string`                           | 必填        | 通知文字               |
| `duration` | `number`（ms）                     | `3000`      | 自動關閉時間，0 = 永久  |
| `onClose`  | `() => void`                       | —           | 關閉時 callback        |

---

## 實作建議

使用 React Portal + Stack：

```tsx
// web/src/components/ToastContainer.tsx
// 掛在 document.body，確保在所有元件之上

// Toast state 建議用 context hook 管理：
// const { addToast } = useToast()
// addToast({ variant: 'success', message: '已送出' })
```

---

## Accessibility

- `role="status"` — success/info（不打斷使用者）
- `role="alert"` — error（立即通知）
- `aria-live="polite"` — success/info
- `aria-live="assertive"` — error
- 關閉按鈕：`aria-label="關閉通知"`
- 不依賴顏色傳達狀態（同時有圖示 + 文字）

---

## 使用範例

```tsx
// Approve 後
addToast({ variant: 'success', message: '已送出' })

// Reject 後
addToast({ variant: 'info', message: '已丟棄' })

// API 失敗
addToast({ variant: 'error', message: '操作失敗，請重試', duration: 5000 })
```
