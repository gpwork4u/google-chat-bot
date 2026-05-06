import { useState, useId } from 'react'
import { AlertTriangle } from 'lucide-react'
import { TESTIDS, LABELS } from '../contracts'

// Flag → 顯示文字對照（Sprint 4 唯一支援 money）
const FLAG_LABELS: Record<string, string> = {
  money: LABELS.SAFETY_FLAG_MONEY,
}

interface SafetyBadgeProps {
  flags: string[]
  reason?: string
  className?: string
  'data-flags'?: string
}

/**
 * SafetyBadge — 安全護欄警示 badge
 *
 * 顯示於 ApprovalCard 卡頭，當 draft.safety_flags 非空時條件渲染。
 * Sprint 4 支援唯一 flag：money（金錢偵測）。
 *
 * - 有 reason → badge 包在 <button>，hover/focus 顯示 tooltip
 * - 無 reason → 靜態 <span role="img">
 * - safety-reason tooltip 元素永遠在 DOM（利於 QA 驗證與 screen reader）
 */
export function SafetyBadge({
  flags,
  reason = '',
  className = '',
  ...rest
}: SafetyBadgeProps) {
  const [tooltipVisible, setTooltipVisible] = useState(false)
  const tooltipId = useId()

  const baseClasses = [
    'relative inline-flex items-center gap-1.5',
    'px-2 py-0.5 text-xs font-medium rounded-sm border select-none',
    'bg-[--color-safety-badge-bg]',
    'text-[--color-safety-badge-text]',
    'border-[--color-safety-badge-border]',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  // badge 內容：AlertTriangle + "⚠️ 金錢內容"（SAFETY_BADGE_MONEY）
  // 使用 SAFETY_BADGE_MONEY 作為 flag=money 的完整顯示文字
  const badgeContent = (
    <>
      <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{LABELS.SAFETY_BADGE_LABEL}</span>
      {flags.map((flag) => (
        <span
          key={flag}
          className="inline-flex items-center px-1 rounded-xs text-2xs font-medium bg-[--color-safety-badge-chip-bg]"
          aria-hidden="true"
        >
          {flag === 'money' ? LABELS.SAFETY_BADGE_MONEY : (FLAG_LABELS[flag] ?? flag)}
        </span>
      ))}
    </>
  )

  if (!reason) {
    return (
      <span
        role="img"
        aria-label={LABELS.SAFETY_BADGE_ARIA_LABEL}
        className={baseClasses}
        data-testid={TESTIDS.SAFETY_BADGE}
        {...rest}
      >
        {badgeContent}
      </span>
    )
  }

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={LABELS.SAFETY_BADGE_ARIA_LABEL}
        aria-describedby={tooltipId}
        className={[
          baseClasses,
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-[--color-border-focus]',
        ].join(' ')}
        data-testid={TESTIDS.SAFETY_BADGE}
        onMouseEnter={() => setTooltipVisible(true)}
        onMouseLeave={() => setTooltipVisible(false)}
        onFocus={() => setTooltipVisible(true)}
        onBlur={() => setTooltipVisible(false)}
        {...rest}
      >
        {badgeContent}
      </button>

      {/* Tooltip — 永遠在 DOM（QA / screen reader 可抓到），視覺上依 tooltipVisible 顯示 */}
      <span
        id={tooltipId}
        role="tooltip"
        data-testid={TESTIDS.SAFETY_REASON}
        className={[
          'absolute top-full mt-1 left-0 z-50',
          'px-2.5 py-1.5 text-xs text-neutral-50',
          'bg-neutral-900 rounded-sm shadow-md',
          'max-w-[240px] whitespace-normal pointer-events-none',
          'transition-opacity duration-150 motion-reduce:transition-none',
          tooltipVisible ? 'opacity-100' : 'opacity-0',
        ].join(' ')}
      >
        {reason}
      </span>
    </span>
  )
}

export default SafetyBadge
