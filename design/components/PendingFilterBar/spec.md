# PendingFilterBar

## 用途

`/pending` 頁的篩選工具列。提供 4 個篩選維度：Space 多選、Sender 文字搜尋、Body keyword 搜尋、Mentioned only checkbox。

與既有 `/sent` 頁的 `FilterBar` 元件概念相同，但針對 Pending viewer 的篩選需求客製。沿用相同視覺規格（sticky top bar / mobile 兩行 / focus style 一致）。

---

## 版面

### 桌面（>= 768px）：同一行四個控制項

```
┌────────────────────────────────────────────────────────────────────────────┐
│  [Space ▼]     [發話人...]     [關鍵字...]     [ ] 只看 @我                  │
└────────────────────────────────────────────────────────────────────────────┘
```

### Mobile（< 768px）：兩行排列

```
┌──────────────────────────────────┐
│  [Space ▼]        [發話人...]    │  ← 第一行：兩欄
│  [關鍵字...]    [ ] 只看 @我     │  ← 第二行：兩欄
└──────────────────────────────────┘
```

---

## 各控制項規格

### Space 多選 Dropdown

- 元素：`<select data-testid="space-filter">` 或 custom multi-select（延用 SentPage 命名）
- 允許多選（multi-select）；已選 space 以 chip 顯示或在 select label 顯示「N 個空間」
- 選項：從 `GET /api/spaces` 動態載入（space_name 顯示）
- Placeholder：`所有空間`
- 樣式：`h-8 px-2.5 text-sm border border-[--color-border-default] rounded-sm`
- aria-label：`空間篩選`

### Sender 輸入

- 元素：`<input type="search" data-testid="sender-filter">`
- Placeholder：`發話人...`
- Debounce：300ms
- 高度：`h-8`，最小寬度：`min-w-[120px]`
- aria-label：`依發話人篩選`

### Body 輸入

- 元素：`<input type="search" data-testid="body-filter">`
- Placeholder：`關鍵字...`
- Debounce：300ms
- 高度：`h-8`，最小寬度：`min-w-[120px]`
- aria-label：`依訊息內容篩選`

### Mentioned Only Checkbox

- 元素：`<input type="checkbox" data-testid="mentioned-filter">`
- Label：`只看 @我`（可點擊 label 切換）
- `<label>` 和 `<input>` 使用 `htmlFor / id` 關聯
- 觸控目標：整個 label 區域為 44pt（padding 補足）
- aria-label：`只顯示 @我的訊息`

---

## Props

| Prop | Type | Default | 說明 |
|------|------|---------|------|
| `selectedSpaces` | `string[]` | `[]` | 已選 space_key 陣列 |
| `availableSpaces` | `SpaceOption[]` | 必填 | 可選 space 清單 |
| `senderQuery` | `string` | `''` | Sender 篩選文字 |
| `bodyQuery` | `string` | `''` | Body 篩選文字 |
| `mentionedOnly` | `boolean` | `false` | 只看 @我 |
| `onSpacesChange` | `(keys: string[]) => void` | 必填 | Space 選擇變更 |
| `onSenderChange` | `(q: string) => void` | 必填 | Sender 輸入變更（debounce 在元件內） |
| `onBodyChange` | `(q: string) => void` | 必填 | Body 輸入變更（debounce 在元件內） |
| `onMentionedChange` | `(v: boolean) => void` | 必填 | Mentioned toggle |
| `onReset` | `() => void` | - | 重置所有篩選（可選） |

---

## Accessibility

- FilterBar 容器：`role="search"` + `aria-label="篩選 Pending 訊息"`
- 每個 input 有對應 `<label>` 或 `aria-label`
- Checkbox：`<label>` 包裹整個區域，觸控目標 >= 44px
- 全部 focus state：`focus:outline-none focus:border-[--color-border-focus] focus:ring-1 focus:ring-[--color-border-focus]`

---

## Tailwind Classes

```tsx
// 容器
const barClasses = [
  "flex flex-wrap items-center gap-2",
  "px-4 py-2",
  "bg-[--color-surface-default]",
  "border-b border-[--color-border-default]",
  "sticky top-[48px] z-[--z-sticky]",   // top: 48px = Navbar 高度
].join(" ");

// 桌面同一行；mobile 兩行（flex-wrap 自然換行）
// 每個控制項設定 min-width 確保 mobile 每行兩欄

// Input 共用樣式
const inputClasses = [
  "h-8 px-2.5",
  "text-sm text-[--color-text-default] placeholder:text-[--color-text-placeholder]",
  "bg-[--color-surface-default]",
  "border border-[--color-border-default] rounded-sm",
  "focus:outline-none focus:border-[--color-border-focus] focus:ring-1 focus:ring-[--color-border-focus]",
  "min-w-[120px] flex-1",
].join(" ");

// Checkbox label 區域
const checkboxLabelClasses = [
  "flex items-center gap-2",
  "text-sm text-[--color-text-secondary]",
  "cursor-pointer",
  "min-h-[44px] px-2",   // 確保觸控目標 >= 44px
].join(" ");
```

---

## Tab 切換時的 filter state 保留

F-013 AC-13 要求：切換 tab 時前一 tab 的 filter state 保留。
實作方式：filter state 存在 PendingPage component level，PendingFilterBar 為 controlled component（state 不在內部）。Tab 切換時 filterState 不 reset。

---

## 使用的元件

| 元件 | 說明 |
|------|------|
| `KeywordChip` | 多選 space chip（若改用 chip-list 多選） |
