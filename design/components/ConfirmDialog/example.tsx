// ConfirmDialog 使用範例
// 基於 Tailwind v4 + React（TypeScript）
// 使用原生 <dialog> 元素確保 focus trap + Escape 鍵處理

import { useEffect, useRef } from "react";
import { Loader2, AlertTriangle } from "lucide-react";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning";
  isLoading?: boolean;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
}

function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel = "確定",
  cancelLabel = "取消",
  variant = "danger",
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const titleId = "confirm-dialog-title";
  const descId = "confirm-dialog-desc";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen) {
      dialog.showModal();
      // 預設 focus 到取消按鈕（safe default）
      cancelBtnRef.current?.focus();
    } else {
      dialog.close();
    }
  }, [isOpen]);

  // Escape key → onCancel（<dialog> 原生 cancel event）
  useEffect(() => {
    const dialog = dialogRef.current;
    const handleCancel = (e: Event) => {
      e.preventDefault();
      onCancel();
    };
    dialog?.addEventListener("cancel", handleCancel);
    return () => dialog?.removeEventListener("cancel", handleCancel);
  }, [onCancel]);

  const confirmBtnClasses =
    variant === "danger"
      ? [
          "h-9 px-4 text-sm font-medium",
          "inline-flex items-center gap-1.5",
          "text-[--color-text-inverse]",
          "bg-[--color-error-default]",
          "hover:bg-[--color-error-strong]",
          "rounded-[--radius-sm]",
          "focus:outline-none focus:ring-2 focus:ring-[--color-error-default]",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "transition-colors duration-[--duration-fast]",
        ].join(" ")
      : [
          "h-9 px-4 text-sm font-medium",
          "inline-flex items-center gap-1.5",
          "text-[--color-text-inverse]",
          "bg-[--color-warning-default]",
          "hover:bg-[--color-warning-strong]",
          "rounded-[--radius-sm]",
          "focus:outline-none focus:ring-2 focus:ring-[--color-warning-default]",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "transition-colors duration-[--duration-fast]",
        ].join(" ");

  return (
    <>
      {/* Overlay（點擊關閉） */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-[--color-surface-overlay] z-[--z-overlay]"
          onClick={onCancel}
          aria-hidden="true"
        />
      )}

      {/* Native <dialog> */}
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={descId}
        aria-modal="true"
        className={[
          "fixed",
          "max-w-sm w-[calc(100%-2rem)]",
          "bg-[--color-surface-default]",
          "rounded-[--radius-lg]",
          "shadow-[--shadow-elevated]",
          "p-6",
          "z-[--z-modal]",
          // 重置 <dialog> 的預設樣式
          "border-0 outline-0",
          "animate-[--animate-slide-up]",
          // 隱藏原生 backdrop（用自訂 overlay 取代）
          "[&::backdrop]:hidden",
        ].join(" ")}
      >
        {/* Icon + Title */}
        <div className="flex items-start gap-3 mb-3">
          <AlertTriangle
            size={20}
            className="text-[--color-error-default] mt-0.5 shrink-0"
            aria-hidden="true"
          />
          <h2
            id={titleId}
            className="text-base font-semibold text-[--color-text-default]"
          >
            {title}
          </h2>
        </div>

        {/* Description */}
        <p
          id={descId}
          className="text-sm text-[--color-text-secondary] leading-[--leading-relaxed]"
        >
          {description}
        </p>

        {/* Buttons */}
        <div className="flex items-center justify-end gap-3 mt-5">
          {/* 取消（safe default focus） */}
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className={[
              "h-9 px-4 text-sm font-medium",
              "text-[--color-text-secondary]",
              "hover:bg-[--color-surface-muted]",
              "rounded-[--radius-sm]",
              "focus:outline-none focus:ring-2 focus:ring-[--color-border-focus]",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "transition-colors duration-[--duration-fast]",
            ].join(" ")}
          >
            {cancelLabel}
          </button>

          {/* 確定（danger） */}
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            aria-busy={isLoading}
            className={confirmBtnClasses}
          >
            {isLoading && (
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            )}
            {confirmLabel}
          </button>
        </div>
      </dialog>
    </>
  );
}

// --- Reject fact 使用範例 ---
<ConfirmDialog
  isOpen={showRejectDialog}
  title="確定拒絕？"
  description="此操作不可復原。被拒絕的 fact 無法再次核准，需重新執行 mining 才會產生新的 candidate。"
  confirmLabel="拒絕"
  cancelLabel="取消"
  variant="danger"
  isLoading={isRejecting}
  onConfirm={handleRejectConfirm}
  onCancel={() => setShowRejectDialog(false)}
/>

// --- Delete fact 使用範例 ---
<ConfirmDialog
  isOpen={showDeleteDialog}
  title="確定刪除？"
  description="刪除後此 fact 將永久移除，無法復原。"
  confirmLabel="刪除"
  cancelLabel="取消"
  variant="danger"
  isLoading={isDeleting}
  onConfirm={handleDeleteConfirm}
  onCancel={() => setShowDeleteDialog(false)}
/>

// --- Batch reject 使用範例 ---
<ConfirmDialog
  isOpen={showBatchRejectDialog}
  title="確定拒絕全部？"
  description={`將拒絕此 space 的所有 ${pendingCount} 筆 candidate facts，此操作不可復原。`}
  confirmLabel="全部拒絕"
  cancelLabel="取消"
  variant="danger"
  isLoading={isBatchRejecting}
  onConfirm={handleBatchRejectConfirm}
  onCancel={() => setShowBatchRejectDialog(false)}
/>
