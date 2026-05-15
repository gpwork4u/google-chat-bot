// AddFactModal 使用範例
// 基於 Tailwind v4 + React（TypeScript）

import { useState, useEffect, useRef } from "react";
import { X, Loader2 } from "lucide-react";

type Category = "product" | "my-role" | "glossary" | "pinned-decision" | "relation";
type Visibility = "public" | "private" | "secret";

interface NewFact {
  space_key: string;
  category: Category;
  content: string;
  visibility: Visibility;
}

interface AddFactModalProps {
  isOpen: boolean;
  spaceKey: string;
  onSave: (fact: NewFact) => Promise<void>;
  onClose: () => void;
}

const categoryOptions: { value: Category; label: string }[] = [
  { value: "product", label: "產品" },
  { value: "my-role", label: "我的角色" },
  { value: "glossary", label: "術語" },
  { value: "pinned-decision", label: "決議" },
  { value: "relation", label: "人物" },
];

function AddFactModal({ isOpen, spaceKey, onSave, onClose }: AddFactModalProps) {
  const [category, setCategory] = useState<Category>("product");
  const [content, setContent] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("private"); // business rule default
  const [isSaving, setIsSaving] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const categorySelectRef = useRef<HTMLSelectElement>(null);
  const titleId = "add-fact-modal-title";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen) {
      dialog.showModal();
      categorySelectRef.current?.focus();
    } else {
      dialog.close();
      // Reset form
      setCategory("product");
      setContent("");
      setVisibility("private");
    }
  }, [isOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const handleCancel = (e: Event) => { e.preventDefault(); onClose(); };
    dialog?.addEventListener("cancel", handleCancel);
    return () => dialog?.removeEventListener("cancel", handleCancel);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    setIsSaving(true);
    try {
      await onSave({ space_key: spaceKey, category, content: content.trim(), visibility });
      onClose();
      // parent shows TOAST.factCreated
    } catch {
      // parent shows TOAST.factSaveFailed
    } finally {
      setIsSaving(false);
    }
  };

  const labelClass = "block text-sm font-medium text-[--color-text-default] mb-1.5";
  const selectClass = [
    "w-full h-9 px-2.5",
    "text-sm text-[--color-text-default]",
    "bg-[--color-surface-default]",
    "border border-[--color-border-default] rounded-[--radius-sm]",
    "focus:outline-none focus:ring-2 focus:ring-[--color-border-focus]",
    "disabled:opacity-50",
  ].join(" ");

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-[--color-surface-overlay] z-[--z-overlay]"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-modal="true"
        className={[
          "fixed max-w-lg w-[calc(100%-2rem)]",
          "max-h-[90vh] overflow-y-auto",
          "bg-[--color-surface-default]",
          "rounded-[--radius-lg] shadow-[--shadow-elevated]",
          "z-[--z-modal]",
          "border-0 outline-0",
          "[&::backdrop]:hidden",
          "animate-[--animate-slide-up]",
        ].join(" ")}
      >
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[--color-border-default]">
            <h2
              id={titleId}
              className="text-base font-semibold text-[--color-text-default]"
            >
              新增 fact
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="關閉新增 fact"
              className={[
                "p-1.5 rounded-[--radius-sm]",
                "text-[--color-text-muted]",
                "hover:bg-[--color-surface-muted] hover:text-[--color-text-secondary]",
                "focus:outline-none focus:ring-2 focus:ring-[--color-border-focus]",
                "transition-colors duration-[--duration-fast]",
              ].join(" ")}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-5">
            {/* 分類 */}
            <div>
              <label htmlFor="new-fact-category" className={labelClass}>
                分類
              </label>
              <select
                id="new-fact-category"
                ref={categorySelectRef}
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
                disabled={isSaving}
                className={selectClass}
              >
                {categoryOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* 內容 */}
            <div>
              <label htmlFor="new-fact-content" className={labelClass}>
                內容
              </label>
              <textarea
                id="new-fact-content"
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = `${e.target.scrollHeight}px`;
                }}
                disabled={isSaving}
                placeholder="請輸入 fact 內容（支援 markdown）"
                aria-required="true"
                className={[
                  "w-full resize-none",
                  "min-h-[100px] max-h-[300px] overflow-y-auto",
                  "text-sm text-[--color-text-default]",
                  "placeholder:text-[--color-text-placeholder]",
                  "bg-[--color-surface-subtle]",
                  "border border-[--color-border-default] rounded-[--radius-sm]",
                  "px-3 py-2",
                  "focus:outline-none focus:ring-2 focus:ring-[--color-border-focus]",
                  "disabled:opacity-50",
                ].join(" ")}
              />
            </div>

            {/* 可見性 */}
            <div>
              <label htmlFor="new-fact-visibility" className={labelClass}>
                可見性
              </label>
              <VisibilitySelect
                value={visibility}
                onChange={setVisibility}
                disabled={isSaving}
                aria-label="fact 可見性"
              />
              <p className="mt-1 text-xs text-[--color-text-muted]">
                手動新增的 fact 預設為 private（不公開顯示）
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[--color-border-default]">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className={[
                "h-9 px-4 text-sm font-medium",
                "text-[--color-text-secondary]",
                "hover:bg-[--color-surface-muted]",
                "rounded-[--radius-sm]",
                "focus:outline-none focus:ring-2 focus:ring-[--color-border-focus]",
                "disabled:opacity-50",
                "transition-colors duration-[--duration-fast]",
              ].join(" ")}
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSaving || !content.trim()}
              aria-busy={isSaving}
              className={[
                "h-9 px-4 text-sm font-medium",
                "inline-flex items-center gap-1.5",
                "text-[--color-text-inverse] bg-[--color-primary-500]",
                "hover:bg-[--color-primary-600]",
                "rounded-[--radius-sm]",
                "focus:outline-none focus:ring-2 focus:ring-[--color-border-focus]",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "transition-colors duration-[--duration-fast]",
              ].join(" ")}
            >
              {isSaving && (
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
              )}
              新增 fact
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

// --- 在 /space-facts/{space_key} 詳情頁觸發 ---
function SpaceFactDetailPageUsageExample() {
  const [showAddModal, setShowAddModal] = useState(false);

  const handleAddFact = async (newFact: NewFact) => {
    await fetch("/api/space-facts", {
      method: "POST",
      body: JSON.stringify({ ...newFact, status: "approved" }),
      headers: { "Content-Type": "application/json" },
    });
    // mutate SWR key to refresh list
  };

  return (
    <>
      <button
        type="button"
        data-testid="space-facts-add-btn"
        onClick={() => setShowAddModal(true)}
        aria-label="手動新增 fact"
        className={[
          "h-9 px-4 text-sm font-medium",
          "inline-flex items-center gap-1.5",
          "text-[--color-text-inverse] bg-[--color-primary-500]",
          "hover:bg-[--color-primary-600]",
          "rounded-[--radius-sm]",
          "focus:outline-none focus:ring-2 focus:ring-[--color-border-focus]",
          "transition-colors duration-[--duration-fast]",
        ].join(" ")}
      >
        新增 fact
      </button>

      <AddFactModal
        isOpen={showAddModal}
        spaceKey="abc-123"
        onSave={handleAddFact}
        onClose={() => setShowAddModal(false)}
      />
    </>
  );
}
