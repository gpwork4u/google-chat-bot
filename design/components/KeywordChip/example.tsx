// KeywordChip — 使用範例
// 基於 Tailwind v4 + Lucide React
// 參考 design/components/KeywordChip/spec.md

import { X } from "lucide-react";
import { useState, useRef, KeyboardEvent } from "react";

type ChipVariant = "default" | "filter" | "error";

interface KeywordChipProps {
  label: string;
  onDelete: () => void;
  variant?: ChipVariant;
  disabled?: boolean;
}

export function KeywordChip({
  label,
  onDelete,
  variant = "default",
  disabled = false,
}: KeywordChipProps) {
  const variantClasses: Record<ChipVariant, string> = {
    default: [
      "bg-[--color-surface-muted] text-[--color-text-secondary]",
      "border-[--color-border-default]",
    ].join(" "),
    filter: [
      "bg-[--color-surface-muted] text-[--color-text-secondary]",
      "border-[--color-border-default]",
    ].join(" "),
    error: [
      "bg-[--color-error-subtle] text-[--color-error-strong]",
      "border-[--color-error-default]",
    ].join(" "),
  };

  return (
    <span
      aria-label={label}
      className={[
        "inline-flex items-center gap-1 h-6 pl-2 pr-1",
        "text-xs rounded-[--radius-full]",
        "border",
        "select-none",
        variantClasses[variant],
      ].join(" ")}
    >
      <span>{label}</span>
      <button
        type="button"
        onClick={disabled ? undefined : onDelete}
        aria-label={`刪除關鍵字 ${label}`}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        className={[
          "flex items-center justify-center",
          "w-4 h-4 -mr-0.5",
          "rounded-full",
          "transition-colors duration-150",
          "focus:outline-none focus-visible:ring-1 focus-visible:ring-[--color-border-focus]",
          disabled
            ? "opacity-40 cursor-not-allowed"
            : [
                "text-[--color-text-muted] hover:text-[--color-text-default]",
                "hover:bg-[--color-neutral-300]",
              ].join(" "),
        ].join(" ")}
      >
        <X size={10} aria-hidden="true" />
      </button>
    </span>
  );
}

// ---- KeywordChipInput：帶輸入框的 chip 群組 ----
// 供 ChannelCard 使用

interface KeywordChipInputProps {
  keywords: string[];
  onChange: (keywords: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  maxKeywords?: number;
}

export function KeywordChipInput({
  keywords,
  onChange,
  placeholder = "輸入關鍵字，按 Enter 新增",
  disabled = false,
  maxKeywords,
}: KeywordChipInputProps) {
  const [inputValue, setInputValue] = useState("");
  const [isDuplicate, setIsDuplicate] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && inputValue.trim()) {
      e.preventDefault();
      const trimmed = inputValue.trim();
      if (keywords.includes(trimmed)) {
        setIsDuplicate(true);
        return;
      }
      onChange([...keywords, trimmed]);
      setInputValue("");
      setIsDuplicate(false);
    }
    if (e.key === "Backspace" && !inputValue && keywords.length > 0) {
      // Backspace on empty input → 刪除最後一個 chip
      onChange(keywords.slice(0, -1));
    }
  };

  const handleDelete = (keyword: string) => {
    onChange(keywords.filter((k) => k !== keyword));
    setIsDuplicate(false);
  };

  const isAtMax = maxKeywords !== undefined && keywords.length >= maxKeywords;

  return (
    <div>
      {/* chip + input 容器 */}
      <div
        onClick={() => inputRef.current?.focus()}
        className={[
          "flex flex-wrap gap-1.5 min-h-[36px]",
          "px-2.5 py-1.5",
          "bg-[--color-surface-default]",
          "border border-[--color-border-default] rounded-sm",
          "cursor-text",
          "transition-colors duration-150",
          "focus-within:border-[--color-border-focus] focus-within:ring-1 focus-within:ring-[--color-border-focus]",
          isDuplicate ? "border-[--color-error-default]" : "",
        ].join(" ")}
      >
        {keywords.map((kw) => (
          <KeywordChip
            key={kw}
            label={kw}
            onDelete={() => handleDelete(kw)}
            disabled={disabled}
          />
        ))}

        {/* 輸入框 */}
        {!isAtMax && (
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              setIsDuplicate(false);
            }}
            onKeyDown={handleKeyDown}
            placeholder={keywords.length === 0 ? placeholder : ""}
            disabled={disabled}
            aria-label="輸入新關鍵字"
            aria-describedby={isDuplicate ? "keyword-duplicate-error" : undefined}
            className={[
              "flex-1 min-w-[120px] h-6",
              "text-xs text-[--color-text-default] placeholder:text-[--color-text-placeholder]",
              "bg-transparent border-none outline-none",
              "disabled:cursor-not-allowed",
            ].join(" ")}
          />
        )}
      </div>

      {/* 錯誤訊息 */}
      {isDuplicate && (
        <p
          id="keyword-duplicate-error"
          role="alert"
          className="mt-1 text-xs text-[--color-error-strong]"
        >
          關鍵字「{inputValue}」已存在
        </p>
      )}
      {isAtMax && (
        <p className="mt-1 text-xs text-[--color-text-muted]">
          已達上限 {maxKeywords} 個關鍵字
        </p>
      )}
    </div>
  );
}

// ---- 使用示範 ----

// 單個 chip（default）
<KeywordChip label="薪水" onDelete={() => console.log("刪除薪水")} />

// 單個 chip（error — 重複）
<KeywordChip label="辭職" variant="error" onDelete={() => {}} />

// 單個 chip（disabled）
<KeywordChip label="主管" onDelete={() => {}} disabled />

// filter variant（用於 FilterBar）
<KeywordChip label="Team #frontend" variant="filter" onDelete={() => console.log("移除篩選")} />

// KeywordChipInput 完整群組
function BlockedKeywordsDemo() {
  const [keywords, setKeywords] = useState(["薪水", "辭職"]);
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-[--color-text-secondary]">
        封鎖關鍵字
      </label>
      <KeywordChipInput
        keywords={keywords}
        onChange={setKeywords}
        placeholder="輸入關鍵字，按 Enter 新增"
      />
      <p className="text-xs text-[--color-text-muted]">
        含有這些關鍵字的訊息不會觸發草稿
      </p>
    </div>
  );
}
