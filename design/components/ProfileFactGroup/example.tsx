// ProfileFactGroup — 使用範例
// 基於 Tailwind v4 + Lucide React
// 參考 design/components/ProfileFactGroup/spec.md

import { Plus } from "lucide-react";
import { useState } from "react";
import { ProfileFactItem } from "../ProfileFactItem/example";

type FactVisibility = "public" | "private" | "secret";

interface ProfileFact {
  id: string;
  key: string;
  value: string;
  visibility: FactVisibility;
}

interface ProfileFactGroupProps {
  visibility: FactVisibility;
  facts: ProfileFact[];
  onEdit: (fact: ProfileFact) => void;
  onDelete: (id: string) => void;
  onAdd: (key: string, value: string, visibility: FactVisibility) => void;
}

const VISIBILITY_LABELS: Record<FactVisibility, string> = {
  public: "公開",
  private: "私人",
  secret: "機密",
};

const VISIBILITY_DESCRIPTIONS: Record<FactVisibility, string> = {
  public: "供 AI 在所有回覆中參考",
  private: "僅供特定情境使用",
  secret: "AI 不會在回覆中揭露這些資訊",
};

const badgeClasses: Record<FactVisibility, string> = {
  public:  "text-xs px-1.5 py-0.5 rounded-[--radius-xs] font-medium bg-[--color-success-subtle] text-[--color-success-strong]",
  private: "text-xs px-1.5 py-0.5 rounded-[--radius-xs] font-medium bg-[--color-warning-subtle] text-[--color-warning-strong]",
  secret:  "text-xs px-1.5 py-0.5 rounded-[--radius-xs] font-medium bg-[--color-error-subtle] text-[--color-error-strong]",
};

export function ProfileFactGroup({
  visibility,
  facts,
  onEdit,
  onDelete,
  onAdd,
}: ProfileFactGroupProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleAdd = () => {
    if (!newKey.trim()) {
      setAddError("名稱不能為空");
      return;
    }
    setIsSaving(true);
    setAddError(null);
    try {
      onAdd(newKey.trim(), newValue.trim(), visibility);
      setNewKey("");
      setNewValue("");
      setShowAddForm(false);
    } catch {
      setAddError("新增失敗，請重試");
    } finally {
      setIsSaving(false);
    }
  };

  const inputClasses = [
    "w-full h-8 px-2.5",
    "text-sm text-[--color-text-default]",
    "bg-[--color-surface-default]",
    "border border-[--color-border-default] rounded-sm",
    "focus:outline-none focus:border-[--color-border-focus]",
    "focus:ring-1 focus:ring-[--color-border-focus]",
  ].join(" ");

  return (
    <div
      role="group"
      aria-label={`${VISIBILITY_LABELS[visibility]} 事實分組`}
      className={[
        "rounded-md border border-[--color-border-default]",
        "bg-[--color-surface-default]",
        "overflow-hidden",
      ].join(" ")}
    >
      {/* ── 分組標題 ──────────────────────────────────────── */}
      <div
        className={[
          "flex items-center gap-2 px-4 py-2.5",
          "bg-[--color-surface-subtle]",
          "border-b border-[--color-border-default]",
        ].join(" ")}
      >
        <span className={badgeClasses[visibility]}>
          {VISIBILITY_LABELS[visibility]}
        </span>
        <span className="text-xs text-[--color-text-muted]">
          {VISIBILITY_DESCRIPTIONS[visibility]}
        </span>
      </div>

      {/* ── Facts 列表 ─────────────────────────────────────── */}
      {facts.length === 0 && !showAddForm ? (
        <p className="px-4 py-4 text-sm text-center text-[--color-text-muted]">
          尚無{VISIBILITY_LABELS[visibility]}事實
        </p>
      ) : (
        <ul
          role="list"
          aria-label={`${VISIBILITY_LABELS[visibility]}事實列表`}
          className="px-4 divide-y divide-[--color-border-default]"
        >
          {facts.map((fact) => (
            <ProfileFactItem
              key={fact.id}
              fact={fact}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}

      {/* ── 新增 inline 表單 ─────────────────────────────── */}
      {showAddForm && (
        <div
          role="form"
          aria-label={`新增${VISIBILITY_LABELS[visibility]}事實`}
          className={[
            "mx-4 my-2 p-3",
            "bg-[--color-surface-subtle]",
            "border border-[--color-border-default] rounded-sm",
            "space-y-2",
          ].join(" ")}
        >
          <div>
            <label
              htmlFor={`add-key-${visibility}`}
              className="block text-xs font-medium text-[--color-text-secondary] mb-1"
            >
              名稱 <span className="text-[--color-error-default]" aria-hidden="true">*</span>
            </label>
            <input
              id={`add-key-${visibility}`}
              type="text"
              value={newKey}
              onChange={(e) => { setNewKey(e.target.value); setAddError(null); }}
              placeholder="例：我都用敬語回主管"
              required
              aria-required="true"
              disabled={isSaving}
              className={inputClasses}
            />
          </div>
          <div>
            <label
              htmlFor={`add-value-${visibility}`}
              className="block text-xs font-medium text-[--color-text-secondary] mb-1"
            >
              內容
            </label>
            <textarea
              id={`add-value-${visibility}`}
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder="（選填）補充說明..."
              disabled={isSaving}
              rows={2}
              className={[
                "w-full px-2.5 py-1.5 resize-none",
                "text-sm text-[--color-text-default] placeholder:text-[--color-text-placeholder]",
                "bg-[--color-surface-default]",
                "border border-[--color-border-default] rounded-sm",
                "focus:outline-none focus:border-[--color-border-focus]",
                "focus:ring-1 focus:ring-[--color-border-focus]",
              ].join(" ")}
            />
          </div>
          {addError && (
            <p role="alert" className="text-xs text-[--color-error-strong]">
              {addError}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => { setShowAddForm(false); setNewKey(""); setNewValue(""); setAddError(null); }}
              disabled={isSaving}
              className={[
                "h-7 px-2.5 text-xs",
                "text-[--color-text-secondary]",
                "hover:bg-[--color-surface-muted]",
                "rounded-sm transition-colors duration-150",
                "focus:outline-none focus-visible:ring-1 focus-visible:ring-[--color-border-focus]",
                "disabled:opacity-50",
              ].join(" ")}
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleAdd}
              disabled={isSaving || !newKey.trim()}
              aria-busy={isSaving}
              className={[
                "h-7 px-2.5 text-xs font-medium",
                "bg-[--color-primary-600] text-[--color-text-inverse]",
                "rounded-sm transition-colors duration-150",
                "hover:bg-[--color-primary-500]",
                "focus:outline-none focus-visible:ring-1 focus-visible:ring-[--color-border-focus]",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              ].join(" ")}
            >
              新增
            </button>
          </div>
        </div>
      )}

      {/* ── 新增按鈕 ──────────────────────────────────────── */}
      <div
        className={[
          "px-4 py-2",
          facts.length > 0 || showAddForm ? "border-t border-[--color-border-default]" : "",
        ].join(" ")}
      >
        {!showAddForm && (
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            aria-label={`新增${VISIBILITY_LABELS[visibility]}事實`}
            className={[
              "inline-flex items-center gap-1 h-7 px-2",
              "text-xs text-[--color-text-secondary]",
              "border border-dashed border-[--color-border-strong] rounded-sm",
              "hover:bg-[--color-surface-muted] hover:border-[--color-border-strong]",
              "transition-colors duration-150",
              "focus:outline-none focus-visible:ring-1 focus-visible:ring-[--color-border-focus]",
            ].join(" ")}
          >
            <Plus size={11} aria-hidden="true" />
            新增{VISIBILITY_LABELS[visibility]}事實
          </button>
        )}
      </div>
    </div>
  );
}

// ---- 使用示範 ----

// 公開分組，有資料
<ProfileFactGroup
  visibility="public"
  facts={[
    { id: "f-001", key: "我都用敬語回主管", value: "", visibility: "public" },
    { id: "f-002", key: "回覆風格輕鬆", value: "偏口語，不要太正式", visibility: "public" },
  ]}
  onEdit={(f) => console.log("edit:", f)}
  onDelete={(id) => console.log("delete:", id)}
  onAdd={(key, value, vis) => console.log("add:", key, value, vis)}
/>

// 機密分組，空狀態
<ProfileFactGroup
  visibility="secret"
  facts={[]}
  onEdit={(f) => console.log("edit:", f)}
  onDelete={(id) => console.log("delete:", id)}
  onAdd={(key, value, vis) => console.log("add:", key, value, vis)}
/>
