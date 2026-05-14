# Settings 頁（/settings）

## 對應 Feature

#20 F-004: Settings 頁
#87 F-004-fe1: Sprint 6 — popup sync buttons + Pending 訊息連結（AC-CR002-S1 ~ S3）

---

## Sprint 6 增補：Navbar / 頁面 Nav 加 Pending 連結

F-013 AC 要求 Settings 頁提供「Pending 訊息檢視」入口連結，點擊跳至 `/pending`。

### 實作位置

加在 **Settings 頁 Page Header 下方**，以一個 hint banner 顯示（不修改 Navbar 全域 nav，避免 sprint 6 外的影響）。

```tsx
{/* Settings 頁 Pending hint — Sprint 6 新增 */}
<div className="flex items-center justify-between py-2.5 px-3 mb-4 bg-[--color-info-subtle] border border-[--color-info-default]/30 rounded-md text-sm">
  <span className="text-[--color-info-strong]">
    想檢視等待處理的訊息？
  </span>
  <a
    href="/pending"
    className="flex items-center gap-1 text-[--color-text-link] font-medium hover:underline focus:outline-none focus:underline"
    aria-label="前往 Pending 訊息檢視頁"
  >
    Pending 訊息檢視
    <ChevronRight size={14} aria-hidden="true" />
  </a>
</div>
```

此 hint banner 僅在 `/settings` 頁顯示，不影響 Navbar。

### 若 Navbar 需加 nav item（Sprint 7 以後）

記錄在 `design/open-questions.md`，本 sprint 不動 Navbar。

---

## Layout（桌面 >= 1024px）

```
┌──────────────────────────────────────────────────────────────────────┐
│ Navbar（height: 48px）                              [ConnectionBadge] │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│ ┌── Page Header ───────────────────────────────────────────────────┐ │
│ │ 設定                                                              │ │
│ └──────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│ ┌── Section: Global ─────────────────────────────────────────────┐ │
│ │ 全域設定                                                         │ │
│ │ ─────────────────────────────────────────────────────────────── │ │
│ │  Auto 模式                               [toggle: OFF]          │ │
│ │  讓 AI 自動送出所有訊息，不需逐筆審核                             │ │
│ │ ─────────────────────────────────────────────────────────────── │ │
│ │  訊息新鮮度（分鐘）                                              │ │
│ │  [  30  ] 分鐘內的訊息才會觸發草稿                              │ │
│ │ ─────────────────────────────────────────────────────────────── │ │
│ │  Debug 模式                              [toggle: OFF]          │ │
│ └──────────────────────────────────────────────────────────────── ┘ │
│                                                                      │
│ ┌── Section: Channels ───────────────────────────────────────────┐ │
│ │ 空間設定                                                         │ │
│ │ ─────────────────────────────────────────────────────────────── │ │
│ │  [ChannelCard — Team #frontend]                                 │ │
│ │  [ChannelCard — Project Alpha]                                  │ │
│ │  ...                                                            │ │
│ └──────────────────────────────────────────────────────────────── ┘ │
│                                                                      │
│ ┌── Section: Profile ────────────────────────────────────────────┐ │
│ │ 個人特質                                                         │ │
│ │ ─────────────────────────────────────────────────────────────── │ │
│ │  [ProfileFactGroup — 公開]                                      │ │
│ │  [ProfileFactGroup — 私人]                                      │ │
│ │  [ProfileFactGroup — 機密]                                      │ │
│ └──────────────────────────────────────────────────────────────── ┘ │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

## Layout（Mobile < 768px）

```
┌─────────────────────────────────────────┐
│ Navbar                                  │
├─────────────────────────────────────────┤
│ 設定                                    │
│ ─────────────────────────────────────── │
│ [Tab: 全域]  [Tab: 空間]  [Tab: 個人]   │  ← 分頁 Tab（mobile 改用 tab 切換）
│ ─────────────────────────────────────── │
│ （目前選取的 Section 內容）              │
└─────────────────────────────────────────┘
```

> Mobile（< 768px）改用 Tab 切換三個 Section，避免過長 scroll。桌面版維持垂直線性排版。

## 使用的元件

| 元件 | Section | Props 重點 |
|------|---------|-----------|
| `Navbar` | 頂部 | 沿用 Sprint 1 Layout |
| `Toggle`（inline） | Global | `role="switch"` + `aria-checked` |
| `NumberInput`（inline） | Global | freshness_window_minutes，1-1440 |
| `ChannelCard` | Channels | `space`, `onXxxChange` |
| `ProfileFactGroup` | Profile | `visibility`, `facts`, `onEdit`, `onDelete`, `onAdd` |
| `Toast` | 右下角 fixed | 透過 `useToast()` hook 觸發（儲存後） |

## Global Section 元件細節

### Auto 模式 Toggle

```tsx
<div className="flex items-center justify-between py-3 border-b border-[--color-border-default]">
  <div>
    <p className="text-sm font-medium text-[--color-text-default]">Auto 模式</p>
    <p className="text-xs text-[--color-text-muted] mt-0.5">
      讓 AI 自動送出所有訊息，不需逐筆審核
    </p>
  </div>
  <Toggle
    checked={settings.auto_mode}
    onChange={(val) => handlePatch({ auto_mode: val })}
    ariaLabel="全域 Auto 模式"
  />
</div>
```

### Freshness Window（NumberInput）

```tsx
<div className="flex items-center justify-between py-3 border-b border-[--color-border-default]">
  <div>
    <label
      htmlFor="freshness-window"
      className="text-sm font-medium text-[--color-text-default]"
    >
      訊息新鮮度
    </label>
    <p className="text-xs text-[--color-text-muted] mt-0.5">
      此時間內的訊息才會觸發草稿（1 ~ 1440 分鐘）
    </p>
  </div>
  <div className="flex items-center gap-2">
    <input
      id="freshness-window"
      type="number"
      min={1}
      max={1440}
      value={settings.freshness_window_minutes}
      onChange={...}
      onBlur={handleSave}   // 失焦時儲存
      onKeyDown={(e) => e.key === "Enter" && handleSave()}
      aria-describedby="freshness-hint"
      className="w-20 h-8 px-2 text-sm text-center border border-[--color-border-default] rounded-sm ..."
    />
    <span id="freshness-hint" className="text-sm text-[--color-text-muted]">分鐘</span>
  </div>
</div>
```

**驗證規則：**
- 值 < 1 或 > 1440 → 邊框轉 error 色，不送 PATCH，顯示 error toast
- 送 PATCH 成功 → 顯示 success toast「已儲存」

### Debug 模式 Toggle

同 Auto 模式 Toggle，使用相同 inline Toggle 元件。

---

## 頁面狀態

| 狀態 | 描述 | 顯示方式 |
|------|------|---------|
| `loading` | GET /api/settings + GET /api/spaces 中 | Section 骨架屏 |
| `error` | API 失敗 | Section 內顯示 error banner + 重試按鈕 |
| `saving` | PATCH 中 | 個別控制項旁 spinner（150ms fade in） |

### Section 骨架屏

```tsx
// Global Section skeleton
<div className="animate-pulse space-y-4 py-3">
  {[1, 2, 3].map((i) => (
    <div key={i} className="flex items-center justify-between">
      <div className="space-y-1">
        <div className="h-4 bg-[--color-surface-muted] rounded w-24" />
        <div className="h-3 bg-[--color-surface-muted] rounded w-48" />
      </div>
      <div className="h-6 w-10 bg-[--color-surface-muted] rounded-full" />
    </div>
  ))}
</div>
```

---

## 響應式行為

| 斷點 | 行為 |
|------|------|
| `>= 768px` | 三個 Section 垂直線性排列，無 Tab |
| `< 768px` | Tab 切換三個 Section |

### Mobile Tab 規格

```
[全域] [空間] [個人]
```

- Tab Bar：`flex border-b border-[--color-border-default]`
- 每個 Tab：`flex-1 text-center py-2.5 text-sm`
- 選中：`border-b-2 border-[--color-border-focus] text-[--color-primary-600] font-medium`
- 未選中：`text-[--color-text-secondary]`
- ARIA：`role="tablist"` + `role="tab"` + `aria-selected` + `aria-controls`

---

## 頁面 Spacing

- 最大寬度：`max-w-3xl mx-auto`
- 頁面 padding：`px-4 sm:px-6`，`pt-4 pb-16`
- Section 間距：`space-y-6`
- Section 標題：`text-base font-semibold text-[--color-text-default] mb-3`

---

## WebSocket 同步

全域設定（auto_mode 等）變更後需廣播：
- 其他 client 收到 WS 訊息時，自動更新 React state（不顯示 toast）
- 僅本機操作後才顯示 success toast

---

## Keyboard Navigation

- Tab：在所有可互動控制項間切換
- Space：切換 Toggle
- Arrow Keys：切換 Radio（auto_mode_override）
- Enter：儲存 freshness number input
- Tab：切換 ProfileFactGroup 中的各個按鈕
- Escape：收合 ProfileFactGroup 的新增表單
