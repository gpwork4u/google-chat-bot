// SpaceFactsCandidatesPage — /space-facts/candidates
// Lists all candidate facts grouped by space, with approve/edit/reject/batch actions.
// Sprint 7 (F-015)

import { useState, useCallback } from 'react'
import useSWR from 'swr'
import { fetcher } from '../api/client'
import { TESTIDS, TOAST, LABELS } from '../contracts'
import { useToast } from '../components/Toast'
import { useSpaceFactsCandidates } from '../hooks/useSpaceFactsCandidates'
import CandidateFactRow from '../components/CandidateFactRow'
import ConfirmDialog from '../components/ConfirmDialog'
import type { SpaceFact } from '../types/spaceFacts'

interface SpaceSetting {
  space_key: string
  space_name: string
}

interface SpacesResponse {
  spaces: SpaceSetting[]
}

export default function SpaceFactsCandidatesPage() {
  const { showToast } = useToast()
  const {
    facts,
    grouped,
    error,
    isLoading,
    approveFact,
    rejectFact,
    patchFact,
    batchApproveFacts,
    batchRejectFacts,
  } = useSpaceFactsCandidates()

  const { data: spacesData } = useSWR<SpacesResponse>('/api/spaces', fetcher)
  const spacesMap = new Map(
    (spacesData?.spaces ?? []).map(s => [s.space_key, s.space_name]),
  )

  // Batch reject confirmation
  const [batchRejectTarget, setBatchRejectTarget] = useState<string | null>(null)

  const getDisplayName = useCallback(
    (spaceKey: string) => spacesMap.get(spaceKey) ?? spaceKey,
    [spacesMap],
  )

  const handleApprove = useCallback(
    async (id: number) => {
      await approveFact(id)
      showToast(TOAST.FACT_APPROVED, 'success')
    },
    [approveFact, showToast],
  )

  const handleReject = useCallback(
    async (id: number) => {
      await rejectFact(id)
      showToast(TOAST.FACT_REJECTED, 'success')
    },
    [rejectFact, showToast],
  )

  const handlePatch = useCallback(
    async (id: number, patch: Partial<Pick<SpaceFact, 'content' | 'visibility' | 'category'>>) => {
      return patchFact(id, patch)
    },
    [patchFact],
  )

  const handleBatchApprove = useCallback(
    async (spaceKey: string) => {
      const n = await batchApproveFacts(spaceKey)
      showToast(TOAST.BATCH_APPROVE_DONE(n), 'success')
    },
    [batchApproveFacts, showToast],
  )

  const handleBatchRejectConfirm = useCallback(async () => {
    if (!batchRejectTarget) return
    const spaceKey = batchRejectTarget
    setBatchRejectTarget(null)
    const n = await batchRejectFacts(spaceKey)
    showToast(TOAST.BATCH_REJECT_DONE(n), 'success')
  }, [batchRejectTarget, batchRejectFacts, showToast])

  if (isLoading) {
    return (
      <main data-testid={TESTIDS.SPACE_FACTS_CANDIDATES_PAGE} className="space-y-6">
        <h1 className="text-xl font-semibold text-gray-100">待審核 Candidates</h1>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 rounded-md bg-gray-900 border border-gray-700 animate-pulse" />
          ))}
        </div>
      </main>
    )
  }

  if (error) {
    return (
      <main data-testid={TESTIDS.SPACE_FACTS_CANDIDATES_PAGE} className="space-y-6">
        <h1 className="text-xl font-semibold text-gray-100">待審核 Candidates</h1>
        <div className="rounded-md border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-300">
          載入失敗，請重新整理頁面
        </div>
      </main>
    )
  }

  const spaceKeys = Object.keys(grouped)

  return (
    <main data-testid={TESTIDS.SPACE_FACTS_CANDIDATES_PAGE} className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-100">
          {LABELS.PENDING_CANDIDATES}
        </h1>
        <span className="text-sm text-gray-400">共 {facts.length} 筆</span>
      </div>

      {spaceKeys.length === 0 ? (
        <div className="rounded-md border border-gray-700 bg-gray-900 px-4 py-12 text-center">
          <p className="text-sm text-gray-500">目前沒有待審核的 candidates</p>
        </div>
      ) : (
        <div className="space-y-8">
          {spaceKeys.map(spaceKey => {
            const spaceFacts = grouped[spaceKey]
            const displayName = getDisplayName(spaceKey)

            return (
              <section key={spaceKey} className="space-y-3">
                {/* Space group header */}
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-gray-100">{displayName}</h2>
                    <p className="text-xs text-gray-500 font-mono">{spaceKey}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      data-testid={TESTIDS.SPACE_FACTS_BATCH_APPROVE}
                      onClick={() => void handleBatchApprove(spaceKey)}
                      className="px-3 py-1.5 text-xs bg-green-800 text-white rounded-sm hover:bg-green-700 transition-colors"
                    >
                      {LABELS.BUTTON_BATCH_APPROVE}
                    </button>
                    <button
                      type="button"
                      data-testid={TESTIDS.SPACE_FACTS_BATCH_REJECT}
                      onClick={() => setBatchRejectTarget(spaceKey)}
                      className="px-3 py-1.5 text-xs bg-red-900 text-white rounded-sm hover:bg-red-800 transition-colors"
                    >
                      {LABELS.BUTTON_BATCH_REJECT}
                    </button>
                  </div>
                </div>

                {/* Fact rows */}
                <div className="space-y-3">
                  {spaceFacts.map(fact => (
                    <CandidateFactRow
                      key={fact.id}
                      fact={fact}
                      onApprove={handleApprove}
                      onReject={handleReject}
                      onPatch={handlePatch}
                      onApproveError={() => showToast(TOAST.FACT_SAVE_FAILED, 'error')}
                      onRejectError={() => showToast(TOAST.FACT_SAVE_FAILED, 'error')}
                      onPatchSuccess={() => showToast(TOAST.FACT_EDITED, 'success')}
                      onPatchError={() => showToast(TOAST.FACT_SAVE_FAILED, 'error')}
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {/* Batch reject confirm dialog */}
      <ConfirmDialog
        open={batchRejectTarget !== null}
        title="確定拒絕？此操作不可復原"
        message={batchRejectTarget ? `將拒絕 ${grouped[batchRejectTarget]?.length ?? 0} 筆 facts` : undefined}
        confirmLabel={LABELS.BUTTON_CONFIRM}
        cancelLabel={LABELS.BUTTON_CANCEL}
        onConfirm={() => void handleBatchRejectConfirm()}
        onCancel={() => setBatchRejectTarget(null)}
      />
    </main>
  )
}
