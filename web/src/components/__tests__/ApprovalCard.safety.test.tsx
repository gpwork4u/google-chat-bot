/**
 * Unit tests — ApprovalCard safety badge (F-008, Sprint 4)
 *
 * Verifies:
 *  - 有 safety_flags → safety-badge 出現，且 data-flags 正確
 *  - 空陣列 → safety-badge 不存在
 *  - safety_trigger_reason 出現在 safety-reason span
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ApprovalCard from '../ApprovalCard'
import { TESTIDS, LABELS } from '../../contracts'
import type { Draft } from '../../types/draft'

// ── 最小 Draft fixture ─────────────────────────────────────────────────────────

function makeDraft(overrides: Partial<Draft> = {}): Draft {
  return {
    id: 1,
    space_id: 'spaces/AAA',
    space_name: 'Test Space',
    sender_id: 'users/001',
    sender_name: 'Alice',
    original_message: '請報價',
    context_messages: [],
    draft_content: '好的，這個案子 NT$50000',
    category: 'work-coordination',
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

// ApprovalCard 最小 props（不含 safety）
const baseProps = {
  isFocused: false,
  status: 'pending' as const,
  editedContent: '好的，這個案子 NT$50000',
  onContentChange: vi.fn(),
  onApprove: vi.fn(),
  onReject: vi.fn(),
  onSave: vi.fn(),
  onRetry: vi.fn(),
}

describe('ApprovalCard — safety badge (F-008)', () => {
  it('有 safety_flags=["money"] 時顯示 safety-badge，data-flags="money"', () => {
    const draft = makeDraft({
      safety_flags: ['money'],
      safety_trigger_reason: 'draft 含明確匯款承諾與金額',
    })

    render(<ApprovalCard draft={draft} {...baseProps} />)

    const badge = screen.getByTestId(TESTIDS.SAFETY_BADGE)
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveAttribute('data-flags', 'money')
    expect(badge).toHaveTextContent(LABELS.SAFETY_FLAG_MONEY)
  })

  it('safety_trigger_reason 出現在 safety-reason span（screen reader / tooltip）', () => {
    const reason = 'draft 含明確匯款承諾與金額'
    const draft = makeDraft({
      safety_flags: ['money'],
      safety_trigger_reason: reason,
    })

    render(<ApprovalCard draft={draft} {...baseProps} />)

    const reasonEl = screen.getByTestId(TESTIDS.SAFETY_REASON)
    expect(reasonEl).toBeInTheDocument()
    expect(reasonEl).toHaveTextContent(reason)
  })

  it('safety_flags=[] 時不顯示 safety-badge', () => {
    const draft = makeDraft({ safety_flags: [] })

    render(<ApprovalCard draft={draft} {...baseProps} />)

    expect(screen.queryByTestId(TESTIDS.SAFETY_BADGE)).not.toBeInTheDocument()
  })

  it('safety_flags 未定義時不顯示 safety-badge', () => {
    const draft = makeDraft()
    // safety_flags intentionally absent

    render(<ApprovalCard draft={draft} {...baseProps} />)

    expect(screen.queryByTestId(TESTIDS.SAFETY_BADGE)).not.toBeInTheDocument()
  })

  it('多個 flags 時 data-flags 用逗號串接', () => {
    const draft = makeDraft({
      safety_flags: ['money', 'future_flag'],
    })

    render(<ApprovalCard draft={draft} {...baseProps} />)

    const badge = screen.getByTestId(TESTIDS.SAFETY_BADGE)
    expect(badge).toHaveAttribute('data-flags', 'money,future_flag')
  })
})
