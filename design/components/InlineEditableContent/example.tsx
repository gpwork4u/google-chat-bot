// InlineEditableContent 使用範例
// 基於 Tailwind v4 + React（TypeScript）

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown"; // 或專案既有 markdown renderer
import { Loader2 } from "lucide-react";

interface InlineEditableContentProps {
  value: string;
  isEditing: boolean;
  onSave: (newValue: string) => Promise<void>;
  onCancel: () => void;
  isSaving?: boolean;
  "data-testid"?: string;
}

function InlineEditableContent({
  value,
  isEditing,
  onSave,
  onCancel,
  isSaving = false,
  "data-testid": testId = "candidate-fact-content",
}: InlineEditableContentProps) {
  const [draft, setDraft] = useState(value);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 進入編輯模式時自動 focus
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      // 游標移到末端
      textareaRef.current.selectionStart = textareaRef.current.value.length;
    }
  }, [isEditing]);

  // 離開編輯模式時重設草稿
  useEffect(() => {
    if (!isEditing) setDraft(value);
  }, [isEditing, value]);

  // Auto-resize textarea
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDraft(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      onCancel();
    }
    // Enter 不觸發 save（允許換行）
  };

  if (isEditing) {
    return (
      <div className="flex flex-col gap-0">
        <label htmlFor="fact-content-edit" className="sr-only">
          fact 內容編輯
        </label>
        <textarea
          id="fact-content-edit"
          ref={textareaRef}
          data-testid={testId}
          value={draft}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          disabled={isSaving}
          aria-label="fact 內容"
          aria-busy={isSaving}
          className={[
            "w-full resize-none",
            "min-h-[80px] max-h-[240px] overflow-y-auto",
            "text-sm text-[--color-text-default]",
            "bg-[--color-surface-subtle]",
            "border border-[--color-border-default] rounded-[--radius-sm]",
            "px-3 py-2",
            "focus:outline-none focus:ring-2 focus:ring-[--color-border-focus]",
            "transition-colors duration-[--duration-fast]",
            "disabled:opacity-50",
          ].join(" ")}
        />
        <div className="flex items-center justify-end gap-2 mt-2">
          {/* 取消按鈕 */}
          <button
            type="button"
            data-testid="candidate-fact-cancel-btn"
            onClick={onCancel}
            disabled={isSaving}
            className={[
              "h-7 px-3 text-sm font-medium",
              "text-[--color-text-secondary]",
              "hover:bg-[--color-surface-muted]",
              "rounded-[--radius-sm]",
              "transition-colors duration-[--duration-fast]",
              "focus:outline-none focus:ring-2 focus:ring-[--color-border-focus]",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            ].join(" ")}
          >
            取消
          </button>
          {/* 儲存按鈕 */}
          <button
            type="button"
            data-testid="candidate-fact-save-btn"
            onClick={() => onSave(draft)}
            disabled={isSaving || draft.trim() === ""}
            aria-busy={isSaving}
            className={[
              "h-7 px-3 text-sm font-medium",
              "inline-flex items-center gap-1.5",
              "text-[--color-text-inverse]",
              "bg-[--color-primary-500]",
              "hover:bg-[--color-primary-600]",
              "active:bg-[--color-primary-700]",
              "rounded-[--radius-sm]",
              "transition-colors duration-[--duration-fast]",
              "focus:outline-none focus:ring-2 focus:ring-[--color-border-focus]",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            ].join(" ")}
          >
            {isSaving && (
              <Loader2 size={13} className="animate-spin" aria-hidden="true" />
            )}
            儲存
          </button>
        </div>
      </div>
    );
  }

  // 顯示模式
  return (
    <div
      data-testid={testId}
      className={[
        "text-sm text-[--color-text-default] leading-[--leading-relaxed]",
        "max-h-[120px] overflow-y-auto",
        "prose prose-sm max-w-none",
      ].join(" ")}
    >
      <ReactMarkdown>{value}</ReactMarkdown>
    </div>
  );
}

// --- 用法：CandidateFactRow 中控制編輯狀態 ---
function CandidateFactRowUsageExample() {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (newValue: string) => {
    setIsSaving(true);
    try {
      await fetch(`/api/space-facts/${factId}`, {
        method: "PATCH",
        body: JSON.stringify({ content: newValue }),
        headers: { "Content-Type": "application/json" },
      });
      setIsEditing(false);
      // parent triggers toast: TOAST.factEdited
    } catch {
      // parent triggers toast: TOAST.factSaveFailed
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <InlineEditableContent
      value="這個 space 使用 **Go** 作為後端語言，API 框架選用 Gin。"
      isEditing={isEditing}
      onSave={handleSave}
      onCancel={() => setIsEditing(false)}
      isSaving={isSaving}
      data-testid="candidate-fact-content"
    />
  );
}
