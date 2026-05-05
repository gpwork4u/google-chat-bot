import { useRef, useState } from 'react'
import {
  Check,
  Save,
  X,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react'
import type { Draft, DraftCategory } from '../types/draft'
import { TESTIDS } from '../contracts'

export type CardStatus = 'pending' | 'approving' | 'sending' | 'done' | 'error'

interface ApprovalCardProps {
  draft: Draft
  isFocused: boolean
  status: CardStatus
  editedContent: string
  onContentChange: (id: number, content: string) => void
  onApprove: (id: number, content: string) => void
  onReject: (id: number) => void
  onSave: (id: number, content: string) => void
  onRetry: (id: number) => void
  textareaRef?: React.RefObject<HTMLTextAreaElement>
}

const categoryLabel: Record<DraftCategory, string> = {
  'daily-chat': '閒聊',
  'work-coordination': '工作協調',
  engineering: '工程',
  skip: '略過',
}

const categoryBadgeClass: Record<DraftCategory, string> = {
  'daily-chat':
    'bg-[--color-category-chat-bg] text-[--color-category-chat-text] border-[--color-category-chat-border]',
  'work-coordination':
    'bg-[--color-category-work-bg] text-[--color-category-work-text] border-[--color-category-work-border]',
  engineering:
    'bg-[--color-category-eng-bg] text-[--color-category-eng-text] border-[--color-category-eng-border]',
  skip:
    'bg-[--color-category-skip-bg] text-[--color-category-skip-text] border-[--color-category-skip-border]',
}

function formatRelativeTime(isoString: string): string {
  try {
    const diff = Date.now() - new Date(isoString).getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return '剛才'
    if (minutes < 60) return `${minutes} 分鐘前`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours} 小時前`
    return `${Math.floor(hours / 24)} 天前`
  } catch {
    return ''
  }
}

const kbdClass = [
  'inline-flex items-center justify-center',
  'h-4 px-1',
  'text-2xs text-[--color-text-muted]',
  'bg-[--color-surface-muted]',
  'border border-[--color-border-default]',
  'rounded-xs',
  'font-mono',
].join(' ')

export default function ApprovalCard({
  draft,
  isFocused,
  status,
  editedContent,
  onContentChange,
  onApprove,
  onReject,
  onSave,
  onRetry,
  textareaRef,
}: ApprovalCardProps) {
  const [contextOpen, setContextOpen] = useState(false)
  const [debugOpen, setDebugOpen] = useState(false)
  const localTextareaRef = useRef<HTMLTextAreaElement>(null)
  const taRef = textareaRef ?? localTextareaRef

  const isLoading = status === 'approving' || status === 'sending'
  const isDone = status === 'done'
  const isError = status === 'error'

  const category = (draft.category ?? 'skip') as DraftCategory
  const label = categoryLabel[category] ?? category
  const badgeClass = categoryBadgeClass[category] ?? categoryBadgeClass['skip']

  const cardClass = [
    'relative rounded-md border border-[--color-border-default]',
    'bg-[--color-surface-default]',
    'shadow-[--shadow-card]',
    'transition-all duration-150',
    'border-l-2',
    isFocused
      ? 'border-l-[--color-border-focus] bg-[--color-surface-subtle]'
      : 'border-l-transparent',
    status === 'approving' ? 'opacity-75' : '',
    status === 'sending' ? 'opacity-60' : '',
    isDone ? 'opacity-0 -translate-y-1 scale-95 pointer-events-none' : '',
  ]
    .filter(Boolean)
    .join(' ')

  function autoResize(el: HTMLTextAreaElement) {
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }

  return (
    <article
      className={cardClass}
      role="article"
      aria-label={`${draft.space_name}：來自 ${draft.sender_name} 的草稿`}
      data-testid={TESTIDS.DRAFT_CARD}
      data-draft-id={draft.id}
      data-focused={isFocused ? 'true' : 'false'}
      data-created-at={draft.created_at}
      tabIndex={-1}
    >
      <div className="px-4 py-3">
        {/* Error banner */}
        {isError && (
          <div
            className={[
              'flex items-center justify-between gap-2',
              'px-3 py-2 mb-3',
              'text-xs text-[--color-error-strong]',
              'bg-[--color-error-subtle]',
              'rounded-xs',
              'animate-[--animate-fade-in]',
            ].join(' ')}
          >
            <span className="flex items-center gap-1.5">
              <AlertTriangle size={12} aria-hidden="true" />
              送出失敗
            </span>
            <button
              onClick={() => onRetry(draft.id)}
              className="flex items-center gap-1 text-xs font-medium hover:underline"
              aria-label="重試送出"
            >
              <RefreshCw size={11} aria-hidden="true" />
              重試
            </button>
          </div>
        )}

        {/* Sending overlay */}
        {status === 'sending' && (
          <div className="absolute inset-0 flex items-center justify-center bg-[--color-surface-overlay] rounded-md z-10">
            <span className="text-sm text-[--color-text-muted]">送出中...</span>
          </div>
        )}

        {/* Header */}
        <div className="flex items-start justify-between mb-1">
          <div className="flex-1 min-w-0 mr-3">
            <p className="text-sm font-semibold text-[--color-text-default] truncate" data-testid={TESTIDS.SPACE_NAME}>
              {draft.space_name}
            </p>
            <p className="text-xs text-[--color-text-muted] mt-0.5" data-testid={TESTIDS.SENDER_NAME}>
              {draft.sender_name}
              {draft.created_at && (
                <>
                  {' · '}
                  <time dateTime={draft.created_at} title={draft.created_at}>
                    {formatRelativeTime(draft.created_at)}
                  </time>
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Category badge */}
            <span
              className={`inline-flex items-center rounded-xs border px-1.5 py-0.5 text-2xs font-medium ${badgeClass}`}
              data-testid={TESTIDS.CATEGORY_LABEL}
            >
              {label}
            </span>
            {/* Context toggle */}
            {draft.context_messages?.length > 0 && (
              <button
                onClick={() => setContextOpen(o => !o)}
                className="text-[--color-text-muted] hover:text-[--color-text-default] transition-colors"
                aria-expanded={contextOpen}
                aria-controls={`ctx-${draft.id}`}
                aria-label={contextOpen ? '收合上下文' : '展開上下文'}
              >
                <ChevronDown
                  size={14}
                  className={`transition-transform duration-150 ${contextOpen ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </button>
            )}
          </div>
        </div>

        {/* Context messages */}
        {contextOpen && draft.context_messages?.length > 0 && (
          <div
            id={`ctx-${draft.id}`}
            className="mb-3 max-h-[160px] overflow-y-auto bg-[--color-surface-muted] rounded-sm px-3 py-2"
          >
            {draft.context_messages.map((msg, i) => (
              <div key={i} className="text-xs mb-1 last:mb-0">
                <span className="font-medium text-[--color-text-secondary]">
                  {msg.sender_name}:{' '}
                </span>
                <span className="text-[--color-text-muted]">{msg.content}</span>
              </div>
            ))}
          </div>
        )}

        {/* Divider */}
        <div className="border-t border-[--color-border-default] mb-3" />

        {/* Draft textarea */}
        <div className="mb-3">
          <label htmlFor={`draft-${draft.id}`} className="sr-only">
            草稿內容
          </label>
          <textarea
            id={`draft-${draft.id}`}
            ref={taRef}
            value={editedContent}
            onChange={e => {
              onContentChange(draft.id, e.target.value)
              autoResize(e.target)
            }}
            onInput={e => autoResize(e.target as HTMLTextAreaElement)}
            disabled={isLoading}
            className={[
              'w-full resize-none',
              'min-h-[64px] max-h-[200px] overflow-y-auto',
              'text-sm text-[--color-text-default]',
              'bg-[--color-surface-subtle]',
              'border border-[--color-border-default] rounded-sm',
              'px-3 py-2',
              'focus:outline-none focus:border-[--color-border-focus]',
              'focus:ring-1 focus:ring-[--color-border-focus]',
              'transition-colors duration-150',
              isLoading ? 'opacity-60 cursor-not-allowed' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          />
        </div>

        {/* Debug section */}
        {draft.debug && (
          <div className="mb-3">
            <button
              onClick={() => setDebugOpen(o => !o)}
              className="flex items-center gap-1 text-xs text-[--color-text-muted] hover:text-[--color-text-default] transition-colors"
              aria-expanded={debugOpen}
              aria-controls={`debug-${draft.id}`}
            >
              <ChevronRight
                size={12}
                className={`transition-transform duration-150 ${debugOpen ? 'rotate-90' : ''}`}
                aria-hidden="true"
              />
              debug
            </button>
            {debugOpen && (
              <div
                id={`debug-${draft.id}`}
                className="mt-1.5 bg-[--color-surface-muted] rounded-xs px-3 py-2 text-xs font-mono text-[--color-text-secondary]"
              >
                {draft.debug.categorize_reason && (
                  <div>
                    <span className="text-[--color-text-muted]">reason: </span>
                    {draft.debug.categorize_reason}
                  </div>
                )}
                {draft.debug.context_source && (
                  <div>
                    <span className="text-[--color-text-muted]">source: </span>
                    {draft.debug.context_source}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Approve */}
          <button
            onClick={() => onApprove(draft.id, editedContent)}
            disabled={isLoading}
            className={[
              'inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs font-medium',
              'bg-[--color-primary-500] text-white',
              'hover:bg-[--color-primary-600]',
              'transition-colors duration-150',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'h-7',
            ].join(' ')}
            aria-label={`核准 ${draft.space_name} 的草稿`}
          >
            {status === 'approving' ? (
              <>
                <RefreshCw size={12} className="animate-spin" aria-hidden="true" />
                送出中...
              </>
            ) : (
              <>
                <Check size={12} aria-hidden="true" />
                Approve
              </>
            )}
          </button>

          {/* Edit Saved */}
          <button
            onClick={() => onSave(draft.id, editedContent)}
            disabled={isLoading}
            className={[
              'inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs font-medium',
              'border border-[--color-border-default]',
              'bg-[--color-surface-default] text-[--color-text-default]',
              'hover:bg-[--color-surface-subtle]',
              'transition-colors duration-150',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'h-7',
            ].join(' ')}
            aria-label={`暫存 ${draft.space_name} 的草稿編輯`}
          >
            <Save size={12} aria-hidden="true" />
            Edit Saved
          </button>

          {/* Reject */}
          <button
            onClick={() => onReject(draft.id)}
            disabled={isLoading}
            className={[
              'inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs font-medium',
              'border border-[--color-border-default]',
              'bg-[--color-surface-default] text-[--color-error-default]',
              'hover:bg-[--color-error-subtle]',
              'transition-colors duration-150',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'h-7',
            ].join(' ')}
            aria-label={`拒絕 ${draft.space_name} 的草稿`}
          >
            <X size={12} aria-hidden="true" />
            Reject
          </button>

          {/* Keyboard shortcut hints (only on focused card in pending state) */}
          {isFocused && status === 'pending' && (
            <div
              className="ml-auto flex items-center gap-1 text-xs text-[--color-text-muted]"
              aria-hidden="true"
            >
              <kbd className={kbdClass}>j</kbd>
              <span>↓</span>
              <kbd className={kbdClass}>k</kbd>
              <span>↑</span>
              <kbd className={kbdClass}>↵</kbd>
              <kbd className={kbdClass}>e</kbd>
              <kbd className={kbdClass}>x</kbd>
            </div>
          )}
        </div>
      </div>
    </article>
  )
}
