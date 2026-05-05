import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — must be declared before hook import
// ---------------------------------------------------------------------------

const mutateMock = vi.fn()

vi.mock('swr', () => ({
  default: () => ({
    data: { auto_mode: false },
    error: undefined,
    isLoading: false,
    mutate: mutateMock,
  }),
}))

let _lastMessage: Record<string, unknown> | null = null

vi.mock('../../ws/WebSocketProvider', () => ({
  useWS: () => ({ lastMessage: _lastMessage, readyState: 1, sendMessage: vi.fn() }),
}))

vi.mock('../../api/client', () => ({ fetcher: vi.fn() }))

// ---------------------------------------------------------------------------
// Import hook after mocks
// ---------------------------------------------------------------------------
import { useSettings } from '../useSettings'
import { renderHook, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useSettings — WS payload-driven cache updates', () => {
  beforeEach(() => {
    mutateMock.mockReset()
    _lastMessage = null
  })

  it('settings_updated: applies new settings directly without refetch', () => {
    const { rerender } = renderHook(() => useSettings())

    const newSettings = { auto_mode: true, freshness_window_minutes: 30 }

    act(() => {
      _lastMessage = { type: 'settings_updated', settings: newSettings }
    })

    rerender()

    // mutate called once with (newSettings, false) — no revalidation
    expect(mutateMock).toHaveBeenCalledTimes(1)
    const [payload, revalidate] = mutateMock.mock.calls[0]
    expect(revalidate).toBe(false)
    expect(payload).toEqual(newSettings)
  })

  it('settings_changed: triggers full refetch (legacy fallback)', () => {
    const { rerender } = renderHook(() => useSettings())

    act(() => {
      _lastMessage = { type: 'settings_changed' }
    })

    rerender()

    // void mutate() — called with no arguments (or awaited promise)
    expect(mutateMock).toHaveBeenCalledTimes(1)
  })

  it('settings_updated without settings payload: does not apply update', () => {
    const { rerender } = renderHook(() => useSettings())

    act(() => {
      // Missing settings field — should not call mutate with undefined data
      _lastMessage = { type: 'settings_updated' }
    })

    rerender()

    // Should not have been called (the condition is `m.settings` check)
    // The hook checks `m.type === 'settings_updated' && m.settings`
    // so without settings, it falls through — no mutate call
    expect(mutateMock).not.toHaveBeenCalled()
  })

  it('unknown event type: does not call mutate', () => {
    const { rerender } = renderHook(() => useSettings())

    act(() => {
      _lastMessage = { type: 'something_else' }
    })

    rerender()

    expect(mutateMock).not.toHaveBeenCalled()
  })
})
