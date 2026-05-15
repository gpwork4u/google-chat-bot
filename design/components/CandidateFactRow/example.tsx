// CandidateFactRow 使用範例
// 基於 Tailwind v4 + React（TypeScript）
// 此元件整合 CategoryBadge, VisibilitySelect, InlineEditableContent,
//   SourceMessageList, ConfirmDialog

import { useState } from "react";
import { Loader2, Check, Pencil, X } from "lucide-react";

type Category = "product" | "my-role" | "glossary" | "pinned-decision" | "relation";
type Visibility = "public" | "private" | "secret";
type RowState = "idle" | "editing" | "approving" | "saving" | "rejecting" | "reject-loading" | "done";

interface CandidateFact {
  id: string;
  space_key: string;
  category: Category;
  content: string;
  visibility: Visibility;
  source_message_ids: number[];
  created_at: string;
}

interface CandidateFactRowProps {
  fact: CandidateFact;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
  onPatch: (id: string, patch: { content?: string; visibility?: Visibility; category?: Category }) => Promise<void>;
}

const categoryLabels: Record<Category, string> = {
  product: "產品",
  "my-role": "我的角色",
  glossary: "術語",
  "pinned-decision": "決議",
  relation: "人物",
};

function CandidateFactRow({ fact, onApprove, onReject, onPatch }: CandidateFactRowProps) {
  const [rowState, setRowState] = useState<RowState>("idle");
  const [showConfirmReject, setShowConfirmReject] = useState(false);
  const [editCategory, setEditCategory] = useState<Category>(fact.category);

  const isEditing = rowState === "editing";
  const isDisabled = ["approving", "saving", "reject-loading"].includes(rowState);

  const handleApprove = async () => {
    setRowState("approving");
    try {
      await onApprove(fact.id);
      setRowState("done");
    } catch {
      setRowState("idle");
      // parent shows TOAST.factSaveFailed
    }
  };

  const handleRejectClick = () => {
    setShowConfirmReject(true);
    setRowState("rejecting");
  };

  const handleRejectConfirm = async () => {
    setRowState("reject-loading");
    try {
      await onReject(fact.id);
      setShowConfirmReject(false);
      setRowState("done");
    } catch {
      setRowState("idle");
      setShowConfirmReject(false);
    }
  };

  const handleSave = async (newContent: string) => {
    setRowState("saving");
    try {
      await onPatch(fact.id, { content: newContent, category: editCategory });
      setRowState("idle");
      // parent shows TOAST.factEdited
    } catch {
      setRowState("editing");
      // parent shows TOAST.factSaveFailed
    }
  };

  const handleVisibilityChange = async (newVisibility: Visibility) => {
    try {
      await onPatch(fact.id, { visibility: newVisibility });
      // parent shows TOAST.factEdited
    } catch {
      // parent shows TOAST.factSaveFailed
    }
  };

  return (
    <>
      <article
        data-testid="candidate-fact-row"
        data-fact-id={fact.id}
        role="article"
        aria-label={`fact：${categoryLabels[fact.category]} - ${fact.content.slice(0, 30)}`}
        className={[
          "border border-[--color-border-default] rounded-[--radius-md]",
          "bg-[--color-surface-default] p-4",
          "hover:border-[--color-border-strong]",
          "transition-all duration-200",
          rowState === "approving" ? "opacity-75" : "",
          rowState === "done" ? "opacity-0 -translate-y-1 scale-95" : "",
        ].filter(Boolean).join(" ")}
      >
        {/* 頂列：category + visibility */}
        <div className="flex items-center justify-between gap-2 mb-3">
          {isEditing ? (
            // 編輯模式：category select
            <select
              value={editCategory}
              onChange={(e) => setEditCategory(e.target.value as Category)}
              aria-label="分類"
              className={[
                "h-8 px-2.5 py-1 text-xs font-medium",
                "bg-[--color-surface-default]",
                "border border-[--color-border-default] rounded-[--radius-sm]",
                "focus:outline-none focus:ring-2 focus:ring-[--color-border-focus]",
              ].join(" ")}
            >
              {(Object.entries(categoryLabels) as [Category, string][]).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          ) : (
            <CategoryBadge
              category={fact.category}
              size="sm"
              data-testid="candidate-fact-category"
            />
          )}

          <VisibilitySelect
            value={fact.visibility}
            onChange={handleVisibilityChange}
            disabled={isDisabled}
            data-testid="candidate-fact-visibility-select"
          />
        </div>

        {/* Content（顯示 / 編輯） */}
        <InlineEditableContent
          value={fact.content}
          isEditing={isEditing}
          onSave={handleSave}
          onCancel={() => { setRowState("idle"); setEditCategory(fact.category); }}
          isSaving={rowState === "saving"}
          data-testid="candidate-fact-content"
        />

        {/* Source messages（只在非編輯模式顯示） */}
        {!isEditing && (
          <div className="mt-2">
            <SourceMessageList
              factId={fact.id}
              sourceMessageIds={fact.source_message_ids}
              data-testid-toggle="candidate-fact-source-toggle"
              data-testid-list="candidate-fact-source-list"
            />
          </div>
        )}

        {/* Action buttons（非編輯模式） */}
        {!isEditing && (
          <div className="flex items-center gap-2 mt-3">
            {/* 核准 */}
            <button
              type="button"
              data-testid="candidate-fact-approve-btn"
              onClick={handleApprove}
              disabled={isDisabled}
              aria-label="核准此 fact"
              aria-busy={rowState === "approving"}
              className={[
                "h-7 px-3 text-xs font-medium",
                "inline-flex items-center gap-1",
                "text-[--color-text-inverse] bg-[--color-primary-500]",
                "hover:bg-[--color-primary-600] active:bg-[--color-primary-700]",
                "rounded-[--radius-sm]",
                "focus:outline-none focus:ring-2 focus:ring-[--color-border-focus]",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "transition-colors duration-[--duration-fast]",
              ].join(" ")}
            >
              {rowState === "approving" ? (
                <Loader2 size={12} className="animate-spin" aria-hidden="true" />
              ) : (
                <Check size={12} aria-hidden="true" />
              )}
              核准
            </button>

            {/* 編輯 */}
            <button
              type="button"
              data-testid="candidate-fact-edit-btn"
              onClick={() => setRowState("editing")}
              disabled={isDisabled}
              aria-label="編輯此 fact"
              className={[
                "h-7 px-3 text-xs font-medium",
                "inline-flex items-center gap-1",
                "text-[--color-text-secondary]",
                "border border-[--color-border-default]",
                "hover:bg-[--color-surface-muted]",
                "rounded-[--radius-sm]",
                "focus:outline-none focus:ring-2 focus:ring-[--color-border-focus]",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "transition-colors duration-[--duration-fast]",
              ].join(" ")}
            >
              <Pencil size={12} aria-hidden="true" />
              編輯
            </button>

            {/* 拒絕 */}
            <button
              type="button"
              data-testid="candidate-fact-reject-btn"
              onClick={handleRejectClick}
              disabled={isDisabled}
              aria-label="拒絕此 fact"
              className={[
                "h-7 px-3 text-xs font-medium",
                "inline-flex items-center gap-1",
                "text-[--color-text-inverse] bg-[--color-error-default]",
                "hover:bg-[--color-error-strong]",
                "rounded-[--radius-sm]",
                "focus:outline-none focus:ring-2 focus:ring-[--color-error-default]",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "transition-colors duration-[--duration-fast]",
              ].join(" ")}
            >
              <X size={12} aria-hidden="true" />
              拒絕
            </button>
          </div>
        )}
      </article>

      {/* Reject ConfirmDialog */}
      <ConfirmDialog
        isOpen={showConfirmReject}
        title="確定拒絕？"
        description="此操作不可復原。被拒絕的 fact 無法再次核准，需重新執行 mining 才會產生新的 candidate。"
        confirmLabel="拒絕"
        cancelLabel="取消"
        variant="danger"
        isLoading={rowState === "reject-loading"}
        onConfirm={handleRejectConfirm}
        onCancel={() => { setShowConfirmReject(false); setRowState("idle"); }}
      />
    </>
  );
}

// --- 用法（candidates page 內） ---
<CandidateFactRow
  fact={{
    id: "fact-123",
    space_key: "abc-xyz",
    category: "product",
    content: "這個 space 使用 **Go** 作為後端語言，API 框架選用 Gin，資料庫是 PostgreSQL。",
    visibility: "private",
    source_message_ids: [100, 101, 105],
    created_at: "2026-05-14T10:00:00Z",
  }}
  onApprove={async (id) => {
    await fetch(`/api/space-facts/${id}/approve`, { method: "POST" });
  }}
  onReject={async (id) => {
    await fetch(`/api/space-facts/${id}/reject`, { method: "POST" });
  }}
  onPatch={async (id, patch) => {
    await fetch(`/api/space-facts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
      headers: { "Content-Type": "application/json" },
    });
  }}
/>
