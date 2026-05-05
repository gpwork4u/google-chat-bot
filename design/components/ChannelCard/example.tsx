// ChannelCard — 使用範例
// 基於 Tailwind v4 + Lucide React
// 參考 design/components/ChannelCard/spec.md

import { Loader2, AlertCircle } from "lucide-react";
import { useState } from "react";
import { KeywordChipInput } from "../KeywordChip/example";

type AutoModeOverride = "inherit" | "always_on" | "always_off";

interface SpaceSetting {
  space_id: string;
  space_name: string;
  enabled: boolean;
  mention_only: boolean;
  auto_mode_override: AutoModeOverride;
  blocked_keywords: string[];
}

interface ChannelCardProps {
  space: SpaceSetting;
  onEnabledChange: (spaceId: string, enabled: boolean) => void;
  onMentionOnlyChange: (spaceId: string, mentionOnly: boolean) => void;
  onAutoModeOverrideChange: (spaceId: string, override: AutoModeOverride) => void;
  onBlockedKeywordsChange: (spaceId: string, keywords: string[]) => void;
}

// ---- Toggle 子元件（inline） ----
interface ToggleProps {
  checked: boolean;
  onChange: (val: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
  saving?: boolean;
}

function Toggle({ checked, onChange, ariaLabel, disabled = false, saving = false }: ToggleProps) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && onChange(!checked)}
        className={[
          "relative inline-flex items-center",
          "w-11 h-11 rounded-sm",            // 44pt 觸控目標
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[--color-border-focus]",
          disabled ? "cursor-not-allowed" : "cursor-pointer",
        ].join(" ")}
      >
        {/* Track */}
        <span
          aria-hidden="true"
          className={[
            "w-10 h-6 rounded-[--radius-full]",
            "transition-colors duration-200",
            disabled ? "opacity-50" : "",
            checked ? "bg-[--color-primary-600]" : "bg-[--color-neutral-300]",
          ].join(" ")}
        />
        {/* Thumb */}
        <span
          aria-hidden="true"
          className={[
            "absolute w-5 h-5 bg-white rounded-full",
            "shadow-[--shadow-xs]",
            "transition-transform duration-200",
            checked ? "translate-x-[18px]" : "translate-x-[2px]",
          ].join(" ")}
        />
      </button>
      {/* Saving indicator */}
      {saving && (
        <Loader2
          size={12}
          aria-label="儲存中"
          className="text-[--color-text-muted] animate-spin"
        />
      )}
    </div>
  );
}

// ---- ChannelCard 主元件 ----
export function ChannelCard({
  space,
  onEnabledChange,
  onMentionOnlyChange,
  onAutoModeOverrideChange,
  onBlockedKeywordsChange,
}: ChannelCardProps) {
  const [savingField, setSavingField] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 模擬儲存 feedback（實際由 engineer 接 API）
  const withSaving = async (field: string, fn: () => void) => {
    setSavingField(field);
    setErrorMessage(null);
    try {
      fn();
      // Engineer 會在 callback 中呼叫 API，這裡僅示意 UI 狀態
    } finally {
      setSavingField(null);
    }
  };

  const isDisabled = !space.enabled;

  const autoModeOptions: { value: AutoModeOverride; label: string }[] = [
    { value: "inherit", label: "繼承全域" },
    { value: "always_on", label: "強制開啟" },
    { value: "always_off", label: "強制關閉" },
  ];

  return (
    <article
      role="region"
      aria-label={`${space.space_name} 設定`}
      className={[
        "rounded-md border border-[--color-border-default]",
        "bg-[--color-surface-default]",
        "shadow-[--shadow-card]",
        "overflow-hidden",
        "transition-opacity duration-150",
        isDisabled ? "opacity-75" : "",
      ].join(" ")}
    >
      {/* ── Header ───────────────────────────────────────── */}
      <div className="px-4 py-3">
        <p className="text-sm font-semibold text-[--color-text-default]">
          {space.space_name}
        </p>
        <p className="text-xs text-[--color-text-muted] font-mono mt-0.5">
          {space.space_id}
        </p>
      </div>

      {/* ── 啟用此空間 ──────────────────────────────────── */}
      <div className="border-t border-[--color-border-default] px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-[--color-text-default]">啟用此空間</p>
            <p className="text-xs text-[--color-text-muted] mt-0.5">
              停用後此空間的訊息不會觸發任何動作
            </p>
          </div>
          <Toggle
            checked={space.enabled}
            onChange={(val) =>
              withSaving("enabled", () => onEnabledChange(space.space_id, val))
            }
            ariaLabel={`啟用 ${space.space_name}`}
            saving={savingField === "enabled"}
          />
        </div>
      </div>

      {/* ── Mention-only ─────────────────────────────────── */}
      <div className="border-t border-[--color-border-default] px-4 py-3">
        <div className="flex items-center justify-between">
          <div className={isDisabled ? "opacity-50" : ""}>
            <p className="text-sm text-[--color-text-default]">只在 @提及 時觸發</p>
            <p className="text-xs text-[--color-text-muted] mt-0.5">
              開啟後只有直接 @我 的訊息才會產生草稿
            </p>
          </div>
          <Toggle
            checked={space.mention_only}
            onChange={(val) =>
              withSaving("mention_only", () =>
                onMentionOnlyChange(space.space_id, val)
              )
            }
            ariaLabel="只在被 @提及 時觸發"
            disabled={isDisabled}
            saving={savingField === "mention_only"}
          />
        </div>
      </div>

      {/* ── Auto-mode Override ───────────────────────────── */}
      <div className="border-t border-[--color-border-default] px-4 py-3">
        <fieldset disabled={isDisabled}>
          <legend className="text-sm text-[--color-text-default] mb-2">
            Auto 模式覆寫
          </legend>
          <div
            className={[
              "flex flex-wrap gap-x-4 gap-y-1.5",
              isDisabled ? "opacity-50" : "",
            ].join(" ")}
          >
            {autoModeOptions.map((opt) => (
              <label
                key={opt.value}
                className={[
                  "flex items-center gap-1.5 cursor-pointer",
                  "text-sm",
                  space.auto_mode_override === opt.value
                    ? "text-[--color-primary-600] font-medium"
                    : "text-[--color-text-secondary]",
                  isDisabled ? "cursor-not-allowed" : "",
                ].join(" ")}
              >
                <input
                  type="radio"
                  name={`auto_mode_override_${space.space_id}`}
                  value={opt.value}
                  checked={space.auto_mode_override === opt.value}
                  onChange={() =>
                    !isDisabled &&
                    withSaving("auto_mode_override", () =>
                      onAutoModeOverrideChange(space.space_id, opt.value)
                    )
                  }
                  disabled={isDisabled}
                  className="accent-[--color-primary-600] w-4 h-4"
                />
                {opt.label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      {/* ── Blocked Keywords ─────────────────────────────── */}
      <div className="border-t border-[--color-border-default] px-4 py-3">
        <div className={isDisabled ? "opacity-50 pointer-events-none" : ""}>
          <label className="block text-sm text-[--color-text-default] mb-1.5">
            封鎖關鍵字
          </label>
          <KeywordChipInput
            keywords={space.blocked_keywords}
            onChange={(kws) =>
              withSaving("blocked_keywords", () =>
                onBlockedKeywordsChange(space.space_id, kws)
              )
            }
            placeholder="輸入關鍵字，按 Enter 新增"
            disabled={isDisabled}
          />
          <p className="mt-1 text-xs text-[--color-text-muted]">
            含有這些關鍵字的訊息不會觸發草稿
          </p>
        </div>
      </div>

      {/* ── Error Banner（API 失敗時顯示） ──────────────── */}
      {errorMessage && (
        <div
          role="alert"
          className={[
            "flex items-center gap-2 px-4 py-2",
            "text-xs text-[--color-error-strong]",
            "bg-[--color-error-subtle]",
            "border-t border-[--color-error-default]",
          ].join(" ")}
        >
          <AlertCircle size={12} aria-hidden="true" />
          {errorMessage}
        </div>
      )}
    </article>
  );
}

// ---- 使用示範 ----

// 啟用狀態
<ChannelCard
  space={{
    space_id: "spaces/AAAA",
    space_name: "Team #frontend",
    enabled: true,
    mention_only: false,
    auto_mode_override: "inherit",
    blocked_keywords: ["薪水", "辭職"],
  }}
  onEnabledChange={(id, val) => console.log("enabled:", id, val)}
  onMentionOnlyChange={(id, val) => console.log("mention_only:", id, val)}
  onAutoModeOverrideChange={(id, val) => console.log("auto_override:", id, val)}
  onBlockedKeywordsChange={(id, kws) => console.log("keywords:", id, kws)}
/>

// 停用狀態（enabled = false）
<ChannelCard
  space={{
    space_id: "spaces/BBBB",
    space_name: "Project Alpha",
    enabled: false,
    mention_only: false,
    auto_mode_override: "always_off",
    blocked_keywords: [],
  }}
  onEnabledChange={(id, val) => console.log("enabled:", id, val)}
  onMentionOnlyChange={(id, val) => console.log("mention_only:", id, val)}
  onAutoModeOverrideChange={(id, val) => console.log("auto_override:", id, val)}
  onBlockedKeywordsChange={(id, kws) => console.log("keywords:", id, kws)}
/>
