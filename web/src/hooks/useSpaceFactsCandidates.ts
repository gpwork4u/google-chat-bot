// useSpaceFactsCandidates — SWR hook for /api/space-facts/candidates
// Sprint 7 (F-015)

import useSWR from 'swr'
import { fetcher, api } from '../api/client'
import { API_PATHS } from '../contracts'
import type { SpaceFact, SpaceFactsResponse } from '../types/spaceFacts'

const CANDIDATES_KEY = API_PATHS.SPACE_FACTS_CANDIDATES

export function useSpaceFactsCandidates() {
  const { data, error, isLoading, mutate } = useSWR<SpaceFactsResponse>(
    CANDIDATES_KEY,
    fetcher,
    { revalidateOnFocus: false },
  )

  const facts = data?.facts ?? []

  // Group by space_key
  const grouped = facts.reduce<Record<string, SpaceFact[]>>((acc, fact) => {
    if (!acc[fact.space_key]) acc[fact.space_key] = []
    acc[fact.space_key].push(fact)
    return acc
  }, {})

  // Approve single fact with optimistic update
  const approveFact = async (id: number) => {
    const optimisticData: SpaceFactsResponse = {
      facts: facts.filter(f => f.id !== id),
    }
    return mutate(
      async () => {
        await api(API_PATHS.SPACE_FACT_APPROVE(id), { method: 'POST' })
        // Revalidate to get server truth
        return undefined
      },
      {
        optimisticData,
        rollbackOnError: true,
        revalidate: true,
      },
    )
  }

  // Reject single fact with optimistic update
  const rejectFact = async (id: number) => {
    const optimisticData: SpaceFactsResponse = {
      facts: facts.filter(f => f.id !== id),
    }
    return mutate(
      async () => {
        await api(API_PATHS.SPACE_FACT_REJECT(id), { method: 'POST' })
        return undefined
      },
      {
        optimisticData,
        rollbackOnError: true,
        revalidate: true,
      },
    )
  }

  // Patch a fact (edit content/visibility/category)
  const patchFact = async (
    id: number,
    patch: Partial<Pick<SpaceFact, 'content' | 'visibility' | 'category'>>,
  ) => {
    const updated = await api<SpaceFact>(API_PATHS.SPACE_FACT_PATCH(id), {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
    await mutate(prev => {
      if (!prev) return prev
      return {
        facts: prev.facts.map(f => (f.id === id ? updated : f)),
      }
    }, false)
    return updated
  }

  // Batch approve all facts in a space
  const batchApproveFacts = async (spaceKey: string): Promise<number> => {
    const spaceFactIds = facts.filter(f => f.space_key === spaceKey).map(f => f.id)
    if (spaceFactIds.length === 0) return 0

    const optimisticData: SpaceFactsResponse = {
      facts: facts.filter(f => f.space_key !== spaceKey),
    }

    let successCount = 0

    await mutate(
      async () => {
        const results = await Promise.allSettled(
          spaceFactIds.map(id => api(API_PATHS.SPACE_FACT_APPROVE(id), { method: 'POST' })),
        )
        successCount = results.filter(r => r.status === 'fulfilled').length
        return undefined
      },
      {
        optimisticData,
        rollbackOnError: false, // partial success — keep approved ones gone
        revalidate: true,
      },
    )

    return successCount
  }

  // Batch reject all facts in a space
  const batchRejectFacts = async (spaceKey: string): Promise<number> => {
    const spaceFactIds = facts.filter(f => f.space_key === spaceKey).map(f => f.id)
    if (spaceFactIds.length === 0) return 0

    const optimisticData: SpaceFactsResponse = {
      facts: facts.filter(f => f.space_key !== spaceKey),
    }

    let successCount = 0

    await mutate(
      async () => {
        const results = await Promise.allSettled(
          spaceFactIds.map(id => api(API_PATHS.SPACE_FACT_REJECT(id), { method: 'POST' })),
        )
        successCount = results.filter(r => r.status === 'fulfilled').length
        return undefined
      },
      {
        optimisticData,
        rollbackOnError: false,
        revalidate: true,
      },
    )

    return successCount
  }

  return {
    facts,
    grouped,
    error,
    isLoading,
    mutate,
    approveFact,
    rejectFact,
    patchFact,
    batchApproveFacts,
    batchRejectFacts,
  }
}
