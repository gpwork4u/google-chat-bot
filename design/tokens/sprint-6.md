# Design Tokens — Sprint 6 新增

## 新增 Token 清單

Sprint 6 新增以下 tokens，需加入 `web/src/index.css` 的 `@theme {}` 區塊。

---

## Skipped-by Badge 顏色

`SkippedBy` badge 依 skip 來源區分三種色調，沿用 mode badge 的 bg / text / border 三色命名慣例。

```css
@theme {
  /* ── Skipped-by Badge Colors（Sprint 6 新增）─────────────── */
  /* skip 來源：skill（blue）/ manual（purple）/ backend_auto（gray） */

  --color-skipped-skill-bg:       oklch(0.94 0.040 264);   /* indigo-50 tone（複用 category-chat-bg） */
  --color-skipped-skill-text:     oklch(0.38 0.180 264);   /* indigo-700 tone */
  --color-skipped-skill-border:   oklch(0.80 0.080 264);

  --color-skipped-manual-bg:      oklch(0.95 0.030 300);   /* purple-50 tone（複用 category-eng-bg） */
  --color-skipped-manual-text:    oklch(0.38 0.180 300);   /* purple-700 tone */
  --color-skipped-manual-border:  oklch(0.78 0.090 300);

  --color-skipped-auto-bg:        var(--color-neutral-100); /* gray（複用 category-skip-bg） */
  --color-skipped-auto-text:      var(--color-neutral-500);
  --color-skipped-auto-border:    var(--color-neutral-200);
}

/* Dark mode 補充 */
.dark {
  --color-skipped-skill-bg:       oklch(0.25 0.050 264);
  --color-skipped-skill-text:     oklch(0.75 0.120 264);
  --color-skipped-skill-border:   oklch(0.35 0.090 264);

  --color-skipped-manual-bg:      oklch(0.22 0.040 300);
  --color-skipped-manual-text:    oklch(0.72 0.120 300);
  --color-skipped-manual-border:  oklch(0.32 0.090 300);

  --color-skipped-auto-bg:        var(--color-neutral-800);
  --color-skipped-auto-text:      var(--color-neutral-400);
  --color-skipped-auto-border:    var(--color-neutral-700);
}
```

---

## Sync Progress Badge 顏色

Extension popup 同步進度 badge 沿用既有 status tokens，不新增。

| 狀態 | 使用 token |
|------|-----------|
| `running` | `--color-warning-subtle` + `--color-warning-strong` |
| `completed` | `--color-success-subtle` + `--color-success-strong` |
| `failed` | `--color-error-subtle` + `--color-error-strong` |

---

## Mention Badge 顏色

Mentioned badge 沿用既有 `--color-info-*` tokens。

| 元素 | Token |
|------|-------|
| bg | `--color-info-subtle` |
| text | `--color-info-strong` |
| border | `--color-info-default`（opacity 0.4） |

---

## 說明

- skipped-by badge 刻意複用既有 indigo / purple / gray 色系，確保視覺語言一致（不引入全新色相）
- token 命名採 `--color-skipped-{source}-{role}` 格式與既有 `--color-category-*` 對齊
- 實作時只需在 `web/src/index.css` `@theme {}` 內加上述 CSS 變數
