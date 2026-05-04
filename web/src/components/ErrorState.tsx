import { AlertTriangle, RefreshCw } from 'lucide-react'

interface ErrorStateProps {
  onRetry: () => void
}

export default function ErrorState({ onRetry }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center py-20 text-center"
    >
      <AlertTriangle
        size={32}
        className="text-[--color-error-default] mb-4"
        aria-hidden="true"
      />
      <p className="text-base font-medium text-[--color-text-default] mb-1">
        載入失敗
      </p>
      <p className="text-sm text-[--color-text-muted] mb-6">
        無法取得草稿列表
      </p>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 rounded-sm border border-[--color-border-default] bg-[--color-surface-default] px-3 py-1.5 text-sm font-medium text-[--color-text-default] hover:bg-[--color-surface-subtle] transition-colors"
        aria-label="重新載入草稿列表"
      >
        <RefreshCw size={14} aria-hidden="true" />
        重試
      </button>
    </div>
  )
}
