# SourceMessageList

## 用途

顯示 fact 的來源訊息列表（由哪些聊天訊息萃取而來）。  
可折疊，預設收合；展開後 lazy load 對應訊息（`GET /api/messages?id_in=...`）。

testid:
- toggle button: `candidate-fact-source-toggle`（`<button>`）
- 訊息列表: `candidate-fact-source-list`（`<ul>`）

---

## Props

| Prop | Type | Required | 說明 |
|------|------|----------|------|
| `factId` | `string` | 是 | fact id，用於 unique id（aria-controls） |
| `sourceMessageIds` | `number[]` | 是 | source_message_ids 陣列 |
| `data-testid-toggle` | `string` | 否，預設 `"candidate-fact-source-toggle"` | toggle button testid |
| `data-testid-list` | `string` | 否，預設 `"candidate-fact-source-list"` | list testid |

---

## Message 資料結構

```ts
interface SourceMessage {
  id: number;
  sender_name: string;
  observed_at: string;  // ISO 8601
  body: string;
}
```

---

## States

| State | 描述 |
|-------|------|
| `collapsed` | 預設狀態，只顯示 toggle button（顯示來源數量） |
| `loading` | 展開後，API 呼叫中：skeleton 列表 |
| `loaded` | 訊息載入完畢，顯示完整列表 |
| `empty` | sourceMessageIds 為空陣列：不顯示 toggle（或顯示「無來源」） |
| `error` | API 失敗：list 內顯示 error 說明 |

---

## 版面規格

### Toggle Button（收合時）

```
┌──────────────────────────────────────────┐
│  [ChevronRight]  來源訊息（3 則）         │  ← text-xs text-muted
└──────────────────────────────────────────┘
```

- icon：`ChevronRight`（收合）/ `ChevronDown`（展開），Lucide，`size={12}`，`aria-hidden="true"`
- 文字：`來源訊息（N 則）`，N = `sourceMessageIds.length`
- 樣式：`inline-flex items-center gap-1 text-xs text-[--color-text-muted] hover:text-[--color-text-secondary]`
- 觸控目標：`min-h-[44px] py-2`（padding 補足高度）

### 列表展開（loaded）

```
┌─────────────────────────────────────────────────────┐
│  [ChevronDown]  來源訊息（3 則）                     │
│  ─────────────────────────────────────────────────  │
│  ┌───────────────────────────────────────────────┐  │
│  │  Alice  ·  2026-05-01 09:00                  │  │
│  │  這個 space 主要做 Google Chat AI 整合...      │  │
│  ├───────────────────────────────────────────────┤  │
│  │  Bob  ·  2026-05-01 09:05                    │  │
│  │  對，後端用 Go + Gin，DB 是 PG                │  │
│  ├───────────────────────────────────────────────┤  │
│  │  Alice  ·  2026-05-01 09:10                  │  │
│  │  ...                                         │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

- `<ul>` 容器：`data-testid="candidate-fact-source-list"`, `max-h-[200px] overflow-y-auto`
- 每筆 `<li>`：`border-b border-[--color-border-default] last:border-b-0 px-3 py-2`
- sender_name：`text-xs font-medium text-[--color-text-default]`
- observed_at：`text-xs text-[--color-text-muted] ml-1`（相對時間 + `title` 屬性放完整時間）
- body：`text-xs text-[--color-text-secondary] mt-1 line-clamp-3`（超長省略）
- 整個列表背景：`bg-[--color-surface-subtle] rounded-[--radius-sm] mt-2`

### Loading State（skeleton）

```tsx
// 3 個 skeleton 列（每個 sourceMessageId 一個）
<ul>
  {[...Array(Math.min(sourceMessageIds.length, 3))].map((_, i) => (
    <li key={i} className="px-3 py-2 animate-pulse space-y-1">
      <div className="h-3 bg-[--color-surface-muted] rounded w-24" />
      <div className="h-3 bg-[--color-surface-muted] rounded w-full" />
    </li>
  ))}
</ul>
```

---

## Lazy Load 機制

1. 初始 `isOpen = false`，**不發 API request**
2. 點擊 toggle：`setIsOpen(true)` → 首次 open 時發 `GET /api/messages?id_in={ids.join(',')}`
3. 結果 cache 在 component state，重複展開不重打 API
4. 若 `sourceMessageIds` 為空（`[]`）：不顯示 toggle，或顯示「無來源訊息」（`text-xs text-muted`）

---

## Accessibility

- toggle button：
  - `aria-expanded={isOpen}`
  - `aria-controls={`source-list-${factId}`}`
  - `aria-label="展開來源訊息"`
- `<ul>`：`id={`source-list-${factId}`}` 與 `aria-controls` 對應
- loading：`aria-busy="true"` on `<ul>`
- 鍵盤：Enter / Space 觸發 toggle

---

## 動畫

展開 / 收合：`transition-all duration-[--duration-normal] ease-[--ease-out]`  
通過 `max-h` 動畫（from `max-h-0 overflow-hidden` to `max-h-[200px]`）。

---

## 使用範例

見 `example.tsx`
