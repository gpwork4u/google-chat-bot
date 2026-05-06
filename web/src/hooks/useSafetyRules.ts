import useSWR from 'swr'
import { fetcher } from '../api/client'
import { API_PATHS } from '../contracts'

// SafetyRules shape returned by GET /api/safety/rules
// and accepted by PATCH /api/safety/rules.
export interface SafetyRules {
  enabled: boolean
  rules: {
    money: boolean
  }
}

export function useSafetyRules() {
  const { data, error, isLoading, mutate } = useSWR<SafetyRules>(
    API_PATHS.SAFETY_RULES,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 5000,
      // Provide a sensible default while loading to avoid flicker
      fallbackData: { enabled: true, rules: { money: true } },
    },
  )

  return {
    safetyRules: data,
    error,
    isLoading,
    mutate,
  }
}
