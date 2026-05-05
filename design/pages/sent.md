# Sent Log 頁（/sent）

## 對應 Feature

#19 F-003: Sent Log 頁

## Layout（桌面 >= 1024px）

```
┌──────────────────────────────────────────────────────────────────────┐
│ Navbar（height: 48px）                              [ConnectionBadge] │
├──────────────────────────────────────────────────────────────────────┤
│ FilterBar（sticky top）                                               │
│ [全部 ▼]  [Team #frontend ×]  [日期區間]  [搜尋送出內容…]    [重置]  │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│ ┌── Page Header ───────────────────────────────────────────────────┐ │
│ │ 已送出記錄                                    共 128 筆           │ │
│ └───────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│ ┌── Record List ────────────────────────────────────────────────── ┐ │
│ │  [SentRecordCard] — collapsed                                   │ │
│ │  [SentRecordCard] — expanded（點擊後）                           │ │
│ │  [SentRecordCard] — collapsed                                   │ │
│ │  ...                                                            │ │
│ │                                                                 │ │
│ │  [載入更多] 按鈕 / 自動 infinite scroll sentinel               │ │
│ └──────────────────────────────────────────────────────────────── ┘ │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

## Layout（Mobile < 768px）

```
┌─────────────────────────────────────────┐
│ Navbar                                  │
├─────────────────────────────────────────┤
│ [篩選 ▼ (2)]    [搜尋欄 —————————— ]   │  ← FilterBar mobile view
├─────────────────────────────────────────┤
│ 已送出記錄              共 128 筆        │
│ ─────────────────────────────────────── │
│  [SentRecordCard]                       │
│  [SentRecordCard]                       │
│  ...                                    │
│                                         │
│  [載入更多]                             │
└─────────────────────────────────────────┘
```

## 使用的元件

| 元件 | 位置 | Props 重點 |
|------|------|-----------|
| `Navbar` | 頂部 | 沿用 Sprint 1 Layout |
| `FilterBar` | sticky 次頂部 | `mode`, `selectedSpaces`, `dateFrom/To`, `searchQuery`, `onXxx` |
| `SentRecordCard` | 列表項目 | `record`, `defaultExpanded=false`, `onExpand` |
| `Toast` | 右下角 fixed | 透過 `useToast()` hook 觸發 |

## 頁面狀態

| 狀態 | 描述 | 顯示方式 |
|------|------|---------|
| `loading`（初始） | 首次載入中 | 骨架屏（3 個 SentRecordCard skeleton） |
| `loading-more` | 載入下一頁 | 底部 spinner |
| `empty` | 無資料 | 置中空狀態圖示 + 「近 7 天沒有送出記錄」文字 |
| `empty-filtered` | 篩選後無資料 | 置中「沒有符合條件的記錄」+ 「重置篩選」按鈕 |
| `error` | API 失敗 | 置中 error banner + 重試按鈕 |

### Skeleton（載入中）

每個 skeleton card 的結構：
```tsx
<div className="animate-pulse rounded-md border border-[--color-border-default] px-4 py-3">
  <div className="flex items-center gap-2 mb-2">
    <div className="h-4 bg-[--color-surface-muted] rounded w-32" />
    <div className="h-4 bg-[--color-surface-muted] rounded w-12 ml-auto" />
  </div>
  <div className="h-3 bg-[--color-surface-muted] rounded w-48 mb-2" />
  <div className="h-3 bg-[--color-surface-muted] rounded w-full mb-1" />
  <div className="h-3 bg-[--color-surface-muted] rounded w-3/4" />
</div>
```

## 響應式行為

| 斷點 | 行為 |
|------|------|
| `>= 1024px` | FilterBar 全寬顯示（mode + space + date + search 一行） |
| `768-1023px` | FilterBar 兩行（上：mode+date，下：space+search） |
| `< 768px` | FilterBar 收合：篩選按鈕 + 搜尋欄；其餘移入 drawer |

## 分頁（Infinite Scroll）

- 使用 `IntersectionObserver` 監測底部 sentinel 元素
- Sentinel 進入視窗 → 觸發 `GET /api/sent?cursor=...`
- 載入中：sentinel 位置顯示 spinner（`<Loader2 className="animate-spin" />`）
- 已到最後一頁：顯示「已載入全部記錄」文字

## 頁面 Spacing

- 頁面最大寬度：`max-w-3xl mx-auto`（約 768px），留呼吸空間
- 卡片間距：`space-y-2`（8px）
- 頁面 padding：`px-4 sm:px-6 lg:px-8`，`pt-4 pb-16`

## Keyboard Navigation

- `Tab`：在 FilterBar 控制項和 SentRecordCard toggle 間切換
- `Enter` / `Space`：展開/收合 SentRecordCard
- `Escape`：收合展開中的 SentRecordCard（若有需要）
