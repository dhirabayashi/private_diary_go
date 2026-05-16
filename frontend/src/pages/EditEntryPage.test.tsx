import { createElement, forwardRef, type ReactNode } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EditEntryPage } from './EditEntryPage'
import type { Entry } from '../types/api'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ date: '2026-01-01' }),
  }
})

vi.mock('../hooks/useEntries', () => ({
  useEntry: vi.fn(() => ({ data: makeEntry(), isLoading: false })),
  useUpdateEntry: vi.fn(() => ({ mutateAsync: vi.fn() })),
}))

vi.mock('../components/ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

vi.mock('../components/layout/PageLayout', () => ({
  PageLayout: ({ children }: { children: ReactNode }) => createElement('div', null, children),
}))

vi.mock('../components/features/EntryForm', () => ({
  EntryForm: forwardRef(() => null),
}))

const makeEntry = (overrides: Partial<Entry> = {}): Entry => ({
  id: 1,
  entry_date: '2026-01-01',
  body: 'テスト本文',
  images: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
})

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) =>
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(MemoryRouter, null, children),
    )
}

describe('EditEntryPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('「← 戻る」ボタンが表示される', () => {
    render(createElement(EditEntryPage), { wrapper: createWrapper() })
    expect(screen.getByRole('button', { name: /戻る/ })).toBeInTheDocument()
  })

  it('「← 戻る」クリックで navigate(-1) が呼ばれる', () => {
    render(createElement(EditEntryPage), { wrapper: createWrapper() })
    fireEvent.click(screen.getByRole('button', { name: /戻る/ }))
    expect(mockNavigate).toHaveBeenCalledWith(-1)
  })
})
