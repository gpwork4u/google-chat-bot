// MessageRow — 使用範例
// 適用於 /pending 頁三個 tab（Pending / Skipped / Drafted）

// ── Pending tab 用（有 Skip 按鈕）──
<article
  role="article"
  data-testid="pending-row"
  data-message-id="spaces/AAA/messages/BBB"
  className="group flex flex-col gap-2 px-4 py-3 border-b border-[--color-border-default] bg-[--color-surface-default] hover:bg-[--color-surface-subtle] transition-colors duration-150"
>
  {/* Header 列 */}
  <div className="flex items-start justify-between gap-2">
    <div className="flex items-center gap-2 min-w-0">
      {/* space_name badge */}
      <Badge variant="info" size="sm">Team #frontend</Badge>
      {/* sender */}
      <span className="text-sm font-medium text-[--color-text-default] truncate">Alice</span>
    </div>
    <div className="flex items-center gap-2 shrink-0">
      {/* observed_at */}
      <time
        dateTime="2026-05-14T10:00:00Z"
        title="2026-05-14T10:00:00Z"
        className="text-xs text-[--color-text-muted]"
      >
        3 分鐘前
      </time>
      {/* mentioned badge（只在 mentioned=true 時顯示）*/}
      <Badge variant="info" size="sm" aria-label="此訊息 @你">@我</Badge>
      {/* Skip 按鈕 */}
      <Button
        size="sm"
        variant="secondary"
        data-testid="pending-skip-btn"
        aria-label="略過此訊息"
        onClick={() => onSkip(message.message_id)}
      >
        Skip
      </Button>
    </div>
  </div>

  {/* message_id（桌面才顯示）*/}
  <p className="hidden md:block text-2xs font-mono text-[--color-text-muted] select-all">
    spaces/AAA/messages/BBB
  </p>

  {/* Body */}
  <p className="text-sm text-[--color-text-secondary] leading-relaxed whitespace-pre-wrap break-words">
    好的，這個 PR 的 review 意見我看了...
    {/* 超過 100 字時截斷，加展開按鈕 */}
    {!isExpanded && body.length > 100 && (
      <>
        ...
        <button
          data-testid="pending-row-expand"
          aria-expanded={false}
          className="ml-1 text-xs text-[--color-text-link] hover:underline focus:outline-none focus:underline"
          onClick={() => setIsExpanded(true)}
        >
          展開
        </button>
      </>
    )}
    {isExpanded && (
      <button
        data-testid="pending-row-expand"
        aria-expanded={true}
        className="ml-1 text-xs text-[--color-text-link] hover:underline focus:outline-none focus:underline"
        onClick={() => setIsExpanded(false)}
      >
        收合
      </button>
    )}
  </p>
</article>

// ── 空 body placeholder ──
<p
  className="text-sm italic text-[--color-text-placeholder]"
  aria-label="（空訊息）"
>
  (空訊息)
</p>

// ── Skipped tab 用（有 Unskip 按鈕 + 略過原因列）──
<article
  role="article"
  data-testid="pending-row"
  data-message-id="spaces/AAA/messages/CCC"
  className="group flex flex-col gap-2 px-4 py-3 border-b border-[--color-border-default] bg-[--color-surface-default] hover:bg-[--color-surface-subtle] transition-colors duration-150"
>
  <div className="flex items-start justify-between gap-2">
    <div className="flex items-center gap-2 min-w-0">
      <Badge variant="info" size="sm">Team #general</Badge>
      <span className="text-sm font-medium text-[--color-text-default] truncate">Bob</span>
    </div>
    <div className="flex items-center gap-2 shrink-0">
      <time dateTime="2026-05-14T09:55:00Z" title="2026-05-14T09:55:00Z" className="text-xs text-[--color-text-muted]">
        8 分鐘前
      </time>
      {/* Unskip 按鈕 */}
      <Button
        size="sm"
        variant="ghost"
        data-testid="pending-unskip-btn"
        aria-label="復原略過"
        onClick={() => onUnskip(message.message_id)}
      >
        Unskip
      </Button>
    </div>
  </div>

  {/* 略過原因列（Skipped tab 專屬）*/}
  <div className="flex items-center gap-2 text-xs text-[--color-text-muted]">
    <span>略過原因：</span>
    {/* skip_reason badge */}
    <span className="inline-flex items-center px-1.5 py-0.5 rounded-xs border text-2xs font-medium bg-[--color-neutral-100] text-[--color-neutral-500] border-[--color-neutral-200]">
      不相關（非對象）
    </span>
    <span>by</span>
    {/* skipped_by badge — manual = purple */}
    <span className="inline-flex items-center px-1.5 py-0.5 rounded-xs border text-2xs font-medium bg-[--color-skipped-manual-bg] text-[--color-skipped-manual-text] border-[--color-skipped-manual-border]">
      手動
    </span>
  </div>

  <p className="text-sm text-[--color-text-secondary] leading-relaxed whitespace-pre-wrap break-words">
    哈哈好啊，我們下週約一下！
  </p>
</article>

// ── Skip loading 狀態 ──
<article
  role="article"
  data-testid="pending-row"
  data-message-id="spaces/AAA/messages/DDD"
  className="group flex flex-col gap-2 px-4 py-3 border-b border-[--color-border-default] bg-[--color-surface-default] opacity-70"
>
  {/* ... 同上，但 Skip 按鈕 disabled + 顯示 spinner */}
  <Button size="sm" variant="secondary" disabled loading aria-label="略過此訊息">
    Skip
  </Button>
</article>
