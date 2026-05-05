import useSWR from 'swr'
import { useEffect } from 'react'
import { fetcher } from '../api/client'
import { useWS } from '../ws/WebSocketProvider'

// Settings shape returned by GET /api/settings.
// F-004 extends this with freshness_window_minutes and debug_mode.
export interface Settings {
  auto_mode: boolean
  freshness_window_minutes: number
  debug_mode: boolean
  blocked_keywords?: string
  reply_only_when_mentioned?: boolean
}

const SETTINGS_URL = '/api/settings'

export function useSettings() {
  const { data, error, isLoading, mutate } = useSWR<Settings>(
    SETTINGS_URL,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 5000,
    },
  )

  const { lastMessage } = useWS()

  useEffect(() => {
    const m = lastMessage
    if (!m) return

    if (m.type === 'settings_updated' && m.settings) {
      // Payload-driven: apply new settings directly without a refetch.
      // No toast here — avoid noise for remote updates.
      mutate(m.settings as Settings, false)
    } else if (m.type === 'settings_changed') {
      // Fallback: full refetch (backend without payload support).
      void mutate()
    }
  }, [lastMessage, mutate])

  return {
    settings: data,
    error,
    isLoading,
    mutate,
  }
}
