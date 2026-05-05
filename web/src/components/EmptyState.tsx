import { CheckCheck } from 'lucide-react'
import { TESTIDS } from '../contracts'

export default function EmptyState() {
  return (
    <div
      data-testid={TESTIDS.EMPTY_STATE}
      aria-label="沒有待處理的草稿"
      className="flex flex-col items-center justify-center py-20 text-center"
    >
      <CheckCheck
        size={40}
        className="text-[--color-neutral-300] mb-4"
        aria-hidden="true"
      />
      <p className="text-base font-medium text-[--color-text-muted] mb-1">
        Inbox zero
      </p>
      <p className="text-sm text-[--color-text-muted]">
        沒有待處理的草稿
      </p>
    </div>
  )
}
