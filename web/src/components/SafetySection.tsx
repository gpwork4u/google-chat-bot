/**
 * SafetySection — 安全護欄全域設定區塊（F-008 Sprint 4）
 *
 * 放在 SettingsPage 的全域設定下方。
 * 包含：
 *   - 「啟用安全護欄」總開關（safety_rails_enabled）
 *   - Sub-toggle「金錢偵測」（safety_rules.money），總開關 OFF 時 aria-disabled + grey out
 */
import { useCallback } from 'react'
import { api } from '../api/client'
import { useSafetyRules } from '../hooks/useSafetyRules'
import { useToast } from './Toast'
import { TESTIDS, LABELS, TOAST, API_PATHS } from '../contracts'

// ─── Toggle (same visual pattern as SettingsPage) ─────────────────────────────

interface ToggleProps {
  checked: boolean
  onChange: (val: boolean) => void
  ariaLabel: string
  disabled?: boolean
  ariaDisabled?: boolean
  testId: string
}

function Toggle({ checked, onChange, ariaLabel, disabled, ariaDisabled, testId }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-disabled={ariaDisabled ? 'true' : undefined}
      disabled={disabled}
      data-testid={testId}
      onClick={() => !disabled && !ariaDisabled && onChange(!checked)}
      className={[
        'relative inline-flex items-center justify-center',
        'w-11 h-11 -mr-1.5 rounded-sm',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
        disabled || ariaDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
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

// ─── SafetySection ────────────────────────────────────────────────────────────

export default function SafetySection() {
  const { safetyRules, mutate } = useSafetyRules()
  const { showToast } = useToast()

  const patchSafetyRules = useCallback(
    async (body: Partial<{ enabled: boolean; rules: { money: boolean } }>) => {
      // Optimistic update
      await mutate(prev => prev ? { ...prev, ...body, rules: { ...prev.rules, ...(body.rules ?? {}) } } : prev, false)
      try {
        const updated = await api<{ enabled: boolean; rules: { money: boolean } }>(
          API_PATHS.SAFETY_RULES,
          {
            method: 'PATCH',
            body: JSON.stringify(body),
          },
        )
        await mutate(updated, false)
        showToast(TOAST.SETTINGS_SAVED, 'success')
      } catch {
        showToast(TOAST.SETTINGS_SAVE_FAILED, 'error')
        await mutate()
      }
    },
    [mutate, showToast],
  )

  const handleEnabledToggle = useCallback(
    (val: boolean) => {
      void patchSafetyRules({ enabled: val })
    },
    [patchSafetyRules],
  )

  const handleMoneyToggle = useCallback(
    (val: boolean) => {
      void patchSafetyRules({ rules: { money: val } })
    },
    [patchSafetyRules],
  )

  const safetyEnabled = safetyRules?.enabled ?? true
  const moneyEnabled = safetyRules?.rules.money ?? true

  return (
    <section
      data-testid={TESTIDS.SAFETY_SECTION}
      aria-label={LABELS.SAFETY_SECTION_TITLE}
    >
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
        {LABELS.SAFETY_SECTION_TITLE}
      </h2>

      <div className="rounded-md border border-gray-700 bg-gray-900 divide-y divide-gray-700">
        {/* 啟用安全護欄 toggle */}
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-sm font-medium text-gray-200">{LABELS.SAFETY_ENABLED_LABEL}</p>
            <p className="text-xs text-gray-500 mt-0.5">{LABELS.SAFETY_ENABLED_HINT}</p>
          </div>
          <Toggle
            checked={safetyEnabled}
            onChange={handleEnabledToggle}
            ariaLabel={LABELS.SAFETY_ENABLED_LABEL}
            testId={TESTIDS.SAFETY_ENABLED_TOGGLE}
          />
        </div>

        {/* 金錢偵測 sub-toggle */}
        <div
          className={[
            'flex items-center justify-between px-4 py-3 pl-8',
            !safetyEnabled ? 'opacity-50' : '',
          ].join(' ')}
        >
          <div>
            <p className={`text-sm font-medium ${safetyEnabled ? 'text-gray-200' : 'text-gray-500'}`}>
              {LABELS.SAFETY_RULE_MONEY_LABEL}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{LABELS.SAFETY_RULE_MONEY_HINT}</p>
          </div>
          <Toggle
            checked={moneyEnabled}
            onChange={handleMoneyToggle}
            ariaLabel={LABELS.SAFETY_RULE_MONEY_LABEL}
            ariaDisabled={!safetyEnabled}
            testId={TESTIDS.SAFETY_RULE_MONEY_TOGGLE}
          />
        </div>
      </div>
    </section>
  )
}
