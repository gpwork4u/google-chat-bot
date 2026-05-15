# SettingsPage — Space facts section（Sprint 7 增補）

## 對應 Feature

#104 F-015-fe2（部分）: SettingsPage 加 Space facts section

---

## 說明

在既有 SettingsPage（`design/pages/settings.md`）的 Profile section 之後，  
新增第四個 section：**Space 事實**（`LABEL.spaceFactsSection`）。

SettingsPage 原有三個 section：
1. 全域設定（Global）
2. 空間設定（Channels）
3. 個人特質（Profile）
4. **Space 事實**（新增）← Sprint 7

---

## 整體 SettingsPage Layout 更新（桌面 >= 768px）

```
┌──────────────────────────────────────────────────────────────────────┐
│ Navbar（48px）                              [ConnectionBadge]        │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│ max-w-3xl mx-auto px-4 pt-4 pb-16                                   │
│                                                                      │
│ ┌── 設定（Page Header）────────────────────────────────────────────┐ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│ ┌── Section: 全域設定 ─────────────────────────────────────────────┐ │
│ │  ...（既有，不變）                                                │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│ ┌── Section: 空間設定 ─────────────────────────────────────────────┐ │
│ │  ...（既有，不變）                                                │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│ ┌── Section: 個人特質 ─────────────────────────────────────────────┐ │
│ │  ...（既有，不變）                                                │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│ ┌── Section: Space 事實 ───────────────────────────────────────────┐ │  ← 新增
│ │  data-testid="settings-space-facts-section"                      │ │
│ │                                                                  │ │
│ │  Space 事實                                                       │ │  ← section header
│ │                                                                  │ │
│ │  ┌── 待審核入口 ─────────────────────────────────────────────┐   │ │
│ │  │  待審核 candidate                   [12]  →              │   │ │  ← link + PendingBadge
│ │  └──────────────────────────────────────────────────────────┘   │ │
│ │                                                                  │ │
│ │  ┌── Space 列表 ─────────────────────────────────────────────┐   │ │
│ │  │  [SpaceCard — Team #frontend      2 pending  →]          │   │ │
│ │  │  [SpaceCard — Project Alpha                  →]          │   │ │
│ │  │  [SpaceCard — Personal Chat                  →]          │   │ │
│ │  └──────────────────────────────────────────────────────────┘   │ │
│ │                                                                  │ │
│ └──────────────────────────────────────────────────────────────── ┘ │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Mobile（< 768px）Tab 更新

Mobile 版 Settings 改用 Tab 切換，新增第四個 Tab：

```
[全域]  [空間]  [個人]  [Space Facts]
```

- Tab 文字：`Space Facts`（因空間有限，不用全繁中）
- Tab 指示：同既有 Tab 規格（`border-b-2 border-[--color-border-focus]`）

---

## Section 實作

```tsx
<section
  data-testid="settings-space-facts-section"
  className="border border-[--color-border-default] rounded-[--radius-lg] p-4 sm:p-6"
>
  {/* Section Header */}
  <h2 className="text-base font-semibold text-[--color-text-default] mb-4">
    Space 事實
  </h2>

  {/* 待審核入口 */}
  <div className="flex items-center justify-between py-2.5 px-3 mb-4 bg-[--color-surface-subtle] border border-[--color-border-default] rounded-[--radius-md]">
    <span className="text-sm text-[--color-text-secondary]">
      待審核 candidate
    </span>
    <a
      href="/space-facts/candidates"
      className="flex items-center gap-2 text-sm text-[--color-text-link] hover:underline focus:outline-none focus:underline"
      aria-label={`查看 ${pendingCount} 筆待審核 candidate facts`}
    >
      <span
        data-testid="space-facts-pending-badge"
        aria-label={`${pendingCount} 筆待審核 candidate`}
        className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-semibold text-[--color-text-inverse] bg-[--color-primary-500] rounded-[--radius-full]"
      >
        {pendingCount > 99 ? "99+" : pendingCount}
      </span>
      <ChevronRight size={14} aria-hidden="true" />
    </a>
  </div>

  {/* Space cards grid */}
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
    {spaces.map((space) => (
      <SpaceCard
        key={space.space_key}
        spaceKey={space.space_key}
        spaceName={space.space_name}
        approvedCount={space.approved_count}
        candidateCount={space.candidate_count}
        data-testid="space-facts-space-card"
      />
    ))}
  </div>
</section>
```

---

## 待審核入口（連結列）

| 元素 | 說明 |
|------|------|
| 左側文字 | `待審核 candidate`（`LABEL.pendingCandidates`） |
| 右側 badge | `<PendingBadge>` testid=`space-facts-pending-badge` |
| 整列點擊 | 連至 `/space-facts/candidates` |
| pending = 0 | badge 不顯示，連結列仍顯示 |

---

## 頁面狀態

| 狀態 | 描述 |
|------|------|
| `loading` | Section 骨架屏（pending badge skeleton + 3 × SpaceCard skeleton） |
| `no-spaces` | 顯示「尚無 space facts」提示（`text-sm text-muted` 置中） |
| `loaded` | 正常顯示 pending badge + SpaceCard grid |

### Section Skeleton

```tsx
// Space facts section skeleton
<div className="space-y-3 animate-pulse">
  {/* 待審核列 skeleton */}
  <div className="h-11 bg-[--color-surface-muted] rounded-[--radius-md]" />
  {/* Space cards skeleton */}
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
    {[1, 2, 3].map((i) => (
      <div key={i} className="h-16 bg-[--color-surface-muted] rounded-[--radius-md]" />
    ))}
  </div>
</div>
```

---

## 資料來源

- 待審核數量：`GET /api/space-facts/candidates` → `total` 欄位
- Space 列表：`GET /api/space-facts?group_by=space_key` 或 `GET /api/spaces` + join space facts count
- 建議：SWR `useSWR('/api/space-facts/candidates', ...)`

---

## Accessibility

- `<section>` 元素有 `data-testid`
- Section 標題使用 `<h2>`（配合 SettingsPage 的層級結構）
- pending badge link：`aria-label` 含數量
- SpaceCard：各自 `aria-label` 含 space 名稱和 facts 數量

---

## 響應式行為

| 斷點 | 行為 |
|------|------|
| `>= 640px` | SpaceCard grid 2 欄 |
| `< 640px` | SpaceCard grid 1 欄（全寬） |
| `< 768px` | 整個 section 在 Tab 「Space Facts」內 |
