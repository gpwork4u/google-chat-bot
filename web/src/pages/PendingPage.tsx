/**
 * PendingPage — /pending route
 *
 * Three tabs: Pending / Skipped / Drafted
 * Four filters: Space / Sender / Body / Mentioned-only
 * Actions: Skip (with reason menu) / Unskip
 * WS revalidate: pending_changed event → debounced SWR mutate
 *
 * F-013: Pending Message Viewer
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import useSWR from 'swr'
import { api, fetcher } from '../api/client'
import { TESTIDS, TOAST, LABELS, API_PATHS, type ManualSkipReason } from '../contracts'
import { usePending, type PendingTab } from '../hooks/usePending'
import { useToast } from '../components/Toast'
import MessageList from '../components/MessageList'

interface SpaceOption {
  space_key: string
  space_name: string
}

const TABS: { id: PendingTab; label: string; testid: string }[] = [
  { id: 'pending', label: LABELS.PENDING_TAB, testid: TESTIDS.PENDING_TAB_PENDING },
  { id: 'skipped', label: LABELS.SKIPPED_TAB, testid: TESTIDS.PENDING_TAB_SKIPPED },
  { id: 'drafted', label: LABELS.DRAFTED_TAB, testid: TESTIDS.PENDING_TAB_DRAFTED },
]

export default function PendingPage() {
  const { showToast } = useToast()
  const [skipInProgress, setSkipInProgress] = useState<Set<string>>(new Set())

  const {
    rows,
    total,
    hasMore,
    isLoading,
    error,
    filter,
    updateFilter,
    loadMore,
    mutatePending,
    mutateSkipped,
  } = usePending()

  // Spaces for the space filter
  const { data: spacesData } = useSWR<{ spaces: SpaceOption[] }>(API_PATHS.SPACES, fetcher, {
    revalidateOnFocus: false,
  })
  const spaceOptions = spacesData?.spaces ?? []

  // Debounced text filter updates (300ms)
  const senderTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bodyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (senderTimer.current) clearTimeout(senderTimer.current)
      if (bodyTimer.current) clearTimeout(bodyTimer.current)
    }
  }, [])

  function handleSenderChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value
    if (senderTimer.current) clearTimeout(senderTimer.current)
    senderTimer.current = setTimeout(() => updateFilter({ senderContains: value }), 300)
  }

  function handleBodyChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value
    if (bodyTimer.current) clearTimeout(bodyTimer.current)
    bodyTimer.current = setTimeout(() => updateFilter({ bodyContains: value }), 300)
  }

  // Skip action
  const handleSkip = useCallback(async (messageId: string | number, reason: ManualSkipReason) => {
    const idStr = String(messageId)
    setSkipInProgress(prev => new Set(prev).add(idStr))
    try {
      await api(API_PATHS.CLAUDE_SKIP, {
        method: 'POST',
        body: JSON.stringify({ message_id: messageId, reason, by: 'manual' }),
      })
      showToast(TOAST.SKIPPED, 'success')
      void mutatePending()
    } catch {
      showToast(TOAST.SKIP_FAILED, 'error')
    } finally {
      setSkipInProgress(prev => {
        const next = new Set(prev)
        next.delete(idStr)
        return next
      })
    }
  }, [showToast, mutatePending])

  // Unskip action
  const handleUnskip = useCallback(async (messageId: string | number) => {
    const idStr = String(messageId)
    setSkipInProgress(prev => new Set(prev).add(idStr))
    try {
      await api(API_PATHS.CLAUDE_UNSKIP, {
        method: 'POST',
        body: JSON.stringify({ message_id: messageId }),
      })
      showToast(TOAST.UNSKIPPED, 'success')
      void mutateSkipped()
    } catch {
      showToast(TOAST.UNSKIP_FAILED, 'error')
    } finally {
      setSkipInProgress(prev => {
        const next = new Set(prev)
        next.delete(idStr)
        return next
      })
    }
  }, [showToast, mutateSkipped])

  // Retry on error
  const handleRetry = useCallback(() => {
    if (filter.tab === 'pending') void mutatePending()
    else void mutateSkipped()
  }, [filter.tab, mutatePending, mutateSkipped])

  return (
    <div data-testid={TESTIDS.PENDING_PAGE} className="flex flex-col gap-4 p-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-100">Pending 訊息</h1>
        {!isLoading && total > 0 && (
          <span className="text-xs text-gray-500">{total} 筆</span>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-800">
        {TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            data-testid={tab.testid}
            onClick={() => updateFilter({ tab: tab.id })}
            className={[
              'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
              filter.tab === tab.id
                ? 'border-indigo-500 text-indigo-300'
                : 'border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-600',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 items-end">
        {/* Space filter */}
        {spaceOptions.length > 0 && (
          <div className="flex flex-col gap-1">
            <label htmlFor="space-filter" className="text-xs font-medium text-gray-500">Space</label>
            <select
              id="space-filter"
              data-testid={TESTIDS.SPACE_FILTER}
              value={filter.spaceKey}
              onChange={e => updateFilter({ spaceKey: e.target.value })}
              className="text-sm border border-gray-700 rounded-sm px-2 py-1 bg-gray-900 text-gray-200 h-8 min-w-[140px]"
            >
              <option value="">全部 Space</option>
              {spaceOptions.map(s => (
                <option key={s.space_key} value={s.space_key}>
                  {s.space_name || s.space_key}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Sender filter */}
        <div className="flex flex-col gap-1">
          <label htmlFor="sender-filter" className="text-xs font-medium text-gray-500">Sender</label>
          <input
            id="sender-filter"
            type="text"
            data-testid={TESTIDS.SENDER_FILTER}
            placeholder="搜尋寄件者..."
            onChange={handleSenderChange}
            className="text-sm border border-gray-700 rounded-sm px-2 py-1 bg-gray-900 text-gray-200 h-8 min-w-[140px] focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Body filter */}
        <div className="flex flex-col gap-1">
          <label htmlFor="body-filter" className="text-xs font-medium text-gray-500">關鍵字</label>
          <input
            id="body-filter"
            type="text"
            data-testid={TESTIDS.BODY_FILTER}
            placeholder="搜尋訊息內容..."
            onChange={handleBodyChange}
            className="text-sm border border-gray-700 rounded-sm px-2 py-1 bg-gray-900 text-gray-200 h-8 min-w-[140px] focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Mentioned only */}
        <div className="flex items-center gap-1.5 h-8">
          <input
            id="mentioned-filter"
            type="checkbox"
            data-testid={TESTIDS.MENTIONED_FILTER}
            checked={filter.mentionedOnly}
            onChange={e => updateFilter({ mentionedOnly: e.target.checked })}
            className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-indigo-500 focus:ring-indigo-500"
          />
          <label htmlFor="mentioned-filter" className="text-sm text-gray-400 cursor-pointer select-none">
            {LABELS.MENTIONED_FILTER_LABEL}
          </label>
        </div>
      </div>

      {/* Message list */}
      <MessageList
        rows={rows}
        tab={filter.tab}
        isLoading={isLoading}
        error={error}
        hasMore={hasMore}
        onSkip={handleSkip}
        onUnskip={handleUnskip}
        onLoadMore={loadMore}
        onRetry={handleRetry}
        skipInProgress={skipInProgress}
      />
    </div>
  )
}
