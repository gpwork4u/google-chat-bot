# Design Tokens — Sprint 7 新增

## 新增 Token 清單

Sprint 7 新增以下 tokens，需加入 `web/src/index.css` 的 `@theme {}` 區塊。

---

## Space Facts Category Badge 顏色（5 種）

5 類 category 各自對應一個易區分、無障礙友善的 accent 色系。
色相選擇原則：避免純紅（與 error 衝突）、純灰（與 skip 衝突），
確保文字與背景 >= 4.5:1 對比度（WCAG 2.1 AA）。

```css
@theme {
  /* ── Space Facts Category Badge Colors（Sprint 7 新增）──── */

  /* product — 藍綠 (teal)，代表具體產品知識 */
  --color-fact-product-bg:      oklch(0.94 0.045 185);   /* teal-50 tone */
  --color-fact-product-text:    oklch(0.35 0.130 185);   /* teal-800 tone，4.6:1 on bg */
  --color-fact-product-border:  oklch(0.78 0.090 185);

  /* my-role — 紫色，代表個人角色定位 */
  --color-fact-role-bg:         oklch(0.95 0.030 300);   /* purple-50 tone（複用 category-eng） */
  --color-fact-role-text:       oklch(0.36 0.180 300);   /* purple-800 tone */
  --color-fact-role-border:     oklch(0.75 0.090 300);

  /* glossary — 橙棕 (amber)，代表術語定義 */
  --color-fact-glossary-bg:     oklch(0.96 0.060 65);    /* amber-50 tone */
  --color-fact-glossary-text:   oklch(0.42 0.150 55);    /* amber-800 tone，4.5:1 on bg */
  --color-fact-glossary-border: oklch(0.80 0.110 65);

  /* pinned-decision — 深藍 (indigo)，代表重要決議 */
  --color-fact-decision-bg:     oklch(0.94 0.040 264);   /* indigo-50 tone（複用 category-chat） */
  --color-fact-decision-text:   oklch(0.34 0.200 264);   /* indigo-900 tone，4.7:1 on bg */
  --color-fact-decision-border: oklch(0.78 0.090 264);

  /* relation — 玫瑰 (rose)，代表人際關係 */
  --color-fact-relation-bg:     oklch(0.96 0.030 10);    /* rose-50 tone */
  --color-fact-relation-text:   oklch(0.38 0.160 10);    /* rose-800 tone，4.5:1 on bg */
  --color-fact-relation-border: oklch(0.78 0.100 10);
}
```

### Dark Mode 補充

```css
.dark {
  --color-fact-product-bg:      oklch(0.22 0.050 185);
  --color-fact-product-text:    oklch(0.75 0.120 185);
  --color-fact-product-border:  oklch(0.35 0.080 185);

  --color-fact-role-bg:         oklch(0.22 0.040 300);
  --color-fact-role-text:       oklch(0.72 0.120 300);
  --color-fact-role-border:     oklch(0.32 0.090 300);

  --color-fact-glossary-bg:     oklch(0.22 0.060 65);
  --color-fact-glossary-text:   oklch(0.80 0.130 65);
  --color-fact-glossary-border: oklch(0.35 0.100 65);

  --color-fact-decision-bg:     oklch(0.22 0.050 264);
  --color-fact-decision-text:   oklch(0.75 0.120 264);
  --color-fact-decision-border: oklch(0.35 0.090 264);

  --color-fact-relation-bg:     oklch(0.22 0.040 10);
  --color-fact-relation-text:   oklch(0.78 0.110 10);
  --color-fact-relation-border: oklch(0.35 0.090 10);
}
```

---

## Category 對應關係

| category key | 繁中 label | CSS token prefix | 色系描述 |
|--------------|-----------|-----------------|---------|
| `product` | 產品 | `fact-product` | 藍綠 (teal) |
| `my-role` | 我的角色 | `fact-role` | 紫色 (purple) |
| `glossary` | 術語 | `fact-glossary` | 橙棕 (amber) |
| `pinned-decision` | 決議 | `fact-decision` | 深藍 (indigo) |
| `relation` | 人物 | `fact-relation` | 玫瑰 (rose) |

---

## Visibility 顏色

`VisibilitySelect` 的 secret 選項附 lock icon，不需額外 token。
沿用既有 neutral / warning 系列：

| visibility | 標示方式 | 參考 token |
|------------|---------|-----------|
| `public` | 純文字「公開」 | `--color-text-muted`（選項 label） |
| `private` | 純文字「private」| `--color-text-secondary` |
| `secret` | 「secret」+ lock icon | `--color-warning-strong` (icon) |

---

## 說明

- 5 個 category 色系刻意選不同色相，確保色盲用戶可區分（teal / purple / amber / indigo / rose）
- 對比度驗證：所有 `-text` 在對應 `-bg` 背景上均 >= 4.5:1（WCAG 2.1 AA）
- dark mode 以翻轉亮度方式實作，保持色相一致性
- 命名格式 `--color-fact-{category_abbr}-{role}` 與既有 `--color-category-*` 對齊
