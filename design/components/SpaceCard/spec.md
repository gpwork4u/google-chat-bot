# SpaceCard

## 用途

SettingsPage Space facts section 中，每個 Google Chat space 的摘要卡片。  
顯示 space 名稱、已核准 facts 數量，點擊連至 `/space-facts/{space_key}` 詳情頁。

testid: `space-facts-space-card`（element: `<article>`），附 `data-space-key` attribute

---

## Props

| Prop | Type | Required | 說明 |
|------|------|----------|------|
| `spaceKey` | `string` | 是 | space 唯一識別（對應 `data-space-key`） |
| `spaceName` | `string` | 是 | space 顯示名稱 |
| `approvedCount` | `number` | 是 | 已核准的 facts 數量 |
| `candidateCount` | `number` | 否，預設 `0` | 待審核 candidate 數量（>0 顯示 badge） |
| `href` | `string` | 否，自動計算 | 連結 URL，預設 `/space-facts/${spaceKey}` |
| `data-testid` | `string` | 否，預設 `"space-facts-space-card"` | testid |

---

## 版面規格

```
┌──────────────────────────────────────────────────────────────────┐
│  data-testid="space-facts-space-card"  data-space-key="abc-123"  │
│                                                                  │
│  Team #frontend                              [2 pending] →       │
│  已核准 5 筆 facts                                               │
└──────────────────────────────────────────────────────────────────┘
```

- 整張卡片為 `<article>` + `<a>` wrapper（讓整個卡片可點擊）
- 或：`<article>` 包含文字 + 獨立「查看」link（視 SEO 需求）
- 建議：整體 `<a>` wrap，hover 顯示背景色

### 尺寸
- width：`100%`（Grid 列決定）
- padding：`px-4 py-3`
- border：`border border-[--color-border-default] rounded-[--radius-md]`
- background：`bg-[--color-surface-default]`

### Hover State
- `hover:border-[--color-border-strong] hover:bg-[--color-surface-subtle]`
- transition：`transition-colors duration-[--duration-fast]`

### Focus State（keyboard nav）
- `focus:outline-none focus:ring-2 focus:ring-[--color-border-focus]`

---

## Content 細節

### Space name
```css
text-sm font-semibold text-[--color-text-default] truncate
```

### Approved count
```css
text-xs text-[--color-text-muted] mt-0.5
```
文字：`已核准 {N} 筆 facts`

### Pending badge（candidateCount > 0）
- 右上角：`<PendingBadge count={candidateCount} />`

### 箭頭 icon
- `<ChevronRight size={16} />` Lucide，right edge，`text-[--color-text-muted]`，`aria-hidden="true"`

---

## Accessibility

- `<article>` role
- `<a>` 有 `aria-label`：`"{spaceName}，已核准 {approvedCount} 筆 facts，查看詳情"`
- keyboard：Tab 進入 → Enter 跳頁
- pending badge 的數量資訊透過 `aria-label` 傳達給 screen reader

---

## Loading State（Skeleton）

```tsx
// 用於父元件 loading 時
<article className="px-4 py-3 border border-[--color-border-default] rounded-[--radius-md] animate-pulse">
  <div className="flex items-center justify-between">
    <div className="h-4 bg-[--color-surface-muted] rounded w-32" />
    <div className="h-4 bg-[--color-surface-muted] rounded w-8" />
  </div>
  <div className="h-3 bg-[--color-surface-muted] rounded w-24 mt-1.5" />
</article>
```

---

## 使用範例

見 `example.tsx`
