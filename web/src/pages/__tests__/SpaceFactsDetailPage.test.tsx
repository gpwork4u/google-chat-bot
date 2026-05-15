/**
 * Unit tests — SpaceFactsDetailPage (F-015-fe2, Sprint 7)
 *
 * Covers:
 *  - Shows 5 category sections
 *  - Shows empty state when no facts
 *  - Mine again calls correct API (success + 409 handling)
 *  - Add fact form submission
 *  - Edit fact inline
 *  - Delete fact with confirm dialog
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import SpaceFactsDetailPage from '../SpaceFactsDetailPage'
import { TESTIDS, LABELS } from '../../contracts'
import type { SpaceFactsResponse } from '../../types/spaceFacts'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mutateMock = vi.fn()
let swrData: SpaceFactsResponse | undefined
let swrError: Error | undefined

vi.mock('swr', () => ({
  default: (_key: unknown) => ({
    get data() { return swrData },
    get error() { return swrError },
    isLoading: false,
    mutate: mutateMock,
  }),
}))

const apiMock = vi.fn()
vi.mock('../../api/client', () => ({
  fetcher: vi.fn(),
  api: (...args: unknown[]) => apiMock(...args),
}))

const showToastMock = vi.fn()
vi.mock('../../components/Toast', () => ({
  useToast: () => ({ showToast: showToastMock }),
}))

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeFact(id: number, category: string, content = `fact ${id}`) {
  return {
    id,
    space_key: 'spaces/AAA',
    category,
    content,
    visibility: 'private' as const,
    status: 'approved' as const,
    source_message_ids: [],
    note: '',
    created_by: 'manual',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    approved_at: new Date().toISOString(),
  }
}

function renderPage(spaceKey = 'spaces/AAA') {
  const encoded = encodeURIComponent(spaceKey)
  return render(
    <MemoryRouter initialEntries={[`/space-facts/${encoded}`]}>
      <Routes>
        <Route path="/space-facts/*" element={<SpaceFactsDetailPage />} />
        <Route path="/settings" element={<div>Settings</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SpaceFactsDetailPage — sections', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    swrError = undefined
    swrData = {
      facts: [
        makeFact(1, 'product'),
        makeFact(2, 'my-role'),
        makeFact(3, 'glossary'),
        makeFact(4, 'pinned-decision'),
        makeFact(5, 'relation'),
      ],
    }
  })

  it('renders detail page with correct testid', () => {
    renderPage()
    expect(screen.getByTestId(TESTIDS.SPACE_FACTS_DETAIL_PAGE)).toBeInTheDocument()
  })

  it('shows all 5 category sections', () => {
    renderPage()
    expect(screen.getByTestId(TESTIDS.SPACE_FACTS_SECTION_PRODUCT)).toBeInTheDocument()
    expect(screen.getByTestId(TESTIDS.SPACE_FACTS_SECTION_MY_ROLE)).toBeInTheDocument()
    expect(screen.getByTestId(TESTIDS.SPACE_FACTS_SECTION_GLOSSARY)).toBeInTheDocument()
    expect(screen.getByTestId(TESTIDS.SPACE_FACTS_SECTION_PINNED_DECISION)).toBeInTheDocument()
    expect(screen.getByTestId(TESTIDS.SPACE_FACTS_SECTION_RELATION)).toBeInTheDocument()
  })

  it('each section has a space-facts-row', () => {
    renderPage()
    const rows = screen.getAllByTestId(TESTIDS.SPACE_FACTS_ROW)
    expect(rows).toHaveLength(5)
  })

  it('shows empty-state when no facts', () => {
    swrData = { facts: [] }
    renderPage()
    expect(screen.getByTestId(TESTIDS.SPACE_FACTS_EMPTY_STATE)).toBeInTheDocument()
  })
})

describe('SpaceFactsDetailPage — mine again', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    swrError = undefined
    swrData = { facts: [] }
    mutateMock.mockResolvedValue(undefined)
  })

  it('mine again button calls POST mining-queue', async () => {
    apiMock.mockResolvedValue({ space_key: 'spaces/AAA', status: 'pending' })
    renderPage()

    fireEvent.click(screen.getByTestId(TESTIDS.SPACE_FACTS_MINE_AGAIN_BTN))

    await waitFor(() => {
      expect(apiMock).toHaveBeenCalledWith(
        '/api/space-facts/mining-queue',
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  it('successful mine again shows MINING_ENQUEUED toast', async () => {
    apiMock.mockResolvedValue({ space_key: 'spaces/AAA', status: 'pending' })
    renderPage()

    fireEvent.click(screen.getByTestId(TESTIDS.SPACE_FACTS_MINE_AGAIN_BTN))

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith('已加入 mining queue', 'success')
    })
  })

  it('409 JOB_RUNNING shows MINING_ALREADY_RUNNING toast', async () => {
    apiMock.mockRejectedValue({ status: 409, message: 'JOB_RUNNING' })
    renderPage()

    fireEvent.click(screen.getByTestId(TESTIDS.SPACE_FACTS_MINE_AGAIN_BTN))

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith('Mining 已在進行中', 'info')
    })
  })
})

describe('SpaceFactsDetailPage — add fact', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    swrError = undefined
    swrData = { facts: [] }
    mutateMock.mockResolvedValue(undefined)
  })

  it('clicking add-btn shows the add form', () => {
    renderPage()
    fireEvent.click(screen.getByTestId(TESTIDS.SPACE_FACTS_ADD_BTN))
    // The form should appear with a textarea
    const textareas = document.querySelectorAll('textarea')
    expect(textareas.length).toBeGreaterThan(0)
  })

  it('submitting add form calls POST /api/space-facts', async () => {
    apiMock.mockResolvedValue({ id: 99, space_key: 'spaces/AAA', status: 'approved' })
    renderPage()

    fireEvent.click(screen.getByTestId(TESTIDS.SPACE_FACTS_ADD_BTN))
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: '手動新增內容' } })

    // Click the save button (last button rendered in the add form area)
    const saveBtn = screen.getByText('儲存')
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(apiMock).toHaveBeenCalledWith(
        '/api/space-facts',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('手動新增內容'),
        }),
      )
    })
  })

  it('successful add shows FACT_CREATED toast', async () => {
    apiMock.mockResolvedValue({ id: 99, space_key: 'spaces/AAA', status: 'approved' })
    renderPage()

    fireEvent.click(screen.getByTestId(TESTIDS.SPACE_FACTS_ADD_BTN))
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: '手動新增內容' } })
    fireEvent.click(screen.getByText('儲存'))

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith('Fact 已新增', 'success')
    })
  })
})

describe('SpaceFactsDetailPage — edit fact', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    swrError = undefined
    swrData = {
      facts: [makeFact(20, 'product', '舊內容')],
    }
    mutateMock.mockResolvedValue(undefined)
  })

  it('edit button switches row to edit mode', () => {
    renderPage()
    // Click the edit button
    fireEvent.click(screen.getByText(LABELS.BUTTON_EDIT))
    // Textarea should appear
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement
    expect(textarea).toBeTruthy()
    expect(textarea.value).toBe('舊內容')
  })

  it('save calls PATCH and shows FACT_EDITED toast', async () => {
    apiMock.mockResolvedValue({ id: 20, content: '新內容', space_key: 'spaces/AAA', status: 'approved', category: 'product', visibility: 'private', source_message_ids: [], note: '', created_by: 'manual', created_at: '', updated_at: '', approved_at: null })
    renderPage()

    fireEvent.click(screen.getByText(LABELS.BUTTON_EDIT))
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: '新內容' } })
    fireEvent.click(screen.getByText(LABELS.BUTTON_SAVE))

    await waitFor(() => {
      expect(apiMock).toHaveBeenCalledWith(
        '/api/space-facts/20',
        expect.objectContaining({ method: 'PATCH' }),
      )
      expect(showToastMock).toHaveBeenCalledWith('Fact 已編輯', 'success')
    })
  })
})

describe('SpaceFactsDetailPage — delete fact', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    swrError = undefined
    swrData = {
      facts: [makeFact(21, 'product')],
    }
    mutateMock.mockResolvedValue(undefined)
  })

  it('delete button shows confirm dialog', () => {
    renderPage()
    fireEvent.click(screen.getByText(LABELS.BUTTON_DELETE))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('確定刪除此 fact？')).toBeInTheDocument()
  })

  it('confirming delete calls DELETE and shows FACT_DELETED toast', async () => {
    apiMock.mockResolvedValue({ ok: true })
    renderPage()

    fireEvent.click(screen.getByText(LABELS.BUTTON_DELETE))
    fireEvent.click(screen.getByText(LABELS.BUTTON_CONFIRM))

    await waitFor(() => {
      expect(apiMock).toHaveBeenCalledWith(
        '/api/space-facts/21',
        expect.objectContaining({ method: 'DELETE' }),
      )
      expect(showToastMock).toHaveBeenCalledWith('Fact 已刪除', 'success')
    })
  })

  it('cancelling delete does not call DELETE', () => {
    renderPage()
    fireEvent.click(screen.getByText(LABELS.BUTTON_DELETE))
    fireEvent.click(screen.getByText(LABELS.BUTTON_CANCEL))
    expect(apiMock).not.toHaveBeenCalled()
  })
})
