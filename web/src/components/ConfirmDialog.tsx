// ConfirmDialog — reusable confirmation modal
// Sprint 7 (F-015)

import { useEffect, useRef } from 'react'
import { LABELS } from '../contracts'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = LABELS.BUTTON_CONFIRM,
  cancelLabel = LABELS.BUTTON_CANCEL,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) {
      confirmBtnRef.current?.focus()
    }
  }, [open])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="fixed inset-0 z-[400] flex items-center justify-center"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onCancel}
        aria-hidden="true"
      />

      {/* Dialog panel */}
      <div className="relative z-10 w-full max-w-sm mx-4 rounded-lg border border-gray-700 bg-gray-900 shadow-xl p-6">
        <h2
          id="confirm-dialog-title"
          className="text-base font-semibold text-gray-100 mb-2"
        >
          {title}
        </h2>
        {message && (
          <p className="text-sm text-gray-400 mb-4">{message}</p>
        )}
        <div className="flex justify-end gap-3 mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-1.5 text-sm text-gray-400 hover:text-gray-200 rounded-sm transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={onConfirm}
            className="px-4 py-1.5 text-sm bg-red-700 text-white rounded-sm hover:bg-red-600 transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
