/**
 * usePending — SWR hook for /api/claude/pending and /api/claude/skipped
 * with filter state, WS revalidate (debounced 200ms), and offset pagination.
 *
 * F-013 Pending viewer frontend.
 */
import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import useSWR from 'swr'
import { fetcher } from '../api/client'
import { useWS } from '../ws/WebSocketProvider'
import { API_PATHS } from '../contracts'

export type PendingTab = 'pending' | 'skipped' | 'drafted'

export interface PendingFilter {
  tab: PendingTab
  spaceKey: string
  senderContains: string
  bodyContains: string
  mentionedOnly: boolean
  offset: number
}

// Shape of one message row from the backend
export interface PendingMessage {
  message_id: number | string
  space_key: string
  space_name: string
  sender_name: string
  body: string
  observed_at: string
  mentioned: boolean
  // Skipped-tab extras
  skip_reason?: string
  skipped_by?: string
  skipped_at?: string
}

export interface PendingResponse {
  pending: PendingMessage[]
  total: number
  next_offset?: number
  auto_mode?: boolean
  reply_only_when_mentioned?: boolean
  blocked_keywords?: string
  local_user_name?: string
  local_user_email?: string
}

export interface SkippedResponse {
  skipped: PendingMessage[]
  total: number
  next_offset?: number
}

export interface DraftedResponse {
  drafts: PendingMessage[]
  total: number
  next_offset?: number
}

const DEFAULT_LIMIT = 50

function buildPendingUrl(filter: PendingFilter): string {
  const params = new URLSearchParams()
  params.set('limit', String(DEFAULT_LIMIT))
  params.set('offset', String(filter.offset))
  if (filter.spaceKey) params.set('space_key', filter.spaceKey)
  if (filter.senderContains) params.set('sender_contains', filter.senderContains)
  if (filter.bodyContains) params.set('body_contains', filter.bodyContains)
  if (filter.mentionedOnly) params.set('mentioned_only', 'true')
  return `${API_PATHS.CLAUDE_PENDING}?${params.toString()}`
}

function buildSkippedUrl(filter: PendingFilter): string {
  const params = new URLSearchParams()
  params.set('limit', String(DEFAULT_LIMIT))
  params.set('offset', String(filter.offset))
  if (filter.spaceKey) params.set('space_key', filter.spaceKey)
  if (filter.senderContains) params.set('sender_contains', filter.senderContains)
  if (filter.bodyContains) params.set('body_contains', filter.bodyContains)
  if (filter.mentionedOnly) params.set('mentioned_only', 'true')
  return `${API_PATHS.CLAUDE_SKIPPED}?${params.toString()}`
}

function buildDraftedUrl(filter: PendingFilter): string {
  const params = new URLSearchParams()
  params.set('status', 'pending')
  params.set('limit', String(DEFAULT_LIMIT))
  params.set('offset', String(filter.offset))
  if (filter.spaceKey) params.set('space_key', filter.spaceKey)
  if (filter.senderContains) params.set('sender_contains', filter.senderContains)
  if (filter.bodyContains) params.set('body_contains', filter.bodyContains)
  if (filter.mentionedOnly) params.set('mentioned_only', 'true')
  return `${API_PATHS.DRAFTS}?${params.toString()}`
}

function debounce<T extends (...args: Parameters<T>) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout> | null = null
  const debounced = (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
  return debounced as T
}

export function usePending() {
  const [filter, setFilter] = useState<PendingFilter>({
    tab: 'pending',
    spaceKey: '',
    senderContains: '',
    bodyContains: '',
    mentionedOnly: false,
    offset: 0,
  })

  // Accumulated rows across load-more pages
  const [accRows, setAccRows] = useState<PendingMessage[]>([])

  const pendingKey = filter.tab === 'pending' ? buildPendingUrl(filter) : null
  const skippedKey = filter.tab === 'skipped' ? buildSkippedUrl(filter) : null
  const draftedKey = filter.tab === 'drafted' ? buildDraftedUrl(filter) : null

  const {
    data: pendingData,
    error: pendingError,
    isLoading: pendingLoading,
    mutate: mutatePending,
  } = useSWR<PendingResponse>(pendingKey, fetcher, { revalidateOnFocus: false })

  const {
    data: skippedData,
    error: skippedError,
    isLoading: skippedLoading,
    mutate: mutateSkipped,
  } = useSWR<SkippedResponse>(skippedKey, fetcher, { revalidateOnFocus: false })

  const {
    data: draftedData,
    error: draftedError,
    isLoading: draftedLoading,
    mutate: mutateDrafted,
  } = useSWR<DraftedResponse>(draftedKey, fetcher, { revalidateOnFocus: false })

  // Current page rows (before append)
  const currentRows =
    filter.tab === 'pending'
      ? (pendingData?.pending ?? [])
      : filter.tab === 'skipped'
        ? (skippedData?.skipped ?? [])
        : (draftedData?.drafts ?? [])

  const total =
    filter.tab === 'pending'
      ? (pendingData?.total ?? 0)
      : filter.tab === 'skipped'
        ? (skippedData?.total ?? 0)
        : (draftedData?.total ?? 0)

  const nextOffset =
    filter.tab === 'pending'
      ? pendingData?.next_offset
      : filter.tab === 'skipped'
        ? skippedData?.next_offset
        : draftedData?.next_offset

  const isLoading = filter.tab === 'pending' ? pendingLoading : filter.tab === 'skipped' ? skippedLoading : draftedLoading
  const error = filter.tab === 'pending' ? pendingError : filter.tab === 'skipped' ? skippedError : draftedError

  // When filter changes (excluding offset), reset accumulated rows
  const filterWithoutOffset = useMemo(
    () => ({ ...filter, offset: 0 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filter.tab, filter.spaceKey, filter.senderContains, filter.bodyContains, filter.mentionedOnly],
  )
  const prevFilterRef = useRef(filterWithoutOffset)
  useEffect(() => {
    if (prevFilterRef.current !== filterWithoutOffset) {
      prevFilterRef.current = filterWithoutOffset
      setAccRows([])
    }
  }, [filterWithoutOffset])

  // Append new page rows to accRows
  useEffect(() => {
    if (currentRows.length === 0) return
    if (filter.offset === 0) {
      setAccRows(currentRows)
    } else {
      setAccRows(prev => {
        // Deduplicate by message_id
        const existingIds = new Set(prev.map(r => String(r.message_id)))
        const newRows = currentRows.filter(r => !existingIds.has(String(r.message_id)))
        return [...prev, ...newRows]
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRows])

  // WS revalidate — debounced 200ms
  const { lastMessage } = useWS()

  const mutateActive = useCallback(() => {
    if (filter.tab === 'pending') void mutatePending()
    else if (filter.tab === 'skipped') void mutateSkipped()
    else void mutateDrafted()
  }, [filter.tab, mutatePending, mutateSkipped, mutateDrafted])

  const debouncedMutate = useMemo(() => debounce(mutateActive, 200), [mutateActive])

  useEffect(() => {
    if (!lastMessage) return
    if (lastMessage.type === 'pending_changed') {
      debouncedMutate()
    }
  }, [lastMessage, debouncedMutate])

  const updateFilter = useCallback((patch: Partial<Omit<PendingFilter, 'offset'>>) => {
    setFilter(prev => ({ ...prev, ...patch, offset: 0 }))
    setAccRows([])
  }, [])

  const loadMore = useCallback(() => {
    if (nextOffset !== undefined && nextOffset !== null) {
      setFilter(prev => ({ ...prev, offset: nextOffset }))
    }
  }, [nextOffset])

  const hasMore = nextOffset !== undefined && nextOffset !== null && nextOffset > 0

  return {
    rows: accRows.length > 0 ? accRows : currentRows,
    total,
    hasMore,
    isLoading,
    error,
    filter,
    updateFilter,
    loadMore,
    mutatePending,
    mutateSkipped,
    mutateDrafted,
  }
}
