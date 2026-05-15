// CandidateFactRow — single candidate fact row with approve/edit/reject
// Sprint 7 (F-015)

import { useState, useCallback } from 'react'
import { api } from '../api/client'
import { TESTIDS, LABELS, API_PATHS } from '../contracts'
import ConfirmDialog from './ConfirmDialog'
import type { SpaceFact, SpaceFactCategory, SpaceFactVisibility, Message, MessagesResponse } from '../types/spaceFacts'

interface CandidateFactRowProps {
  fact: SpaceFact
  onApprove: (id: number) => Promise<void>
  onReject: (id: number) => Promise<void>
  onPatch: (id: number, patch: Partial<Pick<SpaceFact, 'content' | 'visibility' | 'category'>>) => Promise<SpaceFact>
  onApproveError: () => void
  onRejectError: () => void
  onPatchSuccess: () => void
  onPatchError: () => void
}

const CATEGORY_LABELS: Record<SpaceFactCategory, string> = {
  product: LABELS.CATEGORY_PRODUCT,
  'my-role': LABELS.CATEGORY_MY_ROLE,
  glossary: LABELS.CATEGORY_GLOSSARY,
  'pinned-decision': LABELS.CATEGORY_PINNED_DECISION,
  relation: LABELS.CATEGORY_RELATION,
}

const CATEGORY_COLORS: Record<SpaceFactCategory, string> = {
  product: 'bg-blue-900 text-blue-300',
  'my-role': 'bg-purple-900 text-purple-300',
  glossary: 'bg-teal-900 text-teal-300',
  'pinned-decision': 'bg-orange-900 text-orange-300',
  relation: 'bg-pink-900 text-pink-300',
}

export default function CandidateFactRow({
  fact,
  onApprove,
  onReject,
  onPatch,
  onApproveError,
  onRejectError,
  onPatchSuccess,
  onPatchError,
}: CandidateFactRowProps) {
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [editContent, setEditContent] = useState(fact.content)
  const [editVisibility, setEditVisibility] = useState<SpaceFactVisibility>(fact.visibility)
  const [editCategory, setEditCategory] = useState<SpaceFactCategory>(fact.category)
  const [saving, setSaving] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [showRejectConfirm, setShowRejectConfirm] = useState(false)
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [sourceMessages, setSourceMessages] = useState<(Message | null)[]>([])
  const [sourcesLoading, setSourcesLoading] = useState(false)

  const handleApprove = useCallback(async () => {
    try {
      await onApprove(fact.id)
    } catch {
      onApproveError()
    }
  }, [fact.id, onApprove, onApproveError])

  const handleRejectConfirm = useCallback(async () => {
    setShowRejectConfirm(false)
    setRejecting(true)
    try {
      await onReject(fact.id)
    } catch {
      onRejectError()
    } finally {
      setRejecting(false)
    }
  }, [fact.id, onReject, onRejectError])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      await onPatch(fact.id, {
        content: editContent,
        visibility: editVisibility,
        category: editCategory,
      })
      setMode('view')
      onPatchSuccess()
    } catch {
      onPatchError()
    } finally {
      setSaving(false)
    }
  }, [fact.id, editContent, editVisibility, editCategory, onPatch, onPatchSuccess, onPatchError])

  const handleCancel = useCallback(() => {
    setEditContent(fact.content)
    setEditVisibility(fact.visibility)
    setEditCategory(fact.category)
    setMode('view')
  }, [fact.content, fact.visibility, fact.category])

  const handleVisibilityChange = useCallback(async (newVis: SpaceFactVisibility) => {
    try {
      await onPatch(fact.id, { visibility: newVis })
      onPatchSuccess()
    } catch {
      onPatchError()
    }
  }, [fact.id, onPatch, onPatchSuccess, onPatchError])

  const handleSourceToggle = useCallback(async () => {
    if (sourcesOpen) {
      setSourcesOpen(false)
      return
    }
    setSourcesOpen(true)
    if (sourceMessages.length > 0) return

    if (!fact.source_message_ids || fact.source_message_ids.length === 0) return

    setSourcesLoading(true)
    try {
      const idIn = fact.source_message_ids.join(',')
      const res = await api<MessagesResponse>(`${API_PATHS.MESSAGES}?id_in=${idIn}`)
      // Map by id to handle deleted messages
      const msgMap = new Map(res.messages.map(m => [m.id, m]))
      const ordered = fact.source_message_ids.map(id => msgMap.get(id) ?? null)
      setSourceMessages(ordered)
    } catch {
      setSourceMessages([])
    } finally {
      setSourcesLoading(false)
    }
  }, [sourcesOpen, sourceMessages.length, fact.source_message_ids])

  return (
    <article
      data-testid={TESTIDS.CANDIDATE_FACT_ROW}
      data-fact-id={fact.id}
      className="border border-gray-700 rounded-md bg-gray-900 p-4 space-y-3"
    >
      {/* Category + Visibility row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span
          data-testid={TESTIDS.CANDIDATE_FACT_CATEGORY}
          className={`text-xs font-medium px-2 py-0.5 rounded-full ${CATEGORY_COLORS[fact.category]}`}
        >
          {CATEGORY_LABELS[fact.category]}
        </span>
        {mode === 'view' && (
          <select
            data-testid={TESTIDS.CANDIDATE_FACT_VISIBILITY_SELECT}
            value={fact.visibility}
            onChange={e => void handleVisibilityChange(e.target.value as SpaceFactVisibility)}
            className="h-6 px-1.5 text-xs text-gray-300 bg-gray-800 border border-gray-600 rounded-sm focus:outline-none focus:border-indigo-500"
          >
            <option value="public">{LABELS.VISIBILITY_PUBLIC_SF}</option>
            <option value="private">{LABELS.VISIBILITY_PRIVATE_SF}</option>
            <option value="secret">{LABELS.VISIBILITY_SECRET_SF}</option>
          </select>
        )}
      </div>

      {/* Content */}
      {mode === 'view' ? (
        <div
          data-testid={TESTIDS.CANDIDATE_FACT_CONTENT}
          className="text-sm text-gray-200 whitespace-pre-wrap"
        >
          {fact.content}
        </div>
      ) : (
        <div className="space-y-2">
          <textarea
            data-testid={TESTIDS.CANDIDATE_FACT_CONTENT}
            value={editContent}
            onChange={e => setEditContent(e.target.value)}
            rows={3}
            className="w-full px-2.5 py-1.5 text-sm text-gray-200 bg-gray-800 border border-gray-600 rounded-sm focus:outline-none focus:border-indigo-500 resize-none"
          />
          <div className="flex gap-2">
            <select
              value={editVisibility}
              onChange={e => setEditVisibility(e.target.value as SpaceFactVisibility)}
              className="h-7 px-1.5 text-xs text-gray-300 bg-gray-800 border border-gray-600 rounded-sm focus:outline-none focus:border-indigo-500"
            >
              <option value="public">{LABELS.VISIBILITY_PUBLIC_SF}</option>
              <option value="private">{LABELS.VISIBILITY_PRIVATE_SF}</option>
              <option value="secret">{LABELS.VISIBILITY_SECRET_SF}</option>
            </select>
            <select
              value={editCategory}
              onChange={e => setEditCategory(e.target.value as SpaceFactCategory)}
              className="h-7 px-1.5 text-xs text-gray-300 bg-gray-800 border border-gray-600 rounded-sm focus:outline-none focus:border-indigo-500"
            >
              <option value="product">{LABELS.CATEGORY_PRODUCT}</option>
              <option value="my-role">{LABELS.CATEGORY_MY_ROLE}</option>
              <option value="glossary">{LABELS.CATEGORY_GLOSSARY}</option>
              <option value="pinned-decision">{LABELS.CATEGORY_PINNED_DECISION}</option>
              <option value="relation">{LABELS.CATEGORY_RELATION}</option>
            </select>
          </div>
        </div>
      )}

      {/* Source messages toggle */}
      {fact.source_message_ids && fact.source_message_ids.length > 0 && (
        <div>
          <button
            type="button"
            data-testid={TESTIDS.CANDIDATE_FACT_SOURCE_TOGGLE}
            onClick={() => void handleSourceToggle()}
            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            {sourcesOpen ? '隱藏來源訊息' : `查看來源訊息 (${fact.source_message_ids.length})`}
          </button>

          {sourcesOpen && (
            <div className="mt-2">
              {sourcesLoading ? (
                <p className="text-xs text-gray-500">載入中...</p>
              ) : (
                <ul
                  data-testid={TESTIDS.CANDIDATE_FACT_SOURCE_LIST}
                  className="space-y-1 border-l-2 border-gray-700 pl-3"
                >
                  {sourceMessages.map((msg, idx) =>
                    msg === null ? (
                      <li key={idx} className="text-xs text-gray-500 italic">
                        (訊息已刪除)
                      </li>
                    ) : (
                      <li key={msg.id} className="text-xs space-y-0.5">
                        <span className="text-gray-400 font-medium">{msg.sender_name}</span>
                        <span className="text-gray-600 mx-1">·</span>
                        <span className="text-gray-600">{new Date(msg.observed_at).toLocaleString()}</span>
                        <p className="text-gray-300">{msg.body}</p>
                      </li>
                    ),
                  )}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 pt-1 border-t border-gray-700">
        {mode === 'view' ? (
          <>
            <button
              type="button"
              data-testid={TESTIDS.CANDIDATE_FACT_APPROVE_BTN}
              onClick={() => void handleApprove()}
              className="px-3 py-1 text-xs bg-green-700 text-white rounded-sm hover:bg-green-600 transition-colors"
            >
              {LABELS.BUTTON_APPROVE}
            </button>
            <button
              type="button"
              data-testid={TESTIDS.CANDIDATE_FACT_EDIT_BTN}
              onClick={() => setMode('edit')}
              className="px-3 py-1 text-xs bg-indigo-700 text-white rounded-sm hover:bg-indigo-600 transition-colors"
            >
              {LABELS.BUTTON_EDIT}
            </button>
            <button
              type="button"
              data-testid={TESTIDS.CANDIDATE_FACT_REJECT_BTN}
              onClick={() => setShowRejectConfirm(true)}
              disabled={rejecting}
              className="px-3 py-1 text-xs bg-red-800 text-white rounded-sm hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {LABELS.BUTTON_REJECT}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              data-testid={TESTIDS.CANDIDATE_FACT_SAVE_BTN}
              onClick={() => void handleSave()}
              disabled={saving}
              className="px-3 py-1 text-xs bg-indigo-700 text-white rounded-sm hover:bg-indigo-600 disabled:opacity-50 transition-colors"
            >
              {saving ? '儲存中...' : LABELS.BUTTON_SAVE}
            </button>
            <button
              type="button"
              data-testid={TESTIDS.CANDIDATE_FACT_CANCEL_BTN}
              onClick={handleCancel}
              disabled={saving}
              className="px-3 py-1 text-xs text-gray-400 hover:text-gray-200 transition-colors"
            >
              {LABELS.BUTTON_CANCEL}
            </button>
          </>
        )}
      </div>

      {/* Reject confirm dialog */}
      <ConfirmDialog
        open={showRejectConfirm}
        title="確定拒絕？此操作不可復原"
        confirmLabel={LABELS.BUTTON_CONFIRM}
        cancelLabel={LABELS.BUTTON_CANCEL}
        onConfirm={() => void handleRejectConfirm()}
        onCancel={() => setShowRejectConfirm(false)}
      />
    </article>
  )
}
