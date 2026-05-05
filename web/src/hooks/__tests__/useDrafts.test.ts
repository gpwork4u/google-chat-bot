import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Minimal mocks — must be declared BEFORE any hook import so Vitest hoists them
// ---------------------------------------------------------------------------

// SWR mock: tracks mutate calls, returns controlled data
const mutateMock = vi.fn()
const swrState: { data: { drafts: { id: number; draft_content: string }[] } | undefined } = {
  data: undefined,
}

vi.mock('swr', () => ({
  default: () => ({
    get data() {
      return swrState.data
    },
    error: undefined,
    isLoading: false,
    mutate: mutateMock,
  }),
}))

// WebSocketProvider mock: lets tests inject a lastMessage
let _lastMessage: Record<string, unknown> | null = null

vi.mock('../../ws/WebSocketProvider', () => ({
  useWS: () => ({ lastMessage: _lastMessage, readyState: 1, sendMessage: vi.fn() }),
}))

// api/client mock — not used by useDrafts directly but imported transitively
vi.mock('../../api/client', () => ({ fetcher: vi.fn() }))

// ---------------------------------------------------------------------------
// Import the hook AFTER mocks are in place
// ---------------------------------------------------------------------------
import { useDrafts } from '../useDrafts'
import { renderHook, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDraft(id: number) {
  return { id, draft_content: `content-${id}`, space_id: 's1', space_name: 'Space', sender_id: 'u1', sender_name: 'User', original_message: 'msg', context_messages: [], category: 'daily-chat' as const, created_at: new Date().toISOString() }
}

function renderUseDrafts() {
  return renderHook(() => useDrafts())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useDrafts — WS payload-driven cache updates', () => {
  beforeEach(() => {
    mutateMock.mockReset()
    _lastMessage = null
    swrState.data = { drafts: [makeDraft(1), makeDraft(2)] }
  })

  it('draft_created: pushes new draft to the top of the cache without a refetch', () => {
    const { rerender } = renderUseDrafts()

    const newDraft = makeDraft(99)

    act(() => {
      _lastMessage = { type: 'draft_created', draft: newDraft }
    })

    rerender()

    // mutate should have been called exactly once with an updater function + false (no revalidate)
    expect(mutateMock).toHaveBeenCalledTimes(1)
    const [updater, revalidate] = mutateMock.mock.calls[0]
    expect(revalidate).toBe(false)

    // Apply the updater to simulate what SWR does internally
    const prev = swrState.data
    const next = updater(prev)
    expect(next.drafts[0].id).toBe(99)
    expect(next.drafts).toHaveLength(3)
  })

  it('draft_removed: removes draft by draft_id (String comparison)', () => {
    const { rerender } = renderUseDrafts()

    act(() => {
      // wire format uses draft_id (not id)
      _lastMessage = { type: 'draft_removed', draft_id: 2 }
    })

    rerender()

    expect(mutateMock).toHaveBeenCalledTimes(1)
    const [updater, revalidate] = mutateMock.mock.calls[0]
    expect(revalidate).toBe(false)

    const prev = swrState.data
    const next = updater(prev)
    expect(next.drafts).toHaveLength(1)
    expect(next.drafts[0].id).toBe(1)
  })

  it('draft_removed: handles string draft_id matching numeric draft id', () => {
    const { rerender } = renderUseDrafts()

    act(() => {
      // draft_id sent as string "2" should still match numeric id 2
      _lastMessage = { type: 'draft_removed', draft_id: '2' }
    })

    rerender()

    const [updater] = mutateMock.mock.calls[0]
    const next = updater(swrState.data)
    expect(next.drafts).toHaveLength(1)
    expect(next.drafts[0].id).toBe(1)
  })

  it('inbox_changed: calls mutate for full refetch (legacy fallback)', () => {
    const { rerender } = renderUseDrafts()

    act(() => {
      _lastMessage = { type: 'inbox_changed' }
    })

    rerender()

    expect(mutateMock).toHaveBeenCalledTimes(1)
    // called without updater (void mutate()) — first arg is undefined or no args
    const call = mutateMock.mock.calls[0]
    expect(call.length).toBe(0)
  })

  it('unknown event type: does not call mutate', () => {
    const { rerender } = renderUseDrafts()

    act(() => {
      _lastMessage = { type: 'unknown_event' }
    })

    rerender()

    expect(mutateMock).not.toHaveBeenCalled()
  })
})
