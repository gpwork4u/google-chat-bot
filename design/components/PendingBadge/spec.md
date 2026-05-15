# PendingBadge

## 用途

顯示待審核 candidate facts 的數量徽章，用於 SettingsPage Space facts section。  
點擊可跳至 `/space-facts/candidates` 頁。

testid: `space-facts-pending-badge`（element: `<span>`）

---

## Props

| Prop | Type | Required | 說明 |
|------|------|----------|------|
| `count` | `number` | 是 | 待審核數量 |
| `data-testid` | `string` | 否，預設 `"space-facts-pending-badge"` | testid |

---

## 視覺規格

```
┌──────────────────────────────────────────────────────────┐
│  待審核 candidate   [  12  ]                             │
│                     ↑ PendingBadge                       │
└──────────────────────────────────────────────────────────┘
```

- 數字徽章：`inline-flex items-center justify-center`
- 最小尺寸：`min-w-[20px] h-5`（pill 形狀）
- padding：`px-1.5`
- font：`text-xs font-semibold text-[--color-text-inverse]`
- background：`bg-[--color-primary-500]`（indigo）
- border-radius：`rounded-[--radius-full]`（pill）
- 數字 > 99：顯示 `99+`

---

## States

| State | 外觀 |
|-------|------|
| `count > 0` | 正常顯示（indigo pill） |
| `count === 0` | 不渲染（返回 `null`），或顯示 0（視 parent 決定） |

---

## Accessibility

- `aria-label`：`"{count} 筆待審核 candidate"`
- 純展示元素，`role="status"` 可選（若需 live region 通知）
- 不是互動元素本身（父連結提供點擊行為）

---

## 使用範例

見 `example.tsx`
