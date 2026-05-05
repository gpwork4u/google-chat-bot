import { useState, useCallback } from 'react'
import useSWRInfinite from 'swr/infinite'
import { fetcher } from '../api/client'
import type { SentFilter, SentResponse } from '../types/sent'

const DEFAULT_LIMIT = 50

function buildSentUrl(filter: SentFilter, cursor: string): string {
  const params = new URLSearchParams()
  params.set('limit', String(DEFAULT_LIMIT))
  if (filter.mode) params.set('mode', filter.mode)
  if (filter.q) params.set('q', filter.q)
  if (filter.from) {
    // Convert YYYY-MM-DD to RFC3339 (start of day UTC)
    params.set('from', `${filter.from}T00:00:00Z`)
  }
  if (filter.to) {
    // Convert YYYY-MM-DD to RFC3339 (end of day UTC)
    params.set('to', `${filter.to}T23:59:59Z`)
  }
  for (const sid of filter.spaceIds) {
    params.append('space_ids', sid)
  }
  if (cursor) params.set('cursor', cursor)
  return `/api/sent?${params.toString()}`
}

function defaultFrom(): string {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  return d.toISOString().slice(0, 10)
}

function defaultTo(): string {
  return new Date().toISOString().slice(0, 10)
}

export function useSent() {
  const [filter, setFilter] = useState<SentFilter>({
    mode: '',
    spaceIds: [],
    from: defaultFrom(),
    to: defaultTo(),
    q: '',
  })

  const getKey = useCallback(
    (pageIndex: number, previousPageData: SentResponse | null) => {
      if (previousPageData && !previousPageData.next_cursor) return null
      const cursor = pageIndex === 0 ? '' : (previousPageData?.next_cursor ?? '')
      return buildSentUrl(filter, cursor)
    },
    [filter],
  )

  const { data, error, isLoading, isValidating, size, setSize } = useSWRInfinite<SentResponse>(
    getKey,
    fetcher,
    { revalidateOnFocus: false },
  )

  const items = data?.flatMap(page => page.items) ?? []
  const hasMore = Boolean(data?.[data.length - 1]?.next_cursor)
  const isEmpty = !isLoading && items.length === 0

  function loadMore() {
    void setSize(size + 1)
  }

  function updateFilter(patch: Partial<SentFilter>) {
    setFilter(prev => ({ ...prev, ...patch }))
  }

  return {
    items,
    filter,
    updateFilter,
    isLoading,
    isValidating,
    error,
    hasMore,
    isEmpty,
    loadMore,
  }
}
