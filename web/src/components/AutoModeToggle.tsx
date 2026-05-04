import { useCallback } from 'react'
import useSWR from 'swr'
import { api, fetcher } from '../api/client'

interface Settings {
  auto_mode: boolean
}

export default function AutoModeToggle() {
  const { data, mutate } = useSWR<Settings>('/api/settings', fetcher)
  const autoMode = data?.auto_mode ?? false

  const toggle = useCallback(async () => {
    const next = !autoMode
    // Optimistic update
    await mutate(
      async () => {
        await api('/api/settings/auto-mode', {
          method: 'POST',
          body: JSON.stringify({ auto_mode: next }),
        })
        return { auto_mode: next }
      },
      { optimisticData: { auto_mode: next }, rollbackOnError: true },
    )
  }, [autoMode, mutate])

  return (
    <button
      type="button"
      role="switch"
      aria-checked={autoMode}
      aria-label="自動模式"
      onClick={toggle}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
        autoMode ? 'bg-indigo-600' : 'bg-gray-600'
      }`}
      data-testid="auto-mode-toggle"
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
          autoMode ? 'translate-x-4.5' : 'translate-x-0.5'
        }`}
      />
      <span className="sr-only">{autoMode ? '自動模式：開' : '自動模式：關'}</span>
    </button>
  )
}
