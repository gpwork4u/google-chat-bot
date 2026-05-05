import { useRef, useCallback, useEffect } from 'react'
import { useSent } from '../hooks/useSent'
import SentRecordCard from '../components/SentRecordCard'
import { Search } from 'lucide-react'

export default function SentPage() {
  const {
    items,
    filter,
    updateFilter,
    isLoading,
    isValidating,
    error,
    hasMore,
    isEmpty,
    loadMore,
  } = useSent()

  // Debounced search: use a ref to track the pending timer.
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      updateFilter({ q: value })
    }, 300)
  }

  function handleSearchBlur(e: React.FocusEvent<HTMLInputElement>) {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    updateFilter({ q: e.target.value })
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      if (searchTimer.current) clearTimeout(searchTimer.current)
      updateFilter({ q: (e.target as HTMLInputElement).value })
    }
  }

  // Intersection Observer for infinite scroll.
  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadMoreCb = useCallback(() => {
    if (hasMore && !isValidating) loadMore()
  }, [hasMore, isValidating, loadMore])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) loadMoreCb()
      },
      { threshold: 0.5 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [loadMoreCb])

  return (
    <div className="flex flex-col gap-4 p-4 max-w-3xl mx-auto">
      <h1 className="text-lg font-semibold text-[--color-text-default]">已送出記錄</h1>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 items-end">
        {/* Mode filter */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="mode-filter"
            className="text-xs font-medium text-[--color-text-muted]"
          >
            模式
          </label>
          <select
            id="mode-filter"
            data-testid="mode-filter"
            value={filter.mode}
            onChange={e => updateFilter({ mode: e.target.value as '' | 'approved' | 'auto' })}
            className="text-sm border border-[--color-border-default] rounded-sm px-2 py-1 bg-[--color-surface-default] text-[--color-text-default] h-8"
          >
            <option value="">全部</option>
            <option value="approved">已審核</option>
            <option value="auto">自動送出</option>
          </select>
        </div>

        {/* Date from */}
        <div className="flex flex-col gap-1">
          <label htmlFor="from-date" className="text-xs font-medium text-[--color-text-muted]">
            從
          </label>
          <input
            id="from-date"
            type="date"
            value={filter.from}
            onChange={e => updateFilter({ from: e.target.value })}
            className="text-sm border border-[--color-border-default] rounded-sm px-2 py-1 bg-[--color-surface-default] text-[--color-text-default] h-8"
          />
        </div>

        {/* Date to */}
        <div className="flex flex-col gap-1">
          <label htmlFor="to-date" className="text-xs font-medium text-[--color-text-muted]">
            到
          </label>
          <input
            id="to-date"
            type="date"
            value={filter.to}
            onChange={e => updateFilter({ to: e.target.value })}
            className="text-sm border border-[--color-border-default] rounded-sm px-2 py-1 bg-[--color-surface-default] text-[--color-text-default] h-8"
          />
        </div>

        {/* Search input */}
        <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
          <label htmlFor="search-input" className="text-xs font-medium text-[--color-text-muted]">
            搜尋
          </label>
          <div className="relative">
            <Search
              size={13}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-[--color-text-muted]"
              aria-hidden="true"
            />
            <input
              id="search-input"
              data-testid="search-input"
              type="text"
              defaultValue={filter.q}
              onChange={handleSearchChange}
              onBlur={handleSearchBlur}
              onKeyDown={handleSearchKeyDown}
              placeholder="搜尋送出內容..."
              className="w-full pl-7 pr-3 text-sm border border-[--color-border-default] rounded-sm py-1 bg-[--color-surface-default] text-[--color-text-default] h-8 focus:outline-none focus:border-[--color-border-focus]"
            />
          </div>
        </div>
      </div>

      {/* List */}
      <div data-testid="sent-list" className="flex flex-col gap-3">
        {isLoading && items.length === 0 && (
          <div className="flex items-center justify-center py-12 text-[--color-text-muted] text-sm">
            載入中...
          </div>
        )}

        {error && (
          <div className="text-center py-12 text-red-500 text-sm">
            載入失敗，請重新整理頁面
          </div>
        )}

        {isEmpty && !error && (
          <div
            className="flex flex-col items-center justify-center py-20 text-center text-[--color-text-muted]"
            data-testid="empty-state"
          >
            <p className="text-base font-medium">近 7 天沒有送出記錄</p>
            <p className="mt-1 text-sm">當 AI 代你送出訊息後，記錄會出現在這裡</p>
          </div>
        )}

        {items.map(record => (
          <SentRecordCard key={record.id} record={record} />
        ))}

        {/* Infinite scroll sentinel */}
        {hasMore && (
          <div ref={sentinelRef} className="flex justify-center py-4">
            <button
              onClick={loadMore}
              disabled={isValidating}
              className="text-sm text-[--color-text-muted] hover:text-[--color-text-default] disabled:opacity-50"
            >
              {isValidating ? '載入中...' : '載入更多'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
