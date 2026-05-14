/**
 * SkipReasonMenu — popover for selecting a manual skip reason.
 * Appears when user clicks the Skip button on a pending message row.
 *
 * F-013: /pending page skip flow.
 */
import { useEffect, useRef } from 'react'
import { TESTIDS, MANUAL_SKIP_REASONS, type ManualSkipReason } from '../contracts'

const REASON_LABELS: Record<ManualSkipReason, string> = {
  'pure-ack': '純確認訊息 (pure-ack)',
  'overheard': '旁聽對話 (overheard)',
  'policy-redline': '政策紅線 (policy-redline)',
  'not-targeted': '非針對我 (not-targeted)',
  'low-info': '資訊不足 (low-info)',
  'manual-other': '其他 (manual-other)',
}

interface SkipReasonMenuProps {
  onSelect: (reason: ManualSkipReason) => void
  onClose: () => void
}

export default function SkipReasonMenu({ onSelect, onClose }: SkipReasonMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on click-outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const reasons = Object.values(MANUAL_SKIP_REASONS) as ManualSkipReason[]

  return (
    <div
      ref={menuRef}
      data-testid={TESTIDS.PENDING_SKIP_REASON_MENU}
      role="menu"
      aria-label="選擇 skip 原因"
      className="absolute z-50 right-0 mt-1 w-64 rounded-md border border-gray-700 bg-gray-900 shadow-lg"
    >
      <div className="py-1">
        {reasons.map(reason => (
          <button
            key={reason}
            type="button"
            role="menuitem"
            data-testid={TESTIDS.PENDING_SKIP_REASON_OPTION}
            data-reason={reason}
            onClick={() => onSelect(reason)}
            className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-800 hover:text-white transition-colors"
          >
            {REASON_LABELS[reason]}
          </button>
        ))}
      </div>
    </div>
  )
}
