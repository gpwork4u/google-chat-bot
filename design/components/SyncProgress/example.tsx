// SyncProgress — 使用範例（Extension Popup 內）

// ── Running 狀態 ──
<div
  role="status"
  aria-live="polite"
  aria-label={`正在同步歷史訊息，已讀取 ${totalMessages} 則`}
  data-testid="sync-progress"
  className="flex flex-col gap-1.5 px-3 py-2.5 bg-[--color-surface-subtle] rounded-md border border-[--color-border-default]"
>
  <div className="flex items-center gap-2">
    <Loader2
      size={14}
      aria-hidden="true"
      className="text-[--color-warning-default] animate-spin shrink-0"
    />
    <span
      data-testid="sync-progress-status"
      className="text-sm font-medium text-[--color-warning-strong]"
    >
      同步中...
    </span>
    <Badge
      variant="warning"
      size="sm"
      data-testid="sync-progress-badge"
      className="ml-auto"
    >
      進行中
    </Badge>
  </div>
  <p
    data-testid="sync-progress-count"
    className="text-xs text-[--color-text-muted] pl-5"
  >
    {totalMessages} 則已讀取（{duplicateMessages} 則重複）
  </p>
</div>

// ── Completed 狀態 ──
<div
  role="status"
  aria-live="polite"
  aria-label={`同步完成，新增 ${insertedMessages} 則`}
  data-testid="sync-progress"
  className="flex flex-col gap-1.5 px-3 py-2.5 bg-[--color-surface-subtle] rounded-md border border-[--color-border-default]"
>
  <div className="flex items-center gap-2">
    <Check
      size={14}
      aria-hidden="true"
      className="text-[--color-success-default] shrink-0"
    />
    <span
      data-testid="sync-progress-status"
      className="text-sm font-medium text-[--color-success-strong]"
    >
      同步完成
    </span>
    <Badge variant="success" size="sm" data-testid="sync-progress-badge" className="ml-auto">
      完成
    </Badge>
  </div>
  <p data-testid="sync-progress-count" className="text-xs text-[--color-text-muted] pl-5">
    新增 {insertedMessages} 則・重複 {duplicateMessages} 則
  </p>
</div>

// ── Failed 狀態 ──
<div
  role="alert"
  aria-label="同步失敗，請重試"
  data-testid="sync-progress"
  className="flex flex-col gap-1.5 px-3 py-2.5 bg-[--color-surface-subtle] rounded-md border border-[--color-border-default]"
>
  <div className="flex items-center gap-2">
    <AlertCircle
      size={14}
      aria-hidden="true"
      className="text-[--color-error-default] shrink-0"
    />
    <span
      data-testid="sync-progress-status"
      className="text-sm font-medium text-[--color-error-strong]"
    >
      同步失敗
    </span>
    <Badge variant="error" size="sm" data-testid="sync-progress-badge" className="ml-auto">
      失敗
    </Badge>
  </div>
  <p data-testid="sync-progress-count" className="text-xs text-[--color-text-muted] pl-5">
    請重試
  </p>
</div>

// ── 不顯示（status=null，尚未 sync）──
{status !== null && <SyncProgress status={status} ... />}
