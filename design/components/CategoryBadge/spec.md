# CategoryBadge

## 用途

顯示 space fact 的分類（5 種），對應 API 回傳的 `category` 欄位。  
用於 `CandidateFactRow`、`SpaceFactRow`（`/space-facts/{space_key}` 詳情頁）。

testid: `candidate-fact-category`（element: `<span>`）

---

## Categories

| category key | 繁中 label（`LABEL.*`） | CSS token prefix | 色系 |
|--------------|------------------------|-----------------|------|
| `product` | `產品`（`LABEL.categoryProduct`） | `fact-product` | 藍綠 |
| `my-role` | `我的角色`（`LABEL.categoryMyRole`） | `fact-role` | 紫色 |
| `glossary` | `術語`（`LABEL.categoryGlossary`） | `fact-glossary` | 橙棕 |
| `pinned-decision` | `決議`（`LABEL.categoryPinnedDecision`） | `fact-decision` | 深藍 |
| `relation` | `人物`（`LABEL.categoryRelation`） | `fact-relation` | 玫瑰 |

---

## Props

| Prop | Type | Required | 說明 |
|------|------|----------|------|
| `category` | `'product' \| 'my-role' \| 'glossary' \| 'pinned-decision' \| 'relation'` | 是 | fact 分類 |
| `size` | `'sm' \| 'md'` | 否，預設 `'sm'` | 徽章尺寸 |
| `data-testid` | `string` | 否 | 外部注入（預設由父元件決定） |

---

## Sizes

| Size | Font | Padding | Min-height |
|------|------|---------|-----------|
| `sm` | `text-xs`（12px） | `px-2 py-0.5` | 20px（>= 觸控目標不需單獨操作） |
| `md` | `text-sm`（13px） | `px-2.5 py-1` | 24px |

---

## States

| State | 外觀 |
|-------|------|
| 正常顯示 | 帶有 category 對應色系（bg/text/border） |
| 父元件 loading | 骨架屏（parent 負責，badge 本身不含 skeleton） |

---

## Accessibility

- `role="status"` 不需要（純標示，非互動）
- `aria-label`：讓 screen reader 讀出完整類別，如 `aria-label="分類：產品"`
- 不是互動元素，無 focus state 需求
- 圖示：無（純文字徽章），確保色盲用戶可讀文字標籤

---

## 視覺規格

```
┌──────────────┐
│ 產品          │  ← text-xs, font-medium
└──────────────┘
   bg: --color-fact-product-bg
   text: --color-fact-product-text
   border: 1px solid --color-fact-product-border
   border-radius: --radius-xs（3px）
```

---

## Tailwind Classes 範例

```tsx
// category → token mapping
const categoryConfig: Record<string, { bg: string; text: string; border: string; label: string }> = {
  product: {
    bg:     "bg-[--color-fact-product-bg]",
    text:   "text-[--color-fact-product-text]",
    border: "border-[--color-fact-product-border]",
    label:  "產品",
  },
  "my-role": {
    bg:     "bg-[--color-fact-role-bg]",
    text:   "text-[--color-fact-role-text]",
    border: "border-[--color-fact-role-border]",
    label:  "我的角色",
  },
  glossary: {
    bg:     "bg-[--color-fact-glossary-bg]",
    text:   "text-[--color-fact-glossary-text]",
    border: "border-[--color-fact-glossary-border]",
    label:  "術語",
  },
  "pinned-decision": {
    bg:     "bg-[--color-fact-decision-bg]",
    text:   "text-[--color-fact-decision-text]",
    border: "border-[--color-fact-decision-border]",
    label:  "決議",
  },
  relation: {
    bg:     "bg-[--color-fact-relation-bg]",
    text:   "text-[--color-fact-relation-text]",
    border: "border-[--color-fact-relation-border]",
    label:  "人物",
  },
};

const baseClasses = "inline-flex items-center font-medium border rounded-[--radius-xs] whitespace-nowrap";
const sizeClasses = {
  sm: "text-xs px-2 py-0.5",
  md: "text-sm px-2.5 py-1",
};
```

---

## 使用範例

見 `example.tsx`
