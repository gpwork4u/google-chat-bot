/**
 * MessageList — renders a list of pending/skipped/drafted message rows.
 * Used by PendingPage for all three tabs.
 *
 * F-013: /pending page.
 */
import { useState } from 'react'
import { TESTIDS, TOAST, LABELS, type ManualSkipReason } from '../contracts'
import SkipReasonMenu from './SkipReasonMenu'
import type { PendingMessage, PendingTab } from '../hooks/usePending'

const MAX_BODY_CHARS = 100

function truncateBody(body: string): { short: string; isTruncated: boolean } {
  // Count by character (not byte), handles emoji / multi-script
  const chars = [...body]
  if (chars.length <= MAX_BODY_CHARS) return { short: body, isTruncated: false }
  return { short: chars.slice(0, MAX_BODY_CHARS).join('') + '…', isTruncated: true }
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return '剛剛'
  if (mins < 60) return `${mins} 分鐘前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} 小時前`
  const days = Math.floor(hours / 24)
  return `${days} 天前`
}

const SKIP_REASON_DISPLAY: Record<string, string> = {
  'pure-ack': '純確認',
  'overheard': '旁聽',
  'policy-redline': '政策紅線',
  'not-targeted': '非針對我',
  'low-info': '資訊不足',
  'manual-other': '其他',
  'not-mentioned': '未被 @',
  'self-sent': '自送',
  'skill': 'skill',
  'backend_auto': '自動',
  'manual': '手動',
  'backfill': 'backfill',
}

const BY_LABELS: Record<string, string> = {
  skill: 'skill',
  backend_auto: '後端自動',
  manual: '手動',
  backfill: 'backfill',
}

interface MessageRowProps {
  row: PendingMessage
  tab: PendingTab
  onSkip: (messageId: string | number, reason: ManualSkipReason) => Promise<void>
  onUnskip: (messageId: string | number) => Promise<void>
  skipInProgress: Set<string>
}

function MessageRow({ row, tab, onSkip, onUnskip, skipInProgress }: MessageRowProps) {
  const [expanded, setExpanded] = useState(false)
  const [showReasonMenu, setShowReasonMenu] = useState(false)
  const msgIdStr = String(row.message_id)
  const isActing = skipInProgress.has(msgIdStr)

  const body = row.body || ''
  const { short, isTruncated } = truncateBody(body)
  const displayBody = expanded ? body : short
  const isEmpty = body.trim() === ''

  return (
    <article
      data-testid={TESTIDS.PENDING_ROW}
      data-message-id={msgIdStr}
      className="relative rounded-md border border-gray-700 bg-gray-900 px-4 py-3 flex flex-col gap-1.5"
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <span className="font-mono text-xs text-gray-500">#{msgIdStr}</span>
          <span className="text-sm font-medium text-gray-200 truncate">{row.space_name || row.space_key}</span>
          <span className="text-gray-600 text-sm">/</span>
          <span className="text-sm text-gray-400 truncate">{row.sender_name}</span>
          {row.mentioned && (
            <span className="inline-flex items-center rounded-sm bg-indigo-900 px-1.5 py-0.5 text-xs font-medium text-indigo-200">
              @我
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className="relative flex-shrink-0 flex gap-2">
          {tab === 'pending' && (
            <div className="relative">
              <button
                type="button"
                data-testid={TESTIDS.PENDING_SKIP_BTN}
                disabled={isActing}
                onClick={() => setShowReasonMenu(v => !v)}
                className="rounded-sm px-2.5 py-1 text-xs font-medium text-amber-400 border border-amber-700 hover:bg-amber-900/40 disabled:opacity-40 transition-colors"
              >
                {isActing ? '處理中...' : LABELS.BUTTON_SKIP}
              </button>
              {showReasonMenu && (
                <SkipReasonMenu
                  onSelect={async reason => {
                    setShowReasonMenu(false)
                    await onSkip(row.message_id, reason)
                  }}
                  onClose={() => setShowReasonMenu(false)}
                />
              )}
            </div>
          )}
          {tab === 'skipped' && (
            <button
              type="button"
              data-testid={TESTIDS.PENDING_UNSKIP_BTN}
              disabled={isActing}
              onClick={() => void onUnskip(row.message_id)}
              className="rounded-sm px-2.5 py-1 text-xs font-medium text-green-400 border border-green-700 hover:bg-green-900/40 disabled:opacity-40 transition-colors"
            >
              {isActing ? '處理中...' : LABELS.BUTTON_UNSKIP}
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="text-sm text-gray-300 leading-relaxed break-words">
        {isEmpty ? (
          <span className="italic text-gray-500">(空訊息)</span>
        ) : (
          <>
            <span className="whitespace-pre-wrap">{displayBody}</span>
            {isTruncated && (
              <button
                type="button"
                data-testid={TESTIDS.PENDING_ROW_EXPAND}
                onClick={() => setExpanded(v => !v)}
                className="ml-1 text-xs text-indigo-400 hover:text-indigo-300 underline"
              >
                {expanded ? '收起' : '展開全文'}
              </button>
            )}
          </>
        )}
      </div>

      {/* Footer: timestamp + skip info */}
      <div className="flex flex-wrap items-center gap-2 mt-0.5">
        <span
          className="text-xs text-gray-500"
          title={row.observed_at}
        >
          {relativeTime(row.observed_at)}
        </span>

        {tab === 'pending' && (
          <span className="text-xs text-gray-600">等待 skill 處理</span>
        )}

        {tab === 'skipped' && (
          <>
            {row.skip_reason && (
              <span className="inline-flex items-center rounded-sm bg-gray-800 px-1.5 py-0.5 text-xs text-gray-400 border border-gray-700">
                {SKIP_REASON_DISPLAY[row.skip_reason] ?? row.skip_reason}
              </span>
            )}
            {row.skipped_by && (
              <span className="inline-flex items-center rounded-sm bg-gray-800 px-1.5 py-0.5 text-xs text-gray-500 border border-gray-700">
                by: {BY_LABELS[row.skipped_by] ?? row.skipped_by}
              </span>
            )}
          </>
        )}
      </div>
    </article>
  )
}

interface MessageListProps {
  rows: PendingMessage[]
  tab: PendingTab
  isLoading: boolean
  error: Error | undefined
  hasMore: boolean
  onSkip: (messageId: string | number, reason: ManualSkipReason) => Promise<void>
  onUnskip: (messageId: string | number) => Promise<void>
  onLoadMore: () => void
  onRetry: () => void
  skipInProgress: Set<string>
}

export default function MessageList({
  rows,
  tab,
  isLoading,
  error,
  hasMore,
  onSkip,
  onUnskip,
  onLoadMore,
  onRetry,
  skipInProgress,
}: MessageListProps) {
  if (isLoading && rows.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-500 text-sm">
        載入中...
      </div>
    )
  }

  if (error) {
    return (
      <div
        data-testid={TESTIDS.ERROR_STATE}
        className="flex flex-col items-center justify-center py-16 gap-3"
      >
        <p className="text-red-400 text-sm">載入失敗，請重試</p>
        <button
          type="button"
          onClick={onRetry}
          className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-sm hover:bg-indigo-500 transition-colors"
        >
          重試
        </button>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div
        data-testid={TESTIDS.PENDING_EMPTY_STATE}
        className="flex flex-col items-center justify-center py-20 text-center text-gray-500"
      >
        <p className="text-base">
          {tab === 'pending'
            ? TOAST.PENDING_EMPTY
            : tab === 'skipped'
              ? '沒有 Skipped 訊息'
              : '沒有 Drafted 訊息'}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {rows.map(row => (
        <MessageRow
          key={String(row.message_id)}
          row={row}
          tab={tab}
          onSkip={onSkip}
          onUnskip={onUnskip}
          skipInProgress={skipInProgress}
        />
      ))}

      {hasMore && (
        <div className="flex justify-center py-4">
          <button
            type="button"
            data-testid={TESTIDS.PENDING_LOAD_MORE}
            onClick={onLoadMore}
            className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            載入更多
          </button>
        </div>
      )}
    </div>
  )
}
