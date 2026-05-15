/**
 * Unit tests — CandidateFactRow (F-015, Sprint 7)
 *
 * Covers:
 *  - View mode renders content, category badge, visibility select, action buttons
 *  - Edit mode: clicking edit btn shows textarea/save/cancel
 *  - Cancel restores original content
 *  - Approve triggers callback
 *  - Reject shows confirm dialog then triggers callback
 *  - Visibility change triggers patch immediately (view mode)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import CandidateFactRow from '../CandidateFactRow'
import { TESTIDS, LABELS } from '../../contracts'
import type { SpaceFact } from '../../types/spaceFacts'

function makeFact(overrides: Partial<SpaceFact> = {}): SpaceFact {
  return {
    id: 1,
    space_key: 'spaces/AAA',
    category: 'product',
    content: '原始內容',
    visibility: 'private',
    status: 'candidate',
    source_message_ids: [],
    note: '',
    created_by: 'mining-skill',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    approved_at: null,
    ...overrides,
  }
}

const noop = vi.fn().mockResolvedValue(undefined)
const noopPatch = vi.fn().mockResolvedValue({} as SpaceFact)

function defaultProps(fact: SpaceFact = makeFact()) {
  return {
    fact,
    onApprove: noop,
    onReject: noop,
    onPatch: noopPatch,
    onApproveError: noop,
    onRejectError: noop,
    onPatchSuccess: noop,
    onPatchError: noop,
  }
}

describe('CandidateFactRow — view mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders with correct testid and data-fact-id', () => {
    const fact = makeFact({ id: 42 })
    render(<CandidateFactRow {...defaultProps(fact)} />)
    const row = screen.getByTestId(TESTIDS.CANDIDATE_FACT_ROW)
    expect(row).toBeInTheDocument()
    expect(row).toHaveAttribute('data-fact-id', '42')
  })

  it('shows content in view mode', () => {
    const fact = makeFact({ content: '產品說明文字' })
    render(<CandidateFactRow {...defaultProps(fact)} />)
    const content = screen.getByTestId(TESTIDS.CANDIDATE_FACT_CONTENT)
    expect(content).toHaveTextContent('產品說明文字')
  })

  it('shows category badge', () => {
    const fact = makeFact({ category: 'glossary' })
    render(<CandidateFactRow {...defaultProps(fact)} />)
    const badge = screen.getByTestId(TESTIDS.CANDIDATE_FACT_CATEGORY)
    expect(badge).toHaveTextContent(LABELS.CATEGORY_GLOSSARY)
  })

  it('shows approve, edit, reject buttons', () => {
    render(<CandidateFactRow {...defaultProps()} />)
    expect(screen.getByTestId(TESTIDS.CANDIDATE_FACT_APPROVE_BTN)).toBeInTheDocument()
    expect(screen.getByTestId(TESTIDS.CANDIDATE_FACT_EDIT_BTN)).toBeInTheDocument()
    expect(screen.getByTestId(TESTIDS.CANDIDATE_FACT_REJECT_BTN)).toBeInTheDocument()
  })

  it('calls onApprove when approve button is clicked', async () => {
    const onApprove = vi.fn().mockResolvedValue(undefined)
    const fact = makeFact({ id: 10 })
    render(<CandidateFactRow {...defaultProps(fact)} onApprove={onApprove} />)
    fireEvent.click(screen.getByTestId(TESTIDS.CANDIDATE_FACT_APPROVE_BTN))
    await waitFor(() => expect(onApprove).toHaveBeenCalledWith(10))
  })
})

describe('CandidateFactRow — edit mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('clicking edit btn switches to edit mode with textarea', () => {
    render(<CandidateFactRow {...defaultProps()} />)
    fireEvent.click(screen.getByTestId(TESTIDS.CANDIDATE_FACT_EDIT_BTN))
    const content = screen.getByTestId(TESTIDS.CANDIDATE_FACT_CONTENT)
    expect(content.tagName).toBe('TEXTAREA')
    expect(screen.getByTestId(TESTIDS.CANDIDATE_FACT_SAVE_BTN)).toBeInTheDocument()
    expect(screen.getByTestId(TESTIDS.CANDIDATE_FACT_CANCEL_BTN)).toBeInTheDocument()
  })

  it('cancel restores original content and goes back to view', () => {
    const fact = makeFact({ content: '原內容' })
    render(<CandidateFactRow {...defaultProps(fact)} />)

    fireEvent.click(screen.getByTestId(TESTIDS.CANDIDATE_FACT_EDIT_BTN))
    const textarea = screen.getByTestId(TESTIDS.CANDIDATE_FACT_CONTENT) as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: '改過了' } })

    fireEvent.click(screen.getByTestId(TESTIDS.CANDIDATE_FACT_CANCEL_BTN))

    // Should be back in view mode showing original content
    const content = screen.getByTestId(TESTIDS.CANDIDATE_FACT_CONTENT)
    expect(content.tagName).not.toBe('TEXTAREA')
    expect(content).toHaveTextContent('原內容')
  })

  it('save calls onPatch with new content then shows success', async () => {
    const onPatch = vi.fn().mockResolvedValue({} as SpaceFact)
    const onPatchSuccess = vi.fn()
    const fact = makeFact({ id: 12, content: '舊內容' })
    render(
      <CandidateFactRow
        {...defaultProps(fact)}
        onPatch={onPatch}
        onPatchSuccess={onPatchSuccess}
      />,
    )

    fireEvent.click(screen.getByTestId(TESTIDS.CANDIDATE_FACT_EDIT_BTN))
    const textarea = screen.getByTestId(TESTIDS.CANDIDATE_FACT_CONTENT) as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: '新內容' } })
    fireEvent.click(screen.getByTestId(TESTIDS.CANDIDATE_FACT_SAVE_BTN))

    await waitFor(() => {
      expect(onPatch).toHaveBeenCalledWith(12, expect.objectContaining({ content: '新內容' }))
      expect(onPatchSuccess).toHaveBeenCalled()
    })
  })
})

describe('CandidateFactRow — reject confirm dialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('clicking reject opens confirm dialog', () => {
    render(<CandidateFactRow {...defaultProps()} />)
    fireEvent.click(screen.getByTestId(TESTIDS.CANDIDATE_FACT_REJECT_BTN))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('確定拒絕？此操作不可復原')).toBeInTheDocument()
  })

  it('confirming dialog calls onReject', async () => {
    const onReject = vi.fn().mockResolvedValue(undefined)
    const fact = makeFact({ id: 11 })
    render(<CandidateFactRow {...defaultProps(fact)} onReject={onReject} />)

    fireEvent.click(screen.getByTestId(TESTIDS.CANDIDATE_FACT_REJECT_BTN))
    const confirmBtn = screen.getByText(LABELS.BUTTON_CONFIRM)
    fireEvent.click(confirmBtn)

    await waitFor(() => expect(onReject).toHaveBeenCalledWith(11))
  })

  it('cancelling dialog does NOT call onReject', () => {
    const onReject = vi.fn()
    render(<CandidateFactRow {...defaultProps()} onReject={onReject} />)

    fireEvent.click(screen.getByTestId(TESTIDS.CANDIDATE_FACT_REJECT_BTN))
    const cancelBtn = screen.getByText(LABELS.BUTTON_CANCEL)
    fireEvent.click(cancelBtn)

    expect(onReject).not.toHaveBeenCalled()
  })
})

describe('CandidateFactRow — visibility select', () => {
  it('changing visibility in view mode triggers onPatch immediately', async () => {
    const onPatch = vi.fn().mockResolvedValue({} as SpaceFact)
    const onPatchSuccess = vi.fn()
    const fact = makeFact({ id: 15, visibility: 'private' })
    render(
      <CandidateFactRow
        {...defaultProps(fact)}
        onPatch={onPatch}
        onPatchSuccess={onPatchSuccess}
      />,
    )

    const select = screen.getByTestId(TESTIDS.CANDIDATE_FACT_VISIBILITY_SELECT)
    fireEvent.change(select, { target: { value: 'public' } })

    await waitFor(() => {
      expect(onPatch).toHaveBeenCalledWith(15, { visibility: 'public' })
    })
  })
})
