import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { SentRecord } from '../types/sent'
import { TESTIDS } from '../contracts'

interface SentRecordCardProps {
  record: SentRecord
}

function formatDateTime(isoString: string): string {
  try {
    return new Date(isoString).toLocaleString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return isoString
  }
}

export default function SentRecordCard({ record }: SentRecordCardProps) {
  const [expanded, setExpanded] = useState(false)

  const modeBadgeClass =
    record.mode === 'auto'
      ? 'bg-amber-100 text-amber-700 border-amber-200'
      : 'bg-blue-100 text-blue-700 border-blue-200'

  const modeLabel = record.mode === 'auto' ? '自動送出' : '已審核'

  return (
    <article
      className="rounded-md border border-[--color-border-default] bg-[--color-surface-default] shadow-sm transition-all duration-150"
      data-testid={TESTIDS.SENT_RECORD}
      data-record-id={record.id}
      data-sent-at={record.sent_at}
      data-space-id={record.space_id}
    >
      <button
        className="w-full text-left px-4 py-3 flex items-start gap-3"
        onClick={() => setExpanded(o => !o)}
        aria-expanded={expanded}
      >
        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span data-testid={TESTIDS.SPACE_NAME} className="text-sm font-semibold text-[--color-text-default] truncate">
              {record.space_name}
            </span>
            <span className="text-xs text-[--color-text-muted]">·</span>
            <span data-testid={TESTIDS.SENDER_NAME} className="text-xs text-[--color-text-muted]">{record.sender_name}</span>
            <span className="text-xs text-[--color-text-muted]">·</span>
            <time className="text-xs text-[--color-text-muted]" dateTime={record.sent_at}>
              {formatDateTime(record.sent_at)}
            </time>
          </div>

          {/* Mode badge + edited badge */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${modeBadgeClass}`}
              data-testid={TESTIDS.MODE_BADGE}
              data-mode={record.mode}
            >
              {modeLabel}
            </span>
            {record.edited_by_user && (
              <span
                className="inline-flex items-center rounded-full border border-purple-200 bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700"
                data-testid={TESTIDS.EDITED_BADGE}
              >
                使用者編輯過
              </span>
            )}
          </div>

          {/* Trigger message */}
          <div className="text-xs text-[--color-text-muted] mb-1">
            <span className="font-medium">對方：</span>
            <span className="line-clamp-1">{record.trigger_message}</span>
          </div>

          {/* Sent content */}
          <div data-testid={TESTIDS.SENT_CONTENT} className="text-sm text-[--color-text-default]">
            <span className="text-xs font-medium text-[--color-text-muted]">送出：</span>
            <span className="line-clamp-2">{record.sent_content}</span>
          </div>
        </div>

        {/* Expand chevron */}
        <ChevronDown
          size={14}
          className={`shrink-0 mt-1 text-[--color-text-muted] transition-transform duration-150 ${expanded ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div data-testid={TESTIDS.RECORD_DETAIL} className="px-4 pb-4 border-t border-[--color-border-default] pt-3">
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-xs font-medium text-[--color-text-muted] uppercase tracking-wide">
                觸發訊息
              </span>
              <p className="mt-0.5 text-[--color-text-default]">{record.trigger_message}</p>
            </div>
            <div>
              <span className="text-xs font-medium text-[--color-text-muted] uppercase tracking-wide">
                送出內容
              </span>
              <p className="mt-0.5 text-[--color-text-default]">{record.sent_content}</p>
            </div>
            {record.category && (
              <div data-testid={TESTIDS.CATEGORY}>
                <span className="text-xs font-medium text-[--color-text-muted] uppercase tracking-wide">
                  類別
                </span>
                <p className="mt-0.5 text-[--color-text-default]">{record.category}</p>
              </div>
            )}
            {record.edited_by_user && (
              <div
                className="text-xs text-purple-700 bg-purple-50 border border-purple-200 rounded-sm px-2 py-1"
                data-testid={TESTIDS.EDITED_BADGE}
              >
                使用者在核准前編輯過此草稿
              </div>
            )}
          </div>
        </div>
      )}
    </article>
  )
}
