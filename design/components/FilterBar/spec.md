# FilterBar

## 用途

`/sent` 頁的篩選工具列。提供 mode 單選、space 多選 chip、日期區間、全文搜尋四種篩選維度。在 mobile（< 768px）收合成 drawer，桌面端常駐頂部。

---

## 版面（桌面）

```
┌─────────────────────────────────────────────────────────────────┐
│  [全部 ▼]  [Team #frontend ×] [+更多]    [05/01-05/07]  [搜尋…] │
└─────────────────────────────────────────────────────────────────┘
```

### 各欄位說明

| 欄位 | 型別 | 說明 |
|------|------|------|
| Mode 選擇 | `<select>` 或 custom dropdown | `all` / `approved` / `auto`，單選 |
| Space 多選 | chip list + 新增按鈕 | 已選 space 以 chip 顯示，可各自刪除；「+更多」觸發 dropdown |
| 日期區間 | `<input type="date">` × 2 | 起始 / 結束日，預設 -7 天到今天 |
| 搜尋 | `<input type="search">` | debounce 300ms，對 sent_content 子字串搜尋 |

---

## Mobile 行為（< 768px）

- FilterBar 摺疊為單行 `[篩選 ▼]` 按鈕（顯示已啟用篩選數量徽章）
- 點擊後從底部滑入 drawer（`role="dialog"`，`aria-modal="true"`）
- Drawer 內垂直排列所有篩選項目
- Drawer 頂部有「完成」和「重置」按鈕

---

## Props

| Prop | Type | Default | 說明 |
|------|------|---------|------|
| `mode` | `'all' \| 'approved' \| 'auto'` | `'all'` | 已選模式 |
| `selectedSpaces` | `SpaceOption[]` | `[]` | 已選 space |
| `availableSpaces` | `SpaceOption[]` | 必填 | 可選 space 清單 |
| `dateFrom` | `string \| null` | -7 天 | 起始日期（ISO date） |
| `dateTo` | `string \| null` | 今天 | 結束日期（ISO date） |
| `searchQuery` | `string` | `''` | 搜尋字串 |
| `onModeChange` | `(mode: string) => void` | 必填 | Mode 變更 callback |
| `onSpacesChange` | `(spaces: SpaceOption[]) => void` | 必填 | Space 選擇變更 callback |
| `onDateChange` | `(from: string \| null, to: string \| null) => void` | 必填 | 日期區間變更 callback |
| `onSearchChange` | `(q: string) => void` | 必填 | 搜尋字串變更 callback（debounce 在元件內部處理） |
| `onReset` | `() => void` | 必填 | 重置所有篩選 |

### SpaceOption 型別

```ts
interface SpaceOption {
  space_id: string;
  space_name: string;
}
```

---

## 各欄位規格

### Mode Select

- `<select>` 元素包裝成自訂樣式（或 native select + custom arrow icon）
- 高度：`h-8`，內距：`px-2.5`
- 樣式：`text-sm text-[--color-text-default] bg-[--color-surface-default] border border-[--color-border-default] rounded-sm`
- Focus：`focus:outline-none focus:border-[--color-border-focus] focus:ring-1 focus:ring-[--color-border-focus]`
- Options：「全部」/ 「已審核」/ 「自動」
- 搭配 `<label>` 或 `aria-label="送出方式篩選"`

### Space 多選

- 已選 space 以 `KeywordChip` 元件（見 `KeywordChip/spec.md`）呈現，樣式可複用
- 「+ 空間」按鈕：`Button` variant="ghost" size="sm"，觸發 dropdown
- Dropdown：清單選項加 checkbox，已選項目打勾；使用 `role="listbox"` + `role="option"` + `aria-multiselectable="true"`
- 已選空間上限：無限制，超過一行則 wrap

### 日期區間

- `<input type="date">` × 2，mobile 使用系統原生 date picker
- 高度：`h-8`，樣式同 Mode Select
- 搭配 visually-hidden label：「起始日期」/ 「結束日期」
- 驗證：to < from 時 border 轉 error 色，不送出

### 搜尋欄

- `<input type="search">` + `<SearchIcon />` 前綴圖示
- Placeholder：「搜尋送出內容…」
- Debounce：300ms（元件內部 useEffect + setTimeout）
- 清除按鈕：輸入有值時右側顯示 `<X />` 圖示按鈕，`aria-label="清除搜尋"`
- 高度：`h-8`，最小寬度：`min-w-[160px]`，桌面 `w-48`

---

## 活躍篩選計數（Active Filter Count）

```
// 計算規則：
// mode !== 'all' → +1
// selectedSpaces.length > 0 → +1
// dateFrom / dateTo 非預設值 → +1
// searchQuery !== '' → +1
```

Mobile 按鈕顯示計數徽章（Badge 元件，variant primary，size xs）。

---

## Accessibility

- FilterBar 整體：`role="search"` + `aria-label="篩選記錄"`
- Mode select：`<label htmlFor>` 或 `aria-label`
- 日期 inputs：各有 `<label htmlFor>` + `sr-only`
- 搜尋欄：`<label htmlFor="sent-search" className="sr-only">搜尋送出內容</label>`
- Space dropdown：`role="listbox"` + `aria-multiselectable="true"`，每個 option `aria-selected`
- Mobile drawer：`role="dialog"` + `aria-modal="true"` + `aria-label="篩選設定"` + focus trap

---

## Tailwind Classes

```tsx
// FilterBar 容器（桌面）
const barClasses = [
  "flex flex-wrap items-center gap-2",
  "px-4 py-2",
  "bg-[--color-surface-default]",
  "border-b border-[--color-border-default]",
  "sticky top-0 z-[--z-sticky]",
].join(" ");

// Mode select
const selectClasses = [
  "h-8 px-2.5 pr-7",
  "text-sm text-[--color-text-default]",
  "bg-[--color-surface-default]",
  "border border-[--color-border-default] rounded-sm",
  "appearance-none cursor-pointer",
  "focus:outline-none focus:border-[--color-border-focus] focus:ring-1 focus:ring-[--color-border-focus]",
].join(" ");

// 搜尋欄
const searchClasses = [
  "h-8 pl-7 pr-2.5",
  "text-sm text-[--color-text-default] placeholder:text-[--color-text-placeholder]",
  "bg-[--color-surface-default]",
  "border border-[--color-border-default] rounded-sm",
  "focus:outline-none focus:border-[--color-border-focus] focus:ring-1 focus:ring-[--color-border-focus]",
  "w-48 min-w-[160px]",
].join(" ");

// Mobile 篩選按鈕
const mobileFilterBtnClasses = [
  "md:hidden",
  "flex items-center gap-1.5 h-8 px-3",
  "text-sm text-[--color-text-secondary]",
  "bg-[--color-surface-default]",
  "border border-[--color-border-default] rounded-sm",
].join(" ");
```

---

## 使用範例

見 `example.tsx`
