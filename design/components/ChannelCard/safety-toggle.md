# ChannelCard — 安全護欄 Toggle 增補規格

## 概述

Sprint 4 為 ChannelCard（`design/components/ChannelCard/spec.md`）新增一個 toggle row，讓使用者設定此頻道是否跳過安全護欄。

此文件為 **增補規格**，配合原有 `spec.md` 一同閱讀。

---

## 版面變更

原 ChannelCard 底部「封鎖關鍵字」section 之前，插入新的 toggle row：

```
┌─────────────────────────────────────────────────────────────────┐
│  Team #frontend                                                  │
│  space_id: spaces/AAAA                      [AAAA 空間] readonly │
│ ─────────────────────────────────────────────────────────────── │
│  啟用此空間                             [toggle: ON]             │
│  只在 @提及 時觸發                      [toggle: OFF]            │
│  ─────────────────────────────────────────────────────────────  │
│  Auto 模式覆寫                                                   │
│  ○ 繼承全域  ● 強制開啟  ○ 強制關閉                              │
│  ─────────────────────────────────────────────────────────────  │
│  跳過此頻道安全護欄                     [toggle: OFF]  ← 新增    │
│  ─────────────────────────────────────────────────────────────  │
│  封鎖關鍵字                                                      │
│  [薪水 ×] [辭職 ×]  [輸入關鍵字, Enter 新增...]                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 新增 Toggle 規格

### 標籤與 Hint

| 用途 | 文字 | contracts.ts 常數 |
|------|------|-------------------|
| toggle label | 跳過此頻道安全護欄 | `LABELS.CHANNEL_SAFETY_SKIP_LABEL` |
| toggle hint | 啟用後，此頻道的訊息不受安全護欄規則限制 | `LABELS.CHANNEL_SAFETY_SKIP_HINT` |

**contracts.ts 需新增（engineer 實作時補入）**：

```ts
// LABELS（新增）
CHANNEL_SAFETY_SKIP_LABEL: '跳過此頻道安全護欄',
CHANNEL_SAFETY_SKIP_HINT: '啟用後，此頻道的訊息不受安全護欄規則限制',
```

### TestID

| 元素 | `data-testid` | contracts.ts 常數 |
|------|--------------|-------------------|
| 跳過安全護欄 toggle | `channel-safety-skip-toggle` | `TESTIDS.CHANNEL_SAFETY_SKIP_TOGGLE` |

**contracts.ts 需新增（engineer 實作時補入）**：

```ts
// TESTIDS（新增）
CHANNEL_SAFETY_SKIP_TOGGLE: 'channel-safety-skip-toggle',
```

### 值映射

| toggle 狀態 | `safety_rails_override` 值 | 語意 |
|------------|--------------------------|------|
| OFF（預設）| `"inherit"` | 繼承全域安全護欄設定 |
| ON | `"disabled"` | 此頻道跳過安全護欄 |

---

## Props 擴充

`SpaceSetting` 型別新增欄位（對應後端 migration 0016）：

```ts
interface SpaceSetting {
  space_id: string
  space_name: string
  enabled: boolean
  mention_only: boolean
  auto_mode_override: AutoModeOverride
  blocked_keywords: string[]
  safety_rails_override: 'inherit' | 'disabled'  // ← 新增
}
```

`ChannelCard` props 新增 callback：

```ts
onSafetyOverrideChange: (spaceId: string, override: 'inherit' | 'disabled') => void
```

---

## 停用狀態行為

延伸原有 `enabled = false` 停用規則：

```
enabled = false：
  跳過安全護欄 toggle：disabled + opacity-50（同其他非主開關 toggle）
```

---

## Accessibility

- `role="switch"` + `aria-checked={space.safety_rails_override === 'disabled'}` + `aria-label={LABELS.CHANNEL_SAFETY_SKIP_LABEL}`
- hint 文字有 `id`，toggle 帶 `aria-describedby`
- `enabled = false` 時：`aria-disabled="true"` + `disabled` attribute

---

## Tailwind Classes 範例

```tsx
{/* 跳過安全護欄 toggle row — 插入在 auto_mode_override fieldset 之後 */}
<div
  className={[
    "flex items-center justify-between",
    "px-4 py-3",
    "border-t border-[--color-border-default]",
    !space.enabled ? "opacity-50" : "",
  ].filter(Boolean).join(" ")}
>
  <div>
    <p id={`safety-skip-label-${space.space_id}`}
       className="text-sm font-medium text-[--color-text-default]">
      {LABELS.CHANNEL_SAFETY_SKIP_LABEL}
    </p>
    <p className="text-xs text-[--color-text-muted] mt-0.5">
      {LABELS.CHANNEL_SAFETY_SKIP_HINT}
    </p>
  </div>

  <button
    type="button"
    role="switch"
    aria-checked={space.safety_rails_override === 'disabled'}
    aria-label={LABELS.CHANNEL_SAFETY_SKIP_LABEL}
    aria-describedby={`safety-skip-label-${space.space_id}`}
    aria-disabled={!space.enabled ? "true" : undefined}
    disabled={!space.enabled}
    data-testid={TESTIDS.CHANNEL_SAFETY_SKIP_TOGGLE}
    onClick={() => {
      if (!space.enabled) return
      const next = space.safety_rails_override === 'disabled' ? 'inherit' : 'disabled'
      onSafetyOverrideChange(space.space_id, next)
    }}
    className={[
      "relative inline-flex items-center justify-center",
      "w-11 h-11 -mr-1.5 rounded-sm",
      "focus:outline-none focus-visible:ring-2 focus-visible:ring-[--color-border-focus]",
      !space.enabled ? "cursor-not-allowed" : "",
    ].filter(Boolean).join(" ")}
  >
    {/* Toggle track */}
    <span
      className={[
        "w-10 h-6 rounded-full transition-colors duration-200",
        space.safety_rails_override === 'disabled'
          ? "bg-[--color-primary-600]"
          : "bg-[--color-neutral-300]",
      ].join(" ")}
    >
      {/* Toggle thumb */}
      <span
        className={[
          "absolute w-5 h-5 bg-white rounded-full shadow-sm",
          "transition-transform duration-200",
          space.safety_rails_override === 'disabled'
            ? "translate-x-[18px]"
            : "translate-x-[2px]",
        ].join(" ")}
      />
    </span>
  </button>
</div>
```

---

## API 呼叫

變更時呼叫（同其他 ChannelCard 控制項）：

```ts
// PATCH /api/spaces/{space_id}
await fetch(API_PATHS.SPACE_PATCH(space.space_id), {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ safety_rails_override: newOverride }),
})
// 成功 → TOAST.SETTINGS_SAVED
// 失敗 → TOAST.SETTINGS_SAVE_FAILED + error banner on card
```

---

## 視覺對比說明

「跳過此頻道安全護欄」toggle **ON（危險狀態）** 視覺上使用同一套 primary-600 toggle（與其他 toggle 一致），不另用紅色，原因：

1. 使用者意圖是主動選擇豁免，不是系統錯誤
2. Toggle 顏色統一降低認知負荷
3. 標籤文字「跳過」已足以傳達語意

若 PM/設計評審後決定要用不同顏色（例如 warning 色），可單獨調整此 toggle 的 track class 至 `bg-[--color-warning-default]`，不影響其他元件。
