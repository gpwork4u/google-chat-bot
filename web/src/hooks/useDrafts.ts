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

  // inbox_changed から SWR を revalidate する
  useEffect(() => {
    if (lastMessage?.type === 'inbox_changed') {
      void mutate()
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
