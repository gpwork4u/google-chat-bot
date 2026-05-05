import useSWR from 'swr'
import { useEffect } from 'react'
import { fetcher } from '../api/client'
import { useWS } from '../ws/WebSocketProvider'
import type { Draft, DraftsResponse } from '../types/draft'

const DRAFTS_URL = '/api/drafts?status=pending'

export function useDrafts() {
  const { data, error, isLoading, mutate } = useSWR<DraftsResponse>(
    DRAFTS_URL,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 2000,
    },
  )

  const { lastMessage } = useWS()

  useEffect(() => {
    const m = lastMessage
    if (!m) return

    if (m.type === 'inbox_changed') {
      // Fallback: full refetch (legacy path + backend without payload support)
      void mutate()
    } else if (m.type === 'draft_created' && m.draft) {
      // Optimistic: push the new draft into the SWR cache without a refetch.
      mutate(
        prev => ({ drafts: [m.draft as Draft, ...(prev?.drafts ?? [])] }),
        false,
      )
    } else if (m.type === 'draft_removed' && m.draft_id !== undefined) {
      // Optimistic: filter out the removed draft from the SWR cache.
      mutate(
        prev => ({
          drafts: (prev?.drafts ?? []).filter(
            d => String(d.id) !== String(m.draft_id),
          ),
        }),
        false,
      )
    }
  }, [lastMessage, mutate])

  const drafts: Draft[] = data?.drafts ?? []

  return {
    drafts,
    isLoading,
    error,
    mutate,
  }
}
