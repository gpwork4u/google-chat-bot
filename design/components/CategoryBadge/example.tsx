// CategoryBadge 使用範例
// 基於 Tailwind v4 + React（TypeScript）
// token 來源：design/tokens/sprint-7.md

type Category = "product" | "my-role" | "glossary" | "pinned-decision" | "relation";

const categoryConfig: Record<Category, { bg: string; text: string; border: string; label: string }> = {
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

interface CategoryBadgeProps {
  category: Category;
  size?: "sm" | "md";
  "data-testid"?: string;
}

function CategoryBadge({ category, size = "sm", "data-testid": testId }: CategoryBadgeProps) {
  const config = categoryConfig[category];
  const sizeClass = size === "sm" ? "text-xs px-2 py-0.5" : "text-sm px-2.5 py-1";

  return (
    <span
      data-testid={testId}
      aria-label={`分類：${config.label}`}
      className={[
        "inline-flex items-center font-medium border rounded-[--radius-xs] whitespace-nowrap",
        config.bg,
        config.text,
        config.border,
        sizeClass,
      ].join(" ")}
    >
      {config.label}
    </span>
  );
}

// --- 使用範例（candidate fact row 內） ---
<CategoryBadge
  category="product"
  size="sm"
  data-testid="candidate-fact-category"
/>

// --- 5 種 category 全覽 ---
<div className="flex flex-wrap gap-2">
  <CategoryBadge category="product" />
  <CategoryBadge category="my-role" />
  <CategoryBadge category="glossary" />
  <CategoryBadge category="pinned-decision" />
  <CategoryBadge category="relation" />
</div>

// --- 詳情頁 approved fact row 用（md size） ---
<CategoryBadge category="glossary" size="md" />
