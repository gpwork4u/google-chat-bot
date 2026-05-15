/**
 * Unit tests — useSpaceFactsCandidates (F-015, Sprint 7)
 *
 * Covers:
 *  - grouping facts by space_key
 *  - approveFact triggers optimistic update + api call
 *  - rejectFact triggers optimistic update + api call
 *  - batchApproveFacts calls Promise.allSettled across all ids
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ── SWR mock ─────────────────────────────────────────────────────────────────

const mutateMock = vi.fn()

let swrData: { facts: { id: number; space_key: string; category: string; content: string; visibility: string; status: string; source_message_ids: number[]; note: string; created_by: string; created_at: string; updated_at: string; approved_at: null }[] } | undefined

vi.mock('swr', () => ({
  default: () => ({
    get data() {
      return swrData
    },
    error: undefined,
    isLoading: false,
    mutate: mutateMock,
  }),
}))

// ── api/client mock ───────────────────────────────────────────────────────────

const apiMock = vi.fn().mockResolvedValue({})

vi.mock('../../api/client', () => ({
  fetcher: vi.fn(),
  api: (...args: unknown[]) => apiMock(...args),
}))

// ── Import after mocks ────────────────────────────────────────────────────────

import { useSpaceFactsCandidates } from '../useSpaceFactsCandidates'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeFact(id: number, spaceKey: string) {
  return {
    id,
    space_key: spaceKey,
    category: 'product' as const,
    content: `fact ${id}`,
    visibility: 'private' as const,
    status: 'candidate' as const,
    source_message_ids: [],
    note: '',
    created_by: 'mining-skill',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    approved_at: null,
  }
}

describe('useSpaceFactsCandidates — grouped', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    swrData = {
      facts: [
        makeFact(1, 'spaces/AAA'),
        makeFact(2, 'spaces/AAA'),
        makeFact(3, 'spaces/BBB'),
      ],
    }
    mutateMock.mockImplementation(async (fn: (() => Promise<unknown>) | undefined, opts: unknown) => {
      if (typeof fn === 'function') await fn()
      return undefined
    })
  })

  it('groups facts by space_key', () => {
    const { result } = renderHook(() => useSpaceFactsCandidates())
    expect(result.current.grouped['spaces/AAA']).toHaveLength(2)
    expect(result.current.grouped['spaces/BBB']).toHaveLength(1)
  })

  it('facts returns all facts flat', () => {
    const { result } = renderHook(() => useSpaceFactsCandidates())
    expect(result.current.facts).toHaveLength(3)
  })
})

describe('useSpaceFactsCandidates — approveFact', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    swrData = { facts: [makeFact(10, 'spaces/AAA')] }
    mutateMock.mockImplementation(async (fn: (() => Promise<unknown>) | undefined) => {
      if (typeof fn === 'function') await fn()
    })
  })

  it('calls api POST /approve with correct path', async () => {
    const { result } = renderHook(() => useSpaceFactsCandidates())

    await act(async () => {
      await result.current.approveFact(10)
    })

    expect(apiMock).toHaveBeenCalledWith('/api/space-facts/10/approve', { method: 'POST' })
  })

  it('calls mutate with optimistic data excluding the approved fact', async () => {
    const { result } = renderHook(() => useSpaceFactsCandidates())

    await act(async () => {
      await result.current.approveFact(10)
    })

    const callArgs = mutateMock.mock.calls[0]
    const opts = callArgs[1] as { optimisticData?: { facts: unknown[] } }
    expect(opts.optimisticData?.facts).toHaveLength(0)
  })
})

describe('useSpaceFactsCandidates — batchApproveFacts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    swrData = {
      facts: [
        makeFact(1, 'spaces/AAA'),
        makeFact(2, 'spaces/AAA'),
        makeFact(3, 'spaces/AAA'),
      ],
    }
    mutateMock.mockImplementation(async (fn: (() => Promise<unknown>) | undefined) => {
      if (typeof fn === 'function') await fn()
    })
    apiMock.mockResolvedValue({})
  })

  it('calls approve for all facts in the space', async () => {
    const { result } = renderHook(() => useSpaceFactsCandidates())

    await act(async () => {
      await result.current.batchApproveFacts('spaces/AAA')
    })

    // Should have called approve for ids 1, 2, 3
    const approveCallPaths = apiMock.mock.calls.map((c: unknown[]) => c[0] as string)
    expect(approveCallPaths).toContain('/api/space-facts/1/approve')
    expect(approveCallPaths).toContain('/api/space-facts/2/approve')
    expect(approveCallPaths).toContain('/api/space-facts/3/approve')
  })

  it('returns 0 when space has no facts', async () => {
    const { result } = renderHook(() => useSpaceFactsCandidates())

    let count = -1
    await act(async () => {
      count = await result.current.batchApproveFacts('spaces/EMPTY')
    })

    expect(count).toBe(0)
    expect(apiMock).not.toHaveBeenCalled()
  })
})

describe('useSpaceFactsCandidates — rejectFact', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    swrData = { facts: [makeFact(11, 'spaces/AAA')] }
    mutateMock.mockImplementation(async (fn: (() => Promise<unknown>) | undefined) => {
      if (typeof fn === 'function') await fn()
    })
  })

  it('calls api POST /reject with correct path', async () => {
    const { result } = renderHook(() => useSpaceFactsCandidates())

    await act(async () => {
      await result.current.rejectFact(11)
    })

    expect(apiMock).toHaveBeenCalledWith('/api/space-facts/11/reject', { method: 'POST' })
  })
})
