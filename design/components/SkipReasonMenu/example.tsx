// SkipReasonMenu — 使用範例

const SKIP_REASONS: { value: SkipReason; label: string }[] = [
  { value: 'pure-ack',        label: '單純回應' },
  { value: 'overheard',       label: '無關對話' },
  { value: 'policy-redline',  label: '政策紅線' },
  { value: 'not-targeted',    label: '不相關（非對象）' },
  { value: 'low-info',        label: '資訊不足' },
  { value: 'manual-other',    label: '手動其他' },
];

// ── Popover markup ──
{isOpen && (
  <div
    role="dialog"
    aria-modal="true"
    aria-labelledby="skip-reason-title"
    aria-label="選擇略過原因"
    data-testid="pending-skip-reason-menu"
    className="absolute z-[--z-dropdown] w-72 bg-[--color-surface-default] border border-[--color-border-default] rounded-lg shadow-[--shadow-elevated] p-4 animate-[--animate-slide-up]"
  >
    {/* 標題列 */}
    <div className="flex items-center justify-between mb-3">
      <h2 id="skip-reason-title" className="text-sm font-semibold text-[--color-text-default]">
        略過原因
      </h2>
      <button
        type="button"
        aria-label="關閉選單"
        onClick={onClose}
        className="p-1 rounded-sm text-[--color-text-muted] hover:bg-[--color-surface-subtle] focus:outline-none focus:ring-1 focus:ring-[--color-border-focus]"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>

    {/* 選項清單 */}
    <div className="flex flex-col gap-0.5 mb-4" role="listbox" aria-label="略過原因選項">
      {SKIP_REASONS.map(({ value, label }) => {
        const isSelected = selectedReason === value;
        return (
          <button
            key={value}
            role="option"
            aria-pressed={isSelected}
            data-testid="pending-skip-reason-option"
            data-reason={value}
            disabled={isConfirming}
            onClick={() => setSelectedReason(value)}
            className={
              isSelected
                ? "w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-[--color-primary-600] rounded-md bg-[--color-primary-50] focus:outline-none"
                : "w-full flex items-center gap-3 px-3 py-2 text-sm text-[--color-text-default] rounded-md hover:bg-[--color-surface-subtle] focus:outline-none focus:bg-[--color-surface-subtle] transition-colors duration-150 disabled:opacity-50"
            }
          >
            {/* 自訂 radio 圓圈 */}
            <span
              className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                isSelected
                  ? 'border-[--color-primary-500] bg-[--color-primary-500]'
                  : 'border-[--color-border-strong]'
              }`}
              aria-hidden="true"
            >
              {isSelected && (
                <span className="w-1.5 h-1.5 rounded-full bg-white" />
              )}
            </span>
            {label}
          </button>
        );
      })}
    </div>

    {/* 操作按鈕 */}
    <div className="flex gap-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={onClose}
        disabled={isConfirming}
        className="flex-1"
      >
        取消
      </Button>
      <Button
        variant="primary"
        size="sm"
        loading={isConfirming}
        disabled={!selectedReason || isConfirming}
        onClick={handleConfirm}
        className="flex-1"
        aria-label={selectedReason ? `確認略過，原因：${selectedReason}` : '請先選擇略過原因'}
      >
        確認 Skip
      </Button>
    </div>
  </div>
)}
