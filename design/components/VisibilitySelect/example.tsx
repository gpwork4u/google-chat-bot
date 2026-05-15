// VisibilitySelect 使用範例
// 基於 Tailwind v4 + React（TypeScript）

import { Lock } from "lucide-react";

type Visibility = "public" | "private" | "secret";

interface VisibilitySelectProps {
  value: Visibility;
  onChange: (value: Visibility) => void;
  disabled?: boolean;
  "aria-label"?: string;
  "data-testid"?: string;
}

function VisibilitySelect({
  value,
  onChange,
  disabled = false,
  "aria-label": ariaLabel = "可見性",
  "data-testid": testId,
}: VisibilitySelectProps) {
  return (
    <select
      data-testid={testId}
      value={value}
      onChange={(e) => onChange(e.target.value as Visibility)}
      disabled={disabled}
      aria-label={ariaLabel}
      className={[
        "h-8 px-2.5 py-1",
        "text-sm text-[--color-text-default]",
        "bg-[--color-surface-default]",
        "border border-[--color-border-default] rounded-[--radius-sm]",
        "focus:outline-none focus:ring-2 focus:ring-[--color-border-focus]",
        "transition-colors duration-[--duration-fast]",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        "cursor-pointer",
      ].join(" ")}
    >
      <option value="public">公開</option>
      <option value="private">private</option>
      {/* lock 符號作為 secret 的視覺提示（原生 option 不支援 SVG） */}
      <option value="secret">🔒 secret</option>
    </select>
  );
}

// --- 在 CandidateFactRow 使用 ---
<VisibilitySelect
  value="private"
  onChange={(newVal) => handleVisibilityChange(factId, newVal)}
  data-testid="candidate-fact-visibility-select"
/>

// --- disabled 狀態（fact row 非編輯中） ---
<VisibilitySelect
  value="public"
  onChange={handleChange}
  disabled={true}
  data-testid="candidate-fact-visibility-select"
/>

// --- 在 AddFactModal 中使用（搭配 label） ---
<div className="flex flex-col gap-1.5">
  <label
    htmlFor="fact-visibility"
    className="text-sm font-medium text-[--color-text-default]"
  >
    可見性
  </label>
  <VisibilitySelect
    value={formState.visibility}
    onChange={(v) => setFormState((s) => ({ ...s, visibility: v }))}
    aria-label="fact 可見性"
  />
</div>
