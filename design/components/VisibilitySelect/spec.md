# VisibilitySelect

## 用途

讓使用者切換 fact 的 visibility（公開 / private / secret）。  
用於 `CandidateFactRow`（candidates 頁）與 `AddFactModal`。  
直接觸發 PATCH API 更新 visibility（不需要 Save 按鈕，改完即送出）。

testid: `candidate-fact-visibility-select`（element: `<select>`）

---

## Visibility 選項

| value | 顯示文字（`LABEL.*`） | 備注 |
|-------|----------------------|------|
| `public` | `公開`（`LABEL.visibilityPublic`） | 無特殊標示 |
| `private` | `private`（`LABEL.visibilityPrivate`） | 依 UX text，英文小寫 |
| `secret` | `secret`（`LABEL.visibilitySecret`） | 附 lock icon（Lucide `Lock`）|

---

## Props

| Prop | Type | Required | 說明 |
|------|------|----------|------|
| `value` | `'public' \| 'private' \| 'secret'` | 是 | 目前選取的 visibility |
| `onChange` | `(value: 'public' \| 'private' \| 'secret') => void` | 是 | 變更 callback（父元件負責 PATCH） |
| `disabled` | `boolean` | 否，預設 `false` | loading 或非編輯狀態時 disable |
| `aria-label` | `string` | 否，預設 `"可見性"` | screen reader label |
| `data-testid` | `string` | 否 | 外部注入 |

---

## States

| State | 外觀 |
|-------|------|
| `default` | 標準 select 外觀 |
| `disabled` | `opacity-50 cursor-not-allowed`，不可互動 |
| `focus` | `focus:outline-none focus:ring-2 focus:ring-[--color-border-focus]` |
| `loading`（parent） | `disabled={true}` + 父元件 spinner |

---

## 視覺規格

```
┌──────────────────────────┐
│  公開              [▼]   │  ← <select> 原生，h-8 sm:h-9
└──────────────────────────┘
```

- height：`h-8`（32px），確保 >= 觸控目標 44pt 的寬度由父容器補足
- padding：`px-2.5 py-1`
- font：`text-sm text-[--color-text-default]`
- border：`border border-[--color-border-default] rounded-[--radius-sm]`
- background：`bg-[--color-surface-default]`

> secret 選項的 lock icon 無法在原生 `<option>` 中渲染 SVG。  
> 解法：在 `<option>` 文字前加 unicode lock 符號 `🔒`（無障礙說明由 `aria-label` 補充）。  
> 若專案使用自訂 select（Radix `Select`），可用 `<SelectItem>` 插入 icon。

---

## Accessibility

- 必須有可見 `<label>` 或 `aria-label`（`"可見性"`）
- `<select>` 支援原生鍵盤導航（Arrow Keys 切換選項）
- `focus:ring-2` visible focus state
- secret 選項：`aria-label="secret（機密）"` 補充說明
- `disabled` 時 `aria-disabled="true"`（原生 disabled 會自動設定）

---

## Tailwind Classes 範例

```tsx
const selectClasses = [
  "h-8 px-2.5 py-1",
  "text-sm text-[--color-text-default]",
  "bg-[--color-surface-default]",
  "border border-[--color-border-default] rounded-[--radius-sm]",
  "focus:outline-none focus:ring-2 focus:ring-[--color-border-focus]",
  "transition-colors duration-[--duration-fast]",
  "disabled:opacity-50 disabled:cursor-not-allowed",
  "cursor-pointer",
].join(" ");
```

---

## 使用範例

見 `example.tsx`
