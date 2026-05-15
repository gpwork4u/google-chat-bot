// SpaceFactsDetailPage — /space-facts/{space_key}
// Per-space approved facts with edit/delete/add/mine-again.
// Sprint 7 (F-015) — implemented in F-015-fe2 (#104)

import { useState, useCallback } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import useSWR from 'swr'
import { fetcher, api } from '../api/client'
import { TESTIDS, TOAST, LABELS, API_PATHS } from '../contracts'
import { useToast } from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'
import type {
  SpaceFact,
  SpaceFactCategory,
  SpaceFactVisibility,
  SpaceFactsResponse,
  MiningJob,
} from '../types/spaceFacts'

const CATEGORY_ORDER: SpaceFactCategory[] = [
  'product',
  'my-role',
  'glossary',
  'pinned-decision',
  'relation',
]

const CATEGORY_SECTION_TESTIDS: Record<SpaceFactCategory, string> = {
  product: TESTIDS.SPACE_FACTS_SECTION_PRODUCT,
  'my-role': TESTIDS.SPACE_FACTS_SECTION_MY_ROLE,
  glossary: TESTIDS.SPACE_FACTS_SECTION_GLOSSARY,
  'pinned-decision': TESTIDS.SPACE_FACTS_SECTION_PINNED_DECISION,
  relation: TESTIDS.SPACE_FACTS_SECTION_RELATION,
}

const CATEGORY_LABELS: Record<SpaceFactCategory, string> = {
  product: LABELS.CATEGORY_PRODUCT,
  'my-role': LABELS.CATEGORY_MY_ROLE,
  glossary: LABELS.CATEGORY_GLOSSARY,
  'pinned-decision': LABELS.CATEGORY_PINNED_DECISION,
  relation: LABELS.CATEGORY_RELATION,
}

interface FactRowProps {
  fact: SpaceFact
  onPatch: (id: number, patch: Partial<Pick<SpaceFact, 'content' | 'visibility' | 'category'>>) => Promise<void>
  onDelete: (id: number) => Promise<void>
  onPatchSuccess: () => void
  onPatchError: () => void
  onDeleteSuccess: () => void
  onDeleteError: () => void
}

function FactRow({
  fact,
  onPatch,
  onDelete,
  onPatchSuccess,
  onPatchError,
  onDeleteSuccess,
  onDeleteError,
}: FactRowProps) {
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [editContent, setEditContent] = useState(fact.content)
  const [editVisibility, setEditVisibility] = useState<SpaceFactVisibility>(fact.visibility)
  const [saving, setSaving] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await onPatch(fact.id, { content: editContent, visibility: editVisibility })
      setMode('view')
      onPatchSuccess()
    } catch {
      onPatchError()
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteConfirm = async () => {
    setShowDeleteConfirm(false)
    try {
      await onDelete(fact.id)
      onDeleteSuccess()
    } catch {
      onDeleteError()
    }
  }

  return (
    <article
      data-testid={TESTIDS.SPACE_FACTS_ROW}
      data-fact-id={fact.id}
      className="border border-gray-700 rounded-md bg-gray-900 p-3 space-y-2"
    >
      {mode === 'view' ? (
        <>
          <p className="text-sm text-gray-200 whitespace-pre-wrap">{fact.content}</p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">{fact.visibility}</span>
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                data-testid={TESTIDS.SPACE_FACTS_ROW_EDIT_BTN}
                onClick={() => {
                  setEditContent(fact.content)
                  setEditVisibility(fact.visibility)
                  setMode('edit')
                }}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                {LABELS.BUTTON_EDIT}
              </button>
              <button
                type="button"
                data-testid={TESTIDS.SPACE_FACTS_ROW_DELETE_BTN}
                onClick={() => setShowDeleteConfirm(true)}
                className="text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                {LABELS.BUTTON_DELETE}
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <textarea
            value={editContent}
            onChange={e => setEditContent(e.target.value)}
            rows={2}
            className="w-full px-2.5 py-1.5 text-sm text-gray-200 bg-gray-800 border border-gray-600 rounded-sm focus:outline-none focus:border-indigo-500 resize-none"
          />
          <select
            value={editVisibility}
            onChange={e => setEditVisibility(e.target.value as SpaceFactVisibility)}
            className="h-7 px-1.5 text-xs text-gray-300 bg-gray-800 border border-gray-600 rounded-sm focus:outline-none"
          >
            <option value="public">{LABELS.VISIBILITY_PUBLIC_SF}</option>
            <option value="private">{LABELS.VISIBILITY_PRIVATE_SF}</option>
            <option value="secret">{LABELS.VISIBILITY_SECRET_SF}</option>
          </select>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setMode('view')}
              disabled={saving}
              className="px-3 py-1 text-xs text-gray-400 hover:text-gray-200 transition-colors"
            >
              {LABELS.BUTTON_CANCEL}
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="px-3 py-1 text-xs bg-indigo-700 text-white rounded-sm hover:bg-indigo-600 disabled:opacity-50 transition-colors"
            >
              {saving ? '儲存中...' : LABELS.BUTTON_SAVE}
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={showDeleteConfirm}
        title="確定刪除此 fact？"
        confirmLabel={LABELS.BUTTON_CONFIRM}
        cancelLabel={LABELS.BUTTON_CANCEL}
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </article>
  )
}

interface AddFactFormProps {
  spaceKey: string
  onAdded: () => void
  onSuccess: () => void
  onError: () => void
}

function AddFactForm({ spaceKey, onAdded, onSuccess, onError }: AddFactFormProps) {
  const [content, setContent] = useState('')
  const [category, setCategory] = useState<SpaceFactCategory>('product')
  const [visibility, setVisibility] = useState<SpaceFactVisibility>('private')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!content.trim()) return
    setSaving(true)
    try {
      await api(API_PATHS.SPACE_FACTS, {
        method: 'POST',
        body: JSON.stringify({
          space_key: spaceKey,
          category,
          content: content.trim(),
          visibility,
          created_by: 'manual',
        }),
      })
      setContent('')
      onAdded()
      onSuccess()
    } catch {
      onError()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border border-dashed border-gray-600 rounded-md p-3 space-y-2 bg-gray-800/50">
      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        placeholder="輸入 fact 內容..."
        rows={2}
        className="w-full px-2.5 py-1.5 text-sm text-gray-200 bg-gray-800 border border-gray-600 rounded-sm focus:outline-none focus:border-indigo-500 resize-none"
      />
      <div className="flex gap-2">
        <select
          value={category}
          onChange={e => setCategory(e.target.value as SpaceFactCategory)}
          className="h-7 px-1.5 text-xs text-gray-300 bg-gray-800 border border-gray-600 rounded-sm focus:outline-none"
        >
          {CATEGORY_ORDER.map(cat => (
            <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
          ))}
        </select>
        <select
          value={visibility}
          onChange={e => setVisibility(e.target.value as SpaceFactVisibility)}
          className="h-7 px-1.5 text-xs text-gray-300 bg-gray-800 border border-gray-600 rounded-sm focus:outline-none"
        >
          <option value="public">{LABELS.VISIBILITY_PUBLIC_SF}</option>
          <option value="private">{LABELS.VISIBILITY_PRIVATE_SF}</option>
          <option value="secret">{LABELS.VISIBILITY_SECRET_SF}</option>
        </select>
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={saving || !content.trim()}
          className="ml-auto px-3 py-1 text-xs bg-indigo-700 text-white rounded-sm hover:bg-indigo-600 disabled:opacity-50 transition-colors"
        >
          {saving ? '新增中...' : '儲存'}
        </button>
      </div>
    </div>
  )
}

export default function SpaceFactsDetailPage() {
  const { '*': spaceKeyParam } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { showToast } = useToast()

  // spaceKey can be "spaces/AAA" (URL may encode the slash as %2F or keep it)
  // The route path="space-facts/*" captures everything after /space-facts/
  const spaceKey = spaceKeyParam ? decodeURIComponent(spaceKeyParam) : ''

  const swrKey = spaceKey ? `${API_PATHS.SPACE_FACTS}?space_key=${encodeURIComponent(spaceKey)}&status=approved` : null

  const { data, error, isLoading, mutate } = useSWR<SpaceFactsResponse>(swrKey, fetcher, {
    revalidateOnFocus: false,
  })

  const [showAddFact, setShowAddFact] = useState(false)
  const [miningLoading, setMiningLoading] = useState(false)

  const facts = data?.facts ?? []

  const handlePatch = useCallback(async (
    id: number,
    patch: Partial<Pick<SpaceFact, 'content' | 'visibility' | 'category'>>,
  ) => {
    const updated = await api<SpaceFact>(API_PATHS.SPACE_FACT_PATCH(id), {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
    await mutate(prev => prev ? { facts: prev.facts.map(f => f.id === id ? updated : f) } : prev, false)
  }, [mutate])

  const handleDelete = useCallback(async (id: number) => {
    await api(API_PATHS.SPACE_FACT_DELETE(id), { method: 'DELETE' })
    await mutate(prev => prev ? { facts: prev.facts.filter(f => f.id !== id) } : prev, false)
  }, [mutate])

  const handleMineAgain = useCallback(async () => {
    setMiningLoading(true)
    try {
      await api<MiningJob>(API_PATHS.SPACE_FACTS_MINING_QUEUE, {
        method: 'POST',
        body: JSON.stringify({ space_key: spaceKey }),
      })
      showToast(TOAST.MINING_ENQUEUED, 'success')
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status
      if (status === 409) {
        showToast(TOAST.MINING_ALREADY_RUNNING, 'info')
      } else {
        showToast(TOAST.FACT_SAVE_FAILED, 'error')
      }
    } finally {
      setMiningLoading(false)
    }
  }, [spaceKey, showToast])

  if (!spaceKey) {
    void navigate('/settings')
    return null
  }

  if (isLoading) {
    return (
      <main data-testid={TESTIDS.SPACE_FACTS_DETAIL_PAGE} className="space-y-6">
        <div className="h-8 w-48 bg-gray-800 rounded animate-pulse" />
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 rounded-md bg-gray-900 border border-gray-700 animate-pulse" />
          ))}
        </div>
      </main>
    )
  }

  if (error) {
    return (
      <main data-testid={TESTIDS.SPACE_FACTS_DETAIL_PAGE} className="space-y-6">
        <h1 className="text-xl font-semibold text-gray-100">{spaceKey}</h1>
        <div className="rounded-md border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-300">
          載入失敗，請重新整理
        </div>
      </main>
    )
  }

  const isEmpty = facts.length === 0
  // Avoid unused variable warning
  void location

  return (
    <main data-testid={TESTIDS.SPACE_FACTS_DETAIL_PAGE} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-100">Space Facts</h1>
          <p className="text-xs text-gray-500 font-mono mt-0.5">{spaceKey}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            data-testid={TESTIDS.SPACE_FACTS_ADD_BTN}
            onClick={() => setShowAddFact(v => !v)}
            className="px-3 py-1.5 text-xs bg-indigo-700 text-white rounded-sm hover:bg-indigo-600 transition-colors"
          >
            {LABELS.BUTTON_ADD_FACT}
          </button>
          <button
            type="button"
            data-testid={TESTIDS.SPACE_FACTS_MINE_AGAIN_BTN}
            onClick={() => void handleMineAgain()}
            disabled={miningLoading}
            className="px-3 py-1.5 text-xs bg-gray-700 text-white rounded-sm hover:bg-gray-600 disabled:opacity-50 transition-colors"
          >
            {miningLoading ? '...' : LABELS.BUTTON_MINE_AGAIN}
          </button>
        </div>
      </div>

      {showAddFact && (
        <AddFactForm
          spaceKey={spaceKey}
          onAdded={() => setShowAddFact(false)}
          onSuccess={() => {
            showToast(TOAST.FACT_CREATED, 'success')
            void mutate()
          }}
          onError={() => showToast(TOAST.FACT_SAVE_FAILED, 'error')}
        />
      )}

      {isEmpty ? (
        <div
          data-testid={TESTIDS.SPACE_FACTS_EMPTY_STATE}
          className="rounded-md border border-gray-700 bg-gray-900 px-4 py-12 text-center"
        >
          <p className="text-sm text-gray-500">此 space 尚無 approved facts</p>
        </div>
      ) : (
        <div className="space-y-6">
          {CATEGORY_ORDER.map(category => {
            const categoryFacts = facts.filter(f => f.category === category)
            return (
              <section
                key={category}
                data-testid={CATEGORY_SECTION_TESTIDS[category]}
                className="space-y-2"
              >
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
                  {CATEGORY_LABELS[category]}
                </h2>
                {categoryFacts.length === 0 ? (
                  <p className="text-xs text-gray-600 italic">（此分類尚無 facts）</p>
                ) : (
                  <div className="space-y-2">
                    {categoryFacts.map(fact => (
                      <FactRow
                        key={fact.id}
                        fact={fact}
                        onPatch={handlePatch}
                        onDelete={handleDelete}
                        onPatchSuccess={() => showToast(TOAST.FACT_EDITED, 'success')}
                        onPatchError={() => showToast(TOAST.FACT_SAVE_FAILED, 'error')}
                        onDeleteSuccess={() => showToast(TOAST.FACT_DELETED, 'success')}
                        onDeleteError={() => showToast(TOAST.FACT_SAVE_FAILED, 'error')}
                      />
                    ))}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}
    </main>
  )
}
