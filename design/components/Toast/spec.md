# Toast

## 用途

短暫的操作回饋通知。Sprint 1（ApprovalCard 操作後）和 Sprint 2（Settings 儲存後）共用。

**Sprint 1 使用場景：**
- Approve 後：「已送出」（success）
- Reject 後：「已丟棄」（info）
- API 錯誤時：「操作失敗，請重試」（error）

**Sprint 2 新增場景：**
- 設定儲存成功：「已儲存」（success）
- 設定儲存失敗：「儲存失敗，請重試」（error）
- PATCH API 失敗後：「無法連線，稍後再試」（error）

---

## Variants

| Variant | 用途 | 背景 | 文字 | 圖示色 |
|---------|------|------|------|--------|
| `success` | 成功操作 | `--color-toast-success-bg` | `--color-toast-success-text` | `--color-toast-success-icon` |
| `error` | 操作失敗 | `--color-toast-error-bg` | `--color-toast-error-text` | `--color-toast-error-icon` |
| `info` | 中性資訊 | `bg-neutral-800` | `text-neutral-100` | `text-info-default` |

> Sprint 2 起使用深色 surface（`--color-toast-success-bg` / `--color-toast-error-bg`），風格參考 Linear / GitHub 的 Toast 設計，在 light/dark mode 下視覺一致。

---

## 視覺規格

```
┌─────────────────────────────────────────────┐
│  [icon]  主要訊息文字                [close] │
└─────────────────────────────────────────────┘
```

- 位置：右下角 `fixed bottom-4 right-4`，`z-index: var(--z-toast)`
- 寬度：`min-w-[240px] max-w-[360px]`
- Padding：`px-4 py-3`
- Radius：`rounded-md`
- Shadow：`shadow-elevated`

**多個 toast 同時存在時：**
- 垂直 stack，間距 `gap-2`
- 最新的在最上方
- 最多同時顯示 3 個（超過自動移除最舊的）

---

## Props

| Prop | Type | Default | 說明 |
|------|------|---------|------|
| `variant` | `'success' \| 'error' \| 'info'` | `'success'` | 樣式 |
| `message` | `string` | 必填 | 通知文字 |
| `duration` | `number`（ms） | `3000` | 自動關閉時間，`0` = 永久 |
| `onClose` | `() => void` | — | 關閉時 callback |

---

## 動畫

- 進場：從右側 `translate-x-full → translate-x-0` + `opacity-0 → opacity-100`，300ms ease-out
- 出場：`opacity-100 → opacity-0`，200ms ease-in（同時縮小高度或 `translate-x`）
- 自動關閉：3000ms 後觸發出場動畫
- 尊重 `prefers-reduced-motion`：動畫禁用時直接顯示/消失

---

## Accessibility

- `role="status"` — success / info（不打斷使用者）
- `role="alert"` — error（立即通知，aria-live assertive）
- `aria-live="polite"` — success / info
- `aria-live="assertive"` — error
- 關閉按鈕：`aria-label="關閉通知"`
- 不依賴顏色傳達狀態（同時有圖示 + 文字）

---

## 實作建議

使用 React Portal + Context：

```tsx
// 建議的 hook API（engineer 實作）：
const { addToast } = useToast();
addToast({ variant: 'success', message: '已儲存' });
addToast({ variant: 'error', message: '儲存失敗，請重試', duration: 5000 });
addToast({ variant: 'info', message: '已丟棄' });
```

ToastContainer 掛在 `document.body`（React Portal）。

---

## Tailwind Classes

```tsx
// Toast 外框
const toastClasses = (variant: ToastVariant) => {
  const base = [
    "flex items-center gap-3",
    "min-w-[240px] max-w-[360px]",
    "px-4 py-3",
    "rounded-md",
    "shadow-[--shadow-elevated]",
  ];
  const variantMap = {
    success: "bg-[--color-toast-success-bg] text-[--color-toast-success-text]",
    error:   "bg-[--color-toast-error-bg] text-[--color-toast-error-text]",
    info:    "bg-[--color-neutral-800] text-[--color-neutral-100]",
  };
  return [...base, variantMap[variant]].join(" ");
};

// Toast 容器（fixed stack）
const containerClasses = [
  "fixed bottom-4 right-4",
  "flex flex-col-reverse gap-2",
  "z-[--z-toast]",
  "pointer-events-none",  // 讓容器本身不阻擋點擊，子 Toast 設 pointer-events-auto
].join(" ");

// 關閉按鈕
const closeBtnClasses = [
  "flex items-center justify-center ml-auto",
  "w-5 h-5",
  "opacity-60 hover:opacity-100",
  "transition-opacity duration-150",
  "focus:outline-none focus-visible:ring-1 focus-visible:ring-white",
  "rounded-sm",
  "pointer-events-auto",
].join(" ");
```

---

## 使用範例

見 `example.tsx`
