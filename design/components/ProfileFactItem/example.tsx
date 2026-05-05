// ProfileFactItem — 使用範例
// 基於 Tailwind v4 + Lucide React
// 參考 design/components/ProfileFactItem/spec.md

import { Pencil, Trash2, Loader2 } from "lucide-react";
import { useState } from "react";

type FactVisibility = "public" | "private" | "secret";

interface ProfileFact {
  id: string;
  key: string;
  value: string;
  visibility: FactVisibility;
}

interface ProfileFactItemProps {
  fact: ProfileFact;
  onEdit: (fact: ProfileFact) => void;
  onDelete: (id: string) => void;
}

const VISIBILITY_LABELS: Record<FactVisibility, string> = {
  public: "公開",
  private: "私人",
  secret: "機密",
};

const visibilityBadgeClasses: Record<FactVisibility, string> = {
  public:  "text-xs px-1.5 py-0.5 rounded-[--radius-xs] bg-[--color-success-subtle] text-[--color-success-strong]",
  private: "text-xs px-1.5 py-0.5 rounded-[--radius-xs] bg-[--color-warning-subtle] text-[--color-warning-strong]",
  secret:  "text-xs px-1.5 py-0.5 rounded-[--radius-xs] bg-[--color-error-subtle] text-[--color-error-strong]",
};

export function ProfileFactItem({ fact, onEdit, onDelete }: ProfileFactItemProps) {
  type ViewState = "view" | "edit" | "deleting" | "saving" | "error";
  const [state, setState] = useState<ViewState>("view");
  const [editKey, setEditKey] = useState(fact.key);
  const [editValue, setEditValue] = useState(fact.value);
  const [editVisibility, setEditVisibility] = useState<FactVisibility>(fact.visibility);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSave = () => {
    if (!editKey.trim()) return;
    setState("saving");
    setErrorMsg(null);
    try {
      onEdit({ ...fact, key: editKey.trim(), value: editValue.trim(), visibility: editVisibility });
      setState("view");
    } catch {
      setState("error");
      setErrorMsg("儲存失敗，請重試");
    }
  };

  const handleDelete = () => {
    setState("saving");
    try {
      onDelete(fact.id);
    } catch {
      setState("error");
      setErrorMsg("刪除失敗，請重試");
    }
  };

  const actionBtnClasses = [
    "flex items-center justify-center",
    "w-7 h-7",
    "min-w-[44px] min-h-[44px]",
    "rounded-sm",
    "text-[--color-text-muted] hover:text-[--color-text-default]",
    "hover:bg-[--color-surface-muted]",
    "transition-colors duration-150",
    "focus:outline-none focus-visible:ring-1 focus-visible:ring-[--color-border-focus]",
  ].join(" ");

  const inputClasses = [
    "w-full h-8 px-2.5",
    "text-sm text-[--color-text-default]",
    "bg-[--color-surface-default]",
    "border border-[--color-border-default] rounded-sm",
    "focus:outline-none focus:border-[--color-border-focus]",
    "focus:ring-1 focus:ring-[--color-border-focus]",
  ].join(" ");

  return (
    <li role="listitem" className="border-b border-[--color-border-default] last:border-b-0">
      {/* ── View 狀態 ──────────────────────────────────────── */}
      {(state === "view" || state === "deleting") && (
        <div className="flex items-center gap-2 py-2">
          <span className="flex-1 text-sm text-[--color-text-default] truncate min-w-0">
            {fact.key}
          </span>

          {/* Visibility Badge */}
          <span className={visibilityBadgeClasses[fact.visibility]}>
            {VISIBILITY_LABELS[fact.visibility]}
          </span>

          {/* 刪除確認（inline） */}
          {state === "deleting" ? (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span className="text-xs text-[--color-text-secondary]">確認刪除？</span>
              <button
                type="button"
                onClick={() => setState("view")}
                className={[
                  "h-6 px-2 text-xs",
                  "text-[--color-text-secondary] hover:bg-[--color-surface-muted]",
                  "rounded-sm transition-colors duration-150",
                  "focus:outline-none focus-visible:ring-1 focus-visible:ring-[--color-border-focus]",
                ].join(" ")}
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className={[
                  "h-6 px-2 text-xs font-medium",
                  "bg-[--color-error-default] text-[--color-text-inverse]",
                  "rounded-sm transition-colors duration-150",
                  "hover:bg-[--color-error-strong]",
                  "focus:outline-none focus-visible:ring-1 focus-visible:ring-[--color-border-focus]",
                ].join(" ")}
              >
                確認刪除
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-0.5 flex-shrink-0">
              {/* 編輯按鈕 */}
              <button
                type="button"
                onClick={() => {
                  setEditKey(fact.key);
                  setEditValue(fact.value);
                  setEditVisibility(fact.visibility);
                  setState("edit");
                }}
                aria-label={`編輯：${fact.key}`}
                className={actionBtnClasses}
              >
                <Pencil size={13} aria-hidden="true" />
              </button>
              {/* 刪除按鈕 */}
              <button
                type="button"
                onClick={() => setState("deleting")}
                aria-label={`刪除：${fact.key}`}
                className={[
                  actionBtnClasses,
                  "hover:text-[--color-error-strong] hover:bg-[--color-error-subtle]",
                ].join(" ")}
              >
                <Trash2 size={13} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Edit 狀態 ──────────────────────────────────────── */}
      {(state === "edit" || state === "saving" || state === "error") && (
        <div
          role="form"
          aria-label={`編輯 ${fact.key}`}
          className={[
            "my-1 p-3",
            "bg-[--color-surface-subtle]",
            "border border-[--color-border-default] rounded-sm",
            "space-y-2",
          ].join(" ")}
        >
          {/* Key 欄位 */}
          <div>
            <label
              htmlFor={`fact-key-${fact.id}`}
              className="block text-xs font-medium text-[--color-text-secondary] mb-1"
            >
              名稱 <span className="text-[--color-error-default]" aria-hidden="true">*</span>
            </label>
            <input
              id={`fact-key-${fact.id}`}
              type="text"
              value={editKey}
              onChange={(e) => setEditKey(e.target.value)}
              required
              aria-required="true"
              disabled={state === "saving"}
              className={inputClasses}
            />
          </div>

          {/* Value 欄位 */}
          <div>
            <label
              htmlFor={`fact-value-${fact.id}`}
              className="block text-xs font-medium text-[--color-text-secondary] mb-1"
            >
              內容
            </label>
            <textarea
              id={`fact-value-${fact.id}`}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              disabled={state === "saving"}
              rows={2}
              className={[
                "w-full px-2.5 py-1.5 resize-none",
                "text-sm text-[--color-text-default]",
                "bg-[--color-surface-default]",
                "border border-[--color-border-default] rounded-sm",
                "focus:outline-none focus:border-[--color-border-focus]",
                "focus:ring-1 focus:ring-[--color-border-focus]",
              ].join(" ")}
            />
          </div>

          {/* Visibility Select */}
          <div>
            <label
              htmlFor={`fact-visibility-${fact.id}`}
              className="block text-xs font-medium text-[--color-text-secondary] mb-1"
            >
              可見性
            </label>
            <select
              id={`fact-visibility-${fact.id}`}
              value={editVisibility}
              onChange={(e) => setEditVisibility(e.target.value as FactVisibility)}
              disabled={state === "saving"}
              className={[
                inputClasses,
                "pr-7 appearance-none cursor-pointer",
              ].join(" ")}
            >
              <option value="public">公開</option>
              <option value="private">私人</option>
              <option value="secret">機密</option>
            </select>
          </div>

          {/* Error 訊息 */}
          {state === "error" && errorMsg && (
            <p role="alert" className="text-xs text-[--color-error-strong]">
              {errorMsg}
            </p>
          )}

          {/* 操作按鈕 */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => { setState("view"); setErrorMsg(null); }}
              disabled={state === "saving"}
              className={[
                "h-7 px-2.5 text-xs",
                "text-[--color-text-secondary]",
                "hover:bg-[--color-surface-muted]",
                "rounded-sm transition-colors duration-150",
                "focus:outline-none focus-visible:ring-1 focus-visible:ring-[--color-border-focus]",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              ].join(" ")}
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={state === "saving" || !editKey.trim()}
              aria-busy={state === "saving"}
              className={[
                "inline-flex items-center gap-1.5 h-7 px-2.5",
                "text-xs font-medium",
                "bg-[--color-primary-600] text-[--color-text-inverse]",
                "rounded-sm transition-colors duration-150",
                "hover:bg-[--color-primary-500]",
                "focus:outline-none focus-visible:ring-1 focus-visible:ring-[--color-border-focus]",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              ].join(" ")}
            >
              {state === "saving" && (
                <Loader2 size={11} className="animate-spin" aria-hidden="true" />
              )}
              儲存
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

// ---- 使用示範 ----

// Public fact
<ProfileFactItem
  fact={{ id: "f-001", key: "我都用敬語回主管", value: "是的，這是我的習慣", visibility: "public" }}
  onEdit={(f) => console.log("edit:", f)}
  onDelete={(id) => console.log("delete:", id)}
/>

// Secret fact
<ProfileFactItem
  fact={{ id: "f-002", key: "個人座右銘", value: "好的沒問題", visibility: "secret" }}
  onEdit={(f) => console.log("edit:", f)}
  onDelete={(id) => console.log("delete:", id)}
/>
