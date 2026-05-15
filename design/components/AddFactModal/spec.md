# AddFactModal

## 用途

手動新增一筆 space fact（manual create）。  
從 `/space-facts/{space_key}` 詳情頁的「新增 fact」按鈕觸發。  
送出後 POST `/api/space-facts`（`status: approved`，`visibility` 預設 `private`）。

觸發按鈕 testid: `space-facts-add-btn`（`<button>`）

---

## Props

| Prop | Type | Required | 說明 |
|------|------|----------|------|
| `isOpen` | `boolean` | 是 | 控制 modal 顯示 |
| `spaceKey` | `string` | 是 | 要新增 fact 的 space |
| `onSave` | `(fact: NewFact) => Promise<void>` | 是 | 送出 callback |
| `onClose` | `() => void` | 是 | 關閉 modal callback |

### NewFact 型別

```ts
interface NewFact {
  space_key: string;
  category: Category;
  content: string;
  visibility: Visibility;   // 預設 "private"
}
```

---

## 版面規格

```
┌────────────────────────────────────────────────────────────┐  ← overlay
│                                                            │
│   ┌────────────────────────────────────────────────────┐  │
│   │  新增 fact                                   [×]   │  │  ← header
│   ├────────────────────────────────────────────────────┤  │
│   │                                                    │  │
│   │  分類                                              │  │  ← category select
│   │  [產品 ▼]                                         │  │
│   │                                                    │  │
│   │  內容                                              │  │  ← content textarea
│   │  ┌──────────────────────────────────────────────┐  │  │
│   │  │ （請輸入 fact 內容，支援 markdown...）         │  │  │
│   │  └──────────────────────────────────────────────┘  │  │
│   │                                                    │  │
│   │  可見性                                            │  │  ← visibility select
│   │  [private ▼]  ← 預設 private                      │  │
│   │                                                    │  │
│   ├────────────────────────────────────────────────────┤  │
│   │  [取消]                    [新增 fact]             │  │  ← footer buttons
│   └────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

---

## Form Fields

### 分類（category）
- `<label>` + `<select>`
- 選項：5 種 category（對應 `LABEL.category*` 文字）
- 預設：`product`

### 內容（content）
- `<label>` + `<textarea>`
- placeholder：`請輸入 fact 內容（支援 markdown）`
- `min-h-[100px] max-h-[300px]`，auto-resize
- 必填驗證：送出前確認非空白

### 可見性（visibility）
- `<label>` + `<VisibilitySelect />`
- 預設：`private`（business rule：manual fact 預設 private）

---

## States

| State | 描述 |
|-------|------|
| `idle` | 表單可填寫，Submit btn 可用（content 非空時） |
| `saving` | API 進行中：Submit btn loading + disabled，其他欄位 disabled |
| `error` | 送出失敗：toast `TOAST.factSaveFailed`，表單可重試 |

---

## Validation

- `content` 不可為空或純空白 → Submit btn disabled
- 無其他 client-side validation（server 回錯 → toast error）

---

## Accessibility

- 使用原生 `<dialog>` 元素（focus trap）
- `aria-labelledby`：指向「新增 fact」標題
- `aria-modal="true"`
- Escape 鍵關閉
- 開啟時 focus 到第一個表單欄位（category select）
- 所有 `<input>` / `<select>` / `<textarea>` 有對應 `<label>`

---

## Modal 尺寸

- `max-w-lg w-full mx-4`
- `max-h-[90vh] overflow-y-auto`（高度超出時可捲動）

---

## 使用範例

見 `example.tsx`
