import { useCallback, useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { api, fetcher } from '../api/client'
import { useSettings } from '../hooks/useSettings'
import { useToast } from '../components/Toast'
import { TESTIDS, TOAST } from '../contracts'

// ─── Types ───────────────────────────────────────────────────────────────────

type AutoModeOverride = 'inherit' | 'always_on' | 'always_off'

interface SpaceSetting {
  space_key: string
  space_name: string
  enabled: boolean
  disabled: boolean
  mention_only: boolean
  auto_mode_override: AutoModeOverride
  blocked_keywords: string[]
}

interface SpacesResponse {
  spaces: SpaceSetting[]
}

type FactVisibility = 'public' | 'private' | 'secret'

interface ProfileFact {
  id: number
  key: string
  value: string
  visibility: FactVisibility
  note: string
  updated_at: string
}

interface ProfileResponse {
  facts: ProfileFact[]
}

// ─── Toggle Component ─────────────────────────────────────────────────────────

interface ToggleProps {
  checked: boolean
  onChange: (val: boolean) => void
  ariaLabel: string
  disabled?: boolean
  testId?: string
}

function Toggle({ checked, onChange, ariaLabel, disabled, testId }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      data-testid={testId}
      onClick={() => !disabled && onChange(!checked)}
      className={[
        'relative inline-flex items-center justify-center',
        'w-11 h-11 -mr-1.5 rounded-sm',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
      ].join(' ')}
    >
      <span
        className={[
          'w-10 h-6 rounded-full transition-colors duration-200',
          checked ? 'bg-indigo-600' : 'bg-gray-600',
        ].join(' ')}
      />
      <span
        className={[
          'absolute w-5 h-5 bg-white rounded-full shadow-sm',
          'transition-transform duration-200',
          checked ? 'translate-x-[10px]' : 'translate-x-[-10px]',
        ].join(' ')}
      />
      <span className="sr-only">{checked ? 'on' : 'off'}</span>
    </button>
  )
}

// ─── KeywordChip ──────────────────────────────────────────────────────────────

interface KeywordChipProps {
  keyword: string
  onDelete: () => void
  disabled?: boolean
}

function KeywordChip({ keyword, onDelete, disabled }: KeywordChipProps) {
  return (
    <span
      data-testid={TESTIDS.KEYWORD_CHIP}
      data-keyword={keyword}
      className="inline-flex items-center gap-1 h-6 pl-2 pr-1 text-xs rounded-full border bg-gray-800 text-gray-300 border-gray-600 select-none"
    >
      {keyword}
      <button
        type="button"
        aria-label={`刪除關鍵字 ${keyword}`}
        data-testid={TESTIDS.REMOVE_KEYWORD}
        disabled={disabled}
        onClick={onDelete}
        className={[
          'flex items-center justify-center w-4 h-4 -mr-0.5 rounded-full',
          'transition-colors duration-150 text-gray-400',
          disabled
            ? 'opacity-40 cursor-not-allowed'
            : 'hover:text-white hover:bg-gray-600 focus:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500',
        ].join(' ')}
      >
        ×
      </button>
    </span>
  )
}

// ─── ChannelCard ─────────────────────────────────────────────────────────────

interface ChannelCardProps {
  space: SpaceSetting
  onEnabledChange: (spaceId: string, enabled: boolean) => Promise<void>
  onMentionOnlyChange: (spaceId: string, val: boolean) => Promise<void>
  onAutoModeOverrideChange: (spaceId: string, val: AutoModeOverride) => Promise<void>
  onBlockedKeywordsChange: (spaceId: string, keywords: string[]) => Promise<void>
}

function ChannelCard({
  space,
  onEnabledChange,
  onMentionOnlyChange,
  onAutoModeOverrideChange,
  onBlockedKeywordsChange,
}: ChannelCardProps) {
  const [keywordInput, setKeywordInput] = useState('')

  const handleAddKeyword = useCallback(async () => {
    const kw = keywordInput.trim()
    if (!kw) return
    if (space.blocked_keywords.includes(kw)) return
    const next = [...space.blocked_keywords, kw]
    setKeywordInput('')
    await onBlockedKeywordsChange(space.space_key, next)
  }, [keywordInput, space.blocked_keywords, space.space_key, onBlockedKeywordsChange])

  const handleRemoveKeyword = useCallback(
    async (kw: string) => {
      const next = space.blocked_keywords.filter(k => k !== kw)
      await onBlockedKeywordsChange(space.space_key, next)
    },
    [space.blocked_keywords, space.space_key, onBlockedKeywordsChange],
  )

  const disabled = !space.enabled

  return (
    <div
      role="region"
      aria-label={`${space.space_name} 設定`}
      data-testid={TESTIDS.CHANNEL_CARD}
      data-space-id={space.space_key}
      className={[
        'rounded-md border border-gray-700 bg-gray-900 overflow-hidden transition-opacity duration-150',
        disabled ? 'opacity-75' : '',
      ].join(' ')}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-700">
        <p className="text-sm font-semibold text-gray-100">{space.space_name}</p>
        <p className="text-xs text-gray-500 font-mono mt-0.5">{space.space_key}</p>
      </div>

      {/* Enabled toggle */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <span className="text-sm text-gray-300">啟用此空間</span>
        <Toggle
          checked={space.enabled}
          onChange={(val) => void onEnabledChange(space.space_key, val)}
          ariaLabel={`啟用 ${space.space_name}`}
          testId={TESTIDS.ENABLED_TOGGLE}
        />
      </div>

      {/* Mention-only toggle */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <span className={`text-sm ${disabled ? 'text-gray-500' : 'text-gray-300'}`}>只在 @提及 時觸發</span>
        <Toggle
          checked={space.mention_only}
          onChange={(val) => void onMentionOnlyChange(space.space_key, val)}
          ariaLabel="只在被 @提及 時觸發"
          disabled={disabled}
          testId={TESTIDS.MENTION_ONLY_TOGGLE}
        />
      </div>

      {/* Auto mode override */}
      <div className={`px-4 py-3 border-b border-gray-700 ${disabled ? 'opacity-50' : ''}`}>
        <p className="text-xs font-medium text-gray-400 mb-2">Auto 模式覆寫</p>
        <fieldset disabled={disabled}>
          <legend className="sr-only">Auto 模式覆寫</legend>
          <div className="flex gap-4">
            {(['inherit', 'always_on', 'always_off'] as AutoModeOverride[]).map((val) => {
              const labels: Record<AutoModeOverride, string> = {
                inherit: '繼承全域',
                always_on: '強制開啟',
                always_off: '強制關閉',
              }
              return (
                <label key={val} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name={`override-${space.space_key}`}
                    value={val}
                    checked={space.auto_mode_override === val}
                    onChange={() => void onAutoModeOverrideChange(space.space_key, val)}
                    data-testid={`override-${val}`}
                    className="accent-indigo-600"
                  />
                  <span className={space.auto_mode_override === val ? 'text-indigo-400 font-medium' : 'text-gray-400'}>
                    {labels[val]}
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>
      </div>

      {/* Blocked keywords */}
      <div className={`px-4 py-3 ${disabled ? 'opacity-50' : ''}`}>
        <p className="text-xs font-medium text-gray-400 mb-1">封鎖關鍵字</p>
        <p className="text-xs text-gray-500 mb-2">含有這些關鍵字的訊息不會觸發草稿</p>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {space.blocked_keywords.map((kw) => (
            <KeywordChip
              key={kw}
              keyword={kw}
              onDelete={() => void handleRemoveKeyword(kw)}
              disabled={disabled}
            />
          ))}
        </div>
        <input
          type="text"
          data-testid={TESTIDS.KEYWORD_INPUT}
          placeholder="輸入關鍵字，Enter 新增..."
          value={keywordInput}
          disabled={disabled}
          onChange={(e) => setKeywordInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void handleAddKeyword()
            }
          }}
          className={[
            'w-full h-8 px-2.5 text-xs text-gray-200 bg-gray-800',
            'border border-gray-600 rounded-sm',
            'focus:outline-none focus:border-indigo-500',
            disabled ? 'opacity-50 cursor-not-allowed' : '',
          ].join(' ')}
        />
      </div>
    </div>
  )
}

// ─── ProfileFactItem ──────────────────────────────────────────────────────────

interface ProfileFactItemProps {
  fact: ProfileFact
  onEdit: (fact: ProfileFact) => Promise<void>
  onDelete: (id: number) => Promise<void>
}

const VISIBILITY_BADGE: Record<FactVisibility, string> = {
  public: 'bg-green-900 text-green-300',
  private: 'bg-yellow-900 text-yellow-300',
  secret: 'bg-red-900 text-red-300',
}

const VISIBILITY_LABELS: Record<FactVisibility, string> = {
  public: '公開',
  private: '私人',
  secret: '機密',
}

function ProfileFactItem({ fact, onEdit, onDelete }: ProfileFactItemProps) {
  const [mode, setMode] = useState<'view' | 'edit' | 'deleting'>('view')
  const [editKey, setEditKey] = useState(fact.key)
  const [editValue, setEditValue] = useState(fact.value)
  const [editVisibility, setEditVisibility] = useState<FactVisibility>(fact.visibility)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await onEdit({ ...fact, key: editKey, value: editValue, visibility: editVisibility })
      setMode('view')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setSaving(true)
    try {
      await onDelete(fact.id)
    } finally {
      setSaving(false)
      setMode('view')
    }
  }

  if (mode === 'edit') {
    return (
      <li role="listitem" data-testid={TESTIDS.PROFILE_FACT_ITEM} className="py-2 border-b border-gray-700 last:border-b-0">
        <div role="form" aria-label={`編輯 ${fact.key}`} className="mt-1 p-3 bg-gray-800 border border-gray-600 rounded-sm space-y-2">
          <div>
            <label className="block text-xs text-gray-400 mb-1" htmlFor={`edit-key-${fact.id}`}>名稱</label>
            <input
              id={`edit-key-${fact.id}`}
              type="text"
              data-testid={TESTIDS.FACT_KEY}
              name="key"
              value={editKey}
              onChange={(e) => setEditKey(e.target.value)}
              aria-required="true"
              className="w-full h-8 px-2.5 text-sm text-gray-200 bg-gray-900 border border-gray-600 rounded-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1" htmlFor={`edit-value-${fact.id}`}>內容</label>
            <textarea
              id={`edit-value-${fact.id}`}
              data-testid={TESTIDS.FACT_VALUE}
              name="value"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              rows={2}
              className="w-full px-2.5 py-1.5 text-sm text-gray-200 bg-gray-900 border border-gray-600 rounded-sm focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1" htmlFor={`edit-vis-${fact.id}`}>可見度</label>
            <select
              id={`edit-vis-${fact.id}`}
              data-testid={TESTIDS.FACT_VISIBILITY}
              name="visibility"
              value={editVisibility}
              onChange={(e) => setEditVisibility(e.target.value as FactVisibility)}
              className="h-8 px-2 text-sm text-gray-200 bg-gray-900 border border-gray-600 rounded-sm focus:outline-none focus:border-indigo-500"
            >
              <option value="public">公開</option>
              <option value="private">私人</option>
              <option value="secret">機密</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setMode('view')}
              className="px-3 py-1 text-xs text-gray-400 hover:text-gray-200 rounded-sm transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="px-3 py-1 text-xs bg-indigo-600 text-white rounded-sm hover:bg-indigo-500 disabled:opacity-50 transition-colors"
            >
              {saving ? '儲存中...' : '儲存'}
            </button>
          </div>
        </div>
      </li>
    )
  }

  if (mode === 'deleting') {
    return (
      <li role="listitem" data-testid={TESTIDS.PROFILE_FACT_ITEM} className="flex items-center gap-2 py-2 border-b border-gray-700 last:border-b-0">
        <span className="flex-1 text-sm text-gray-300 truncate">{fact.key}</span>
        <span className="text-xs text-gray-400">確認刪除？</span>
        <button
          type="button"
          onClick={() => setMode('view')}
          className="px-2 py-1 text-xs text-gray-400 hover:text-gray-200 transition-colors"
        >
          取消
        </button>
        <button
          type="button"
          onClick={() => void handleDelete()}
          disabled={saving}
          className="px-2 py-1 text-xs bg-red-700 text-white rounded-sm hover:bg-red-600 disabled:opacity-50 transition-colors"
        >
          確認刪除
        </button>
      </li>
    )
  }

  return (
    <li role="listitem" data-testid={TESTIDS.PROFILE_FACT_ITEM} className="flex items-center gap-2 py-2 border-b border-gray-700 last:border-b-0">
      <span className="flex-1 text-sm text-gray-200 truncate min-w-0">{fact.key}</span>
      <span
        className={`text-xs px-1.5 py-0.5 rounded-sm flex-shrink-0 ${VISIBILITY_BADGE[fact.visibility]}`}
      >
        {VISIBILITY_LABELS[fact.visibility]}
      </span>
      <button
        type="button"
        aria-label={`編輯：${fact.key}`}
        onClick={() => {
          setEditKey(fact.key)
          setEditValue(fact.value)
          setEditVisibility(fact.visibility)
          setMode('edit')
        }}
        className="flex items-center justify-center w-7 h-7 rounded-sm text-gray-400 hover:text-gray-200 hover:bg-gray-700 focus:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500 transition-colors flex-shrink-0"
      >
        ✎
      </button>
      <button
        type="button"
        aria-label={`刪除：${fact.key}`}
        onClick={() => setMode('deleting')}
        className="flex items-center justify-center w-7 h-7 rounded-sm text-gray-400 hover:text-red-400 hover:bg-gray-700 focus:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500 transition-colors flex-shrink-0"
      >
        🗑
      </button>
    </li>
  )
}

// ─── ProfileFactGroup ─────────────────────────────────────────────────────────

interface ProfileFactGroupProps {
  visibility: FactVisibility
  facts: ProfileFact[]
  onEdit: (fact: ProfileFact) => Promise<void>
  onDelete: (id: number) => Promise<void>
  onAdd: (key: string, value: string, visibility: FactVisibility) => Promise<void>
}

const VISIBILITY_GROUP_LABELS: Record<FactVisibility, { title: string; desc: string }> = {
  public: { title: '公開', desc: '供 AI 在所有回覆中參考' },
  private: { title: '私人', desc: '僅供特定情境使用' },
  secret: { title: '機密', desc: 'AI 不會在回覆中揭露這些資訊' },
}

function ProfileFactGroup({ visibility, facts, onEdit, onDelete, onAdd }: ProfileFactGroupProps) {
  const [showAdd, setShowAdd] = useState(false)
  const [addKey, setAddKey] = useState('')
  const [addValue, setAddValue] = useState('')
  const [saving, setSaving] = useState(false)
  const { title, desc } = VISIBILITY_GROUP_LABELS[visibility]

  const handleAdd = async () => {
    if (!addKey.trim() || !addValue.trim()) return
    setSaving(true)
    try {
      await onAdd(addKey.trim(), addValue.trim(), visibility)
      setAddKey('')
      setAddValue('')
      setShowAdd(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      role="group"
      aria-label={`${title} 事實分組`}
      data-testid={TESTIDS.PROFILE_GROUP}
      data-visibility={visibility}
      className="rounded-md border border-gray-700 bg-gray-900 overflow-hidden"
    >
      {/* Group header */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-800 border-b border-gray-700">
        <span className={`text-xs px-1.5 py-0.5 rounded-sm font-medium ${VISIBILITY_BADGE[visibility]}`}>
          {title}
        </span>
        <span className="text-xs text-gray-500">{desc}</span>
      </div>

      {/* Facts list */}
      {facts.length === 0 ? (
        <p className="px-4 py-4 text-sm text-center text-gray-500">尚無{title}事實</p>
      ) : (
        <ul role="list" className="px-4">
          {facts.map((f) => (
            <ProfileFactItem key={f.id} fact={f} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </ul>
      )}

      {/* Add form */}
      {showAdd && (
        <div className="px-4 pb-3 border-t border-gray-700">
          <div role="form" aria-label={`新增${title}事實`} className="mt-2 p-3 bg-gray-800 border border-gray-600 rounded-sm space-y-2">
            <div>
              <label className="block text-xs text-gray-400 mb-1">名稱</label>
              <input
                type="text"
                data-testid={TESTIDS.FACT_KEY}
                name="key"
                value={addKey}
                placeholder="例：工作習慣"
                onChange={(e) => setAddKey(e.target.value)}
                className="w-full h-8 px-2.5 text-sm text-gray-200 bg-gray-900 border border-gray-600 rounded-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">內容</label>
              <textarea
                data-testid={TESTIDS.FACT_VALUE}
                name="value"
                value={addValue}
                placeholder="例：早上效率高"
                onChange={(e) => setAddValue(e.target.value)}
                rows={2}
                className="w-full px-2.5 py-1.5 text-sm text-gray-200 bg-gray-900 border border-gray-600 rounded-sm focus:outline-none focus:border-indigo-500 resize-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowAdd(false)} className="px-3 py-1 text-xs text-gray-400 hover:text-gray-200 transition-colors">取消</button>
              <button
                type="button"
                onClick={() => void handleAdd()}
                disabled={saving || !addKey.trim() || !addValue.trim()}
                className="px-3 py-1 text-xs bg-indigo-600 text-white rounded-sm hover:bg-indigo-500 disabled:opacity-50 transition-colors"
              >
                {saving ? '新增中...' : '新增'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add button row */}
      <div className="px-4 py-2 border-t border-gray-700">
        <button
          type="button"
          aria-label={`新增${title}事實`}
          onClick={() => setShowAdd(!showAdd)}
          className="inline-flex items-center gap-1 h-7 px-2 text-xs text-gray-400 border border-dashed border-gray-600 rounded-sm hover:bg-gray-800 hover:border-gray-500 focus:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500 transition-colors"
        >
          + 新增{title}事實
        </button>
      </div>
    </div>
  )
}

// ─── SettingsPage ─────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { settings, isLoading: settingsLoading, error: settingsError, mutate: mutateSettings } = useSettings()
  const { data: spacesData, isLoading: spacesLoading, error: spacesError, mutate: mutateSpaces } = useSWR<SpacesResponse>('/api/spaces', fetcher)
  const { data: profileData, isLoading: profileLoading, error: profileError, mutate: mutateProfile } = useSWR<ProfileResponse>(
    '/api/claude/profile?include_secret=1',
    fetcher,
  )
  const { showToast } = useToast()

  // ── Freshness local state (validate before PATCH) ──
  const [freshnessValue, setFreshnessValue] = useState<number | ''>(settings?.freshness_window_minutes ?? 30)
  const [freshnessError, setFreshnessError] = useState<string | null>(null)
  const freshnessRef = useRef<HTMLInputElement>(null)

  // Sync freshness when settings load
  useEffect(() => {
    if (settings?.freshness_window_minutes !== undefined) {
      setFreshnessValue(settings.freshness_window_minutes)
    }
  }, [settings?.freshness_window_minutes])

  // ── Global Settings PATCH ──
  const patchSettings = useCallback(
    async (body: Record<string, unknown>) => {
      try {
        const updated = await api<Record<string, unknown>>('/api/settings', {
          method: 'PATCH',
          body: JSON.stringify(body),
        })
        await mutateSettings(prev => prev ? { ...prev, ...updated } as typeof prev : prev, false)
        showToast(TOAST.SETTINGS_SAVED, 'success')
      } catch {
        showToast(TOAST.SETTINGS_SAVE_FAILED, 'error')
        await mutateSettings()
      }
    },
    [mutateSettings, showToast],
  )

  const handleAutoModeToggle = useCallback(
    async (val: boolean) => {
      // Optimistic update
      const prevSettings = settings
      await mutateSettings(prev => prev ? { ...prev, auto_mode: val } : prev, false)
      try {
        await api('/api/settings', { method: 'PATCH', body: JSON.stringify({ auto_mode: val }) })
        showToast(TOAST.SETTINGS_SAVED, 'success')
      } catch {
        showToast(TOAST.SETTINGS_SAVE_FAILED, 'error')
        // Rollback
        if (prevSettings) {
          await mutateSettings(prevSettings, false)
        } else {
          await mutateSettings()
        }
      }
    },
    [settings, mutateSettings, showToast],
  )

  const handleDebugToggle = useCallback(
    async (val: boolean) => {
      await mutateSettings(prev => prev ? { ...prev, debug_mode: val } : prev, false)
      try {
        await api('/api/settings', { method: 'PATCH', body: JSON.stringify({ debug_mode: val }) })
        showToast(TOAST.SETTINGS_SAVED, 'success')
      } catch {
        showToast(TOAST.SETTINGS_SAVE_FAILED, 'error')
        await mutateSettings()
      }
    },
    [mutateSettings, showToast],
  )

  const validateAndSaveFreshness = useCallback(async () => {
    const v = Number(freshnessValue)
    if (freshnessValue === '' || isNaN(v) || v < 1 || v > 1440) {
      setFreshnessError('請輸入 1–1440 之間的數字')
      return
    }
    setFreshnessError(null)
    await patchSettings({ freshness_window_minutes: v })
  }, [freshnessValue, patchSettings])

  // ── Spaces PATCH ──
  const handleEnabledChange = useCallback(
    async (spaceId: string, enabled: boolean) => {
      try {
        await api('/api/spaces/toggle', {
          method: 'POST',
          body: JSON.stringify({ space_id: spaceId, enabled }),
        })
        await mutateSpaces()
        showToast(TOAST.SETTINGS_SAVED, 'success')
      } catch {
        showToast(TOAST.SETTINGS_SAVE_FAILED, 'error')
      }
    },
    [mutateSpaces, showToast],
  )

  const handleMentionOnlyChange = useCallback(
    async (spaceId: string, val: boolean) => {
      try {
        await api(`/api/spaces/${spaceId}`, {
          method: 'PATCH',
          body: JSON.stringify({ mention_only: val }),
        })
        await mutateSpaces()
        showToast(TOAST.SETTINGS_SAVED, 'success')
      } catch {
        showToast(TOAST.SETTINGS_SAVE_FAILED, 'error')
      }
    },
    [mutateSpaces, showToast],
  )

  const handleAutoModeOverrideChange = useCallback(
    async (spaceId: string, val: AutoModeOverride) => {
      try {
        await api(`/api/spaces/${spaceId}`, {
          method: 'PATCH',
          body: JSON.stringify({ auto_mode_override: val }),
        })
        await mutateSpaces()
        showToast(TOAST.SETTINGS_SAVED, 'success')
      } catch {
        showToast(TOAST.SETTINGS_SAVE_FAILED, 'error')
      }
    },
    [mutateSpaces, showToast],
  )

  const handleBlockedKeywordsChange = useCallback(
    async (spaceId: string, keywords: string[]) => {
      try {
        await api(`/api/spaces/${spaceId}`, {
          method: 'PATCH',
          body: JSON.stringify({ blocked_keywords: keywords }),
        })
        await mutateSpaces()
        showToast(TOAST.SETTINGS_SAVED, 'success')
      } catch {
        showToast(TOAST.SETTINGS_SAVE_FAILED, 'error')
      }
    },
    [mutateSpaces, showToast],
  )

  // ── Profile CRUD ──
  const handleProfileEdit = useCallback(
    async (fact: ProfileFact) => {
      await api(`/api/claude/profile/${fact.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ key: fact.key, value: fact.value, visibility: fact.visibility }),
      })
      await mutateProfile()
      showToast(TOAST.SETTINGS_SAVED, 'success')
    },
    [mutateProfile, showToast],
  )

  const handleProfileDelete = useCallback(
    async (id: number) => {
      await api(`/api/claude/profile/${id}`, { method: 'DELETE' })
      await mutateProfile()
      showToast(TOAST.PROFILE_DELETED, 'success')
    },
    [mutateProfile, showToast],
  )

  const handleProfileAdd = useCallback(
    async (key: string, value: string, visibility: FactVisibility) => {
      await api('/api/claude/profile', {
        method: 'POST',
        body: JSON.stringify({ key, value, visibility }),
      })
      await mutateProfile()
      showToast(TOAST.PROFILE_ADDED, 'success')
    },
    [mutateProfile, showToast],
  )

  // ── Render ──

  const spaces: SpaceSetting[] = (spacesData?.spaces ?? []).map(s => ({
    ...s,
    enabled: !s.disabled,
    blocked_keywords: s.blocked_keywords ?? [],
    auto_mode_override: (s.auto_mode_override as AutoModeOverride) ?? 'inherit',
  }))

  const facts = profileData?.facts ?? []
  const publicFacts = facts.filter(f => f.visibility === 'public')
  const privateFacts = facts.filter(f => f.visibility === 'private')
  const secretFacts = facts.filter(f => f.visibility === 'secret')

  // Unused ref (kept for potential future use)
  void freshnessRef

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold text-gray-100">設定</h1>

      {/* ── Global Section ── */}
      <section data-testid={TESTIDS.GLOBAL_SECTION} aria-label="全域設定" className="space-y-0">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">全域設定</h2>
        {settingsLoading ? (
          <div className="rounded-md border border-gray-700 bg-gray-900 p-4 space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-8 bg-gray-800 rounded animate-pulse" />
            ))}
          </div>
        ) : settingsError ? (
          <div className="rounded-md border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-300">
            載入全域設定失敗
          </div>
        ) : (
          <div className="rounded-md border border-gray-700 bg-gray-900 divide-y divide-gray-700">
            {/* Auto mode */}
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-200">Auto 模式</p>
                <p className="text-xs text-gray-500 mt-0.5">讓 AI 自動送出所有訊息，不需逐筆審核</p>
              </div>
              <Toggle
                checked={settings?.auto_mode ?? false}
                onChange={(val) => void handleAutoModeToggle(val)}
                ariaLabel="全域 Auto 模式"
                testId={TESTIDS.AUTO_MODE_TOGGLE}
              />
            </div>

            {/* Freshness window */}
            <div className="flex items-start justify-between px-4 py-3">
              <div>
                <label htmlFor="freshness-window" className="text-sm font-medium text-gray-200">
                  訊息新鮮度
                </label>
                <p className="text-xs text-gray-500 mt-0.5">此時間內的訊息才會觸發草稿（1 ~ 1440 分鐘）</p>
                {freshnessError && (
                  <p className="text-xs text-red-400 mt-0.5" data-testid={TESTIDS.FRESHNESS_ERROR}>{freshnessError}</p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <input
                  id="freshness-window"
                  type="number"
                  min={1}
                  max={1440}
                  value={freshnessValue}
                  data-testid={TESTIDS.FRESHNESS_INPUT}
                  onChange={(e) => {
                    setFreshnessValue(e.target.value === '' ? '' : Number(e.target.value))
                    setFreshnessError(null)
                  }}
                  onBlur={() => void validateAndSaveFreshness()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void validateAndSaveFreshness()
                    }
                  }}
                  className={[
                    'w-20 h-8 px-2 text-sm text-center bg-gray-800 border rounded-sm',
                    'focus:outline-none focus:border-indigo-500',
                    freshnessError ? 'border-red-500' : 'border-gray-600',
                    'text-gray-200',
                  ].join(' ')}
                />
                <span className="text-sm text-gray-500 flex-shrink-0">分鐘</span>
              </div>
            </div>

            {/* Debug mode */}
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-200">Debug 模式</p>
                <p className="text-xs text-gray-500 mt-0.5">顯示額外的除錯資訊</p>
              </div>
              <Toggle
                checked={settings?.debug_mode ?? false}
                onChange={(val) => void handleDebugToggle(val)}
                ariaLabel="Debug 模式"
                testId={TESTIDS.DEBUG_TOGGLE}
              />
            </div>
          </div>
        )}
      </section>

      {/* ── Channels Section ── */}
      <section data-testid={TESTIDS.CHANNELS_SECTION} aria-label="空間設定" className="space-y-0">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">空間設定</h2>
        {spacesLoading ? (
          <div className="space-y-3">
            {[1, 2].map(i => (
              <div key={i} className="h-48 rounded-md bg-gray-900 border border-gray-700 animate-pulse" />
            ))}
          </div>
        ) : spacesError ? (
          <div className="rounded-md border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-300">
            載入空間設定失敗
          </div>
        ) : spaces.length === 0 ? (
          <div className="rounded-md border border-gray-700 bg-gray-900 px-4 py-8 text-center text-sm text-gray-500">
            尚無已觀測到的空間
          </div>
        ) : (
          <div className="space-y-3">
            {spaces.map(space => (
              <ChannelCard
                key={space.space_key}
                space={space}
                onEnabledChange={handleEnabledChange}
                onMentionOnlyChange={handleMentionOnlyChange}
                onAutoModeOverrideChange={handleAutoModeOverrideChange}
                onBlockedKeywordsChange={handleBlockedKeywordsChange}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Profile Section ── */}
      <section data-testid={TESTIDS.PROFILE_SECTION} aria-label="個人特質" className="space-y-0">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">個人特質</h2>
          <button
            type="button"
            onClick={() => {
              const el = document.querySelector('[data-visibility="public"] button[aria-label*="新增"]') as HTMLButtonElement | null
              if (el) el.click()
            }}
            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            Add fact
          </button>
        </div>
        {profileLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 rounded-md bg-gray-900 border border-gray-700 animate-pulse" />
            ))}
          </div>
        ) : profileError ? (
          <div className="rounded-md border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-300">
            載入個人特質失敗
          </div>
        ) : (
          <div className="space-y-3">
            {(['public', 'private', 'secret'] as FactVisibility[]).map(vis => (
              <ProfileFactGroup
                key={vis}
                visibility={vis}
                facts={vis === 'public' ? publicFacts : vis === 'private' ? privateFacts : secretFacts}
                onEdit={handleProfileEdit}
                onDelete={handleProfileDelete}
                onAdd={handleProfileAdd}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
