import { useCallback, useEffect, useRef, useState } from 'react'
import { useDrafts } from '../hooks/useDrafts'
import { approveDraft, rejectDraft, saveDraft } from '../api/draftsApi'
import ApprovalCard, { CardStatus } from '../components/ApprovalCard'
import SkeletonCard from '../components/SkeletonCard'
import EmptyState from '../components/EmptyState'
import ErrorState from '../components/ErrorState'
import { useToast } from '../components/Toast'
import type { Draft } from '../types/draft'

export default function ApprovalsPage() {
  const { drafts, isLoading, error, mutate } = useDrafts()
  const { showToast } = useToast()

  const [focusedIndex, setFocusedIndex] = useState(0)
  const [cardStatuses, setCardStatuses] = useState<Record<number, CardStatus>>({})
  const [editedContents, setEditedContents] = useState<Record<number, string>>({})
  // Track draft IDs that have been removed (for slide-out animation)
  const [removedIds, setRemovedIds] = useState<Set<number>>(new Set())
  // Refs for each card's textarea (for 'e' shortcut)
  const textareaRefs = useRef<Record<number, React.RefObject<HTMLTextAreaElement>>>({})

  // Sync editedContents when drafts change (new draft loaded)
  useEffect(() => {
    setEditedContents(prev => {
      const next: Record<number, string> = { ...prev }
      for (const d of drafts) {
        if (!(d.id in next)) {
          next[d.id] = d.draft_content ?? ''
        }
      }
      return next
    })
    // Ensure focusedIndex stays in bounds
    if (focusedIndex >= drafts.length && drafts.length > 0) {
      setFocusedIndex(drafts.length - 1)
    }
  }, [drafts]) // eslint-disable-line react-hooks/exhaustive-deps

  // Get or create textarea ref for a draft
  function getTextareaRef(draftId: number): React.RefObject<HTMLTextAreaElement> {
    if (!textareaRefs.current[draftId]) {
      textareaRefs.current[draftId] = { current: null }
    }
    return textareaRefs.current[draftId]
  }

  const setStatus = useCallback((id: number, status: CardStatus) => {
    setCardStatuses(prev => ({ ...prev, [id]: status }))
  }, [])

  const removeCard = useCallback(
    (id: number) => {
      setRemovedIds(prev => new Set(prev).add(id))
      // After animation, mutate to revalidate
      setTimeout(() => {
        void mutate()
        setRemovedIds(prev => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
        setCardStatuses(prev => {
          const next = { ...prev }
          delete next[id]
          return next
        })
        setEditedContents(prev => {
          const next = { ...prev }
          delete next[id]
          return next
        })
      }, 300)
    },
    [mutate],
  )

  const handleApprove = useCallback(
    async (id: number, content: string) => {
      const status = cardStatuses[id] ?? 'pending'
      if (status !== 'pending' && status !== 'error') return

      setStatus(id, 'approving')
      try {
        await approveDraft(id, content)
        setStatus(id, 'done')
        showToast('已送出')
        removeCard(id)
      } catch {
        setStatus(id, 'error')
        showToast('送出失敗', 'error')
      }
    },
    [cardStatuses, setStatus, showToast, removeCard],
  )

  const handleReject = useCallback(
    async (id: number) => {
      const status = cardStatuses[id] ?? 'pending'
      if (status !== 'pending' && status !== 'error') return

      setStatus(id, 'approving')
      try {
        await rejectDraft(id)
        setStatus(id, 'done')
        showToast('已丟棄')
        removeCard(id)
      } catch {
        setStatus(id, 'error')
        showToast('丟棄失敗', 'error')
      }
    },
    [cardStatuses, setStatus, showToast, removeCard],
  )

  const handleSave = useCallback(
    async (id: number, content: string) => {
      try {
        await saveDraft(id, content)
        showToast('已暫存')
      } catch {
        showToast('暫存失敗', 'error')
      }
    },
    [showToast],
  )

  const handleRetry = useCallback(
    (id: number) => {
      setStatus(id, 'pending')
    },
    [setStatus],
  )

  const handleContentChange = useCallback((id: number, content: string) => {
    setEditedContents(prev => ({ ...prev, [id]: content }))
  }, [])

  // Visible drafts (exclude removed)
  const visibleDrafts: Draft[] = drafts.filter(d => !removedIds.has(d.id))

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const inTextarea = (e.target as HTMLElement).tagName === 'TEXTAREA'

      if (visibleDrafts.length === 0) return

      const draft = visibleDrafts[focusedIndex]
      if (!draft) return

      switch (e.key) {
        case 'j':
          if (!inTextarea) {
            e.preventDefault()
            setFocusedIndex(i => Math.min(i + 1, visibleDrafts.length - 1))
          }
          break
        case 'k':
          if (!inTextarea) {
            e.preventDefault()
            setFocusedIndex(i => Math.max(i - 1, 0))
          }
          break
        case 'Enter':
          if (!inTextarea) {
            e.preventDefault()
            void handleApprove(draft.id, editedContents[draft.id] ?? draft.draft_content ?? '')
          }
          break
        case 'e':
          if (!inTextarea) {
            e.preventDefault()
            const ref = textareaRefs.current[draft.id]
            if (ref?.current) {
              ref.current.focus()
            }
          }
          break
        case 'x':
          if (!inTextarea) {
            e.preventDefault()
            void handleReject(draft.id)
          }
          break
        case 'Escape':
          if (inTextarea) {
            ;(e.target as HTMLElement).blur()
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [visibleDrafts, focusedIndex, editedContents, handleApprove, handleReject])

  // Render
  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-4">
        <header className="flex items-baseline justify-between mb-4">
          <h1 className="text-lg font-semibold text-[--color-text-default]">Approvals</h1>
        </header>
        <div className="flex flex-col gap-3">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-4">
        <ErrorState onRetry={() => void mutate()} />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-4">
      <header className="flex items-baseline justify-between mb-4">
        <h1 className="text-lg font-semibold text-[--color-text-default]">Approvals</h1>
        {visibleDrafts.length > 0 && (
          <span className="text-xs text-[--color-text-muted]">
            {visibleDrafts.length} 個待處理
          </span>
        )}
      </header>

      {visibleDrafts.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="flex flex-col gap-3">
          {visibleDrafts.map((draft, index) => (
            <ApprovalCard
              key={draft.id}
              draft={draft}
              isFocused={focusedIndex === index}
              status={cardStatuses[draft.id] ?? 'pending'}
              editedContent={editedContents[draft.id] ?? draft.draft_content ?? ''}
              onContentChange={handleContentChange}
              onApprove={handleApprove}
              onReject={handleReject}
              onSave={handleSave}
              onRetry={handleRetry}
              textareaRef={getTextareaRef(draft.id) as React.RefObject<HTMLTextAreaElement>}
            />
          ))}
        </div>
      )}
    </div>
  )
}
