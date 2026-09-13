import { createElement, forwardRef, useImperativeHandle, type ReactNode } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EditEntryPage } from './EditEntryPage'
import type { Entry } from '../types/api'

const mockNavigate = vi.fn()

const { mockShowToast, mockSave } = vi.hoisted(() => ({
  mockShowToast: vi.fn(),
  mockSave: vi.fn().mockResolvedValue(undefined),
}))

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
}))

vi.mock('../components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}))

vi.mock('../components/layout/PageLayout', () => ({
  PageLayout: ({ children }: { children: ReactNode }) => createElement('div', null, children),
}))

vi.mock('../components/features/EntryForm', () => ({
  EntryForm: forwardRef((props: { onSubmit: () => Promise<void> }, ref) => {
    useImperativeHandle(ref, () => ({
      save: mockSave,
      getCreatedDate: () => null,
      isAutoCreated: () => false,
    }))
    return createElement('button', { onClick: () => props.onSubmit() }, '更新する')
  }),
}))

const makeEntry = (overrides: Partial<Entry> = {}): Entry => ({
  id: 1,
  entry_date: '2026-01-01',
  version: 1,
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
  beforeEach(() => {
    vi.clearAllMocks()
    mockSave.mockReset().mockResolvedValue(undefined)
  })

  it('「← 戻る」ボタンが表示される', () => {
    render(createElement(EditEntryPage), { wrapper: createWrapper() })
    expect(screen.getByRole('button', { name: /戻る/ })).toBeInTheDocument()
  })

  it('「← 戻る」クリックで navigate(-1) が呼ばれる', () => {
    render(createElement(EditEntryPage), { wrapper: createWrapper() })
    fireEvent.click(screen.getByRole('button', { name: /戻る/ }))
    expect(mockNavigate).toHaveBeenCalledWith(-1)
  })

  it('save()が通常のエラーで失敗した場合はエラーメッセージのトーストを表示する', async () => {
    mockSave.mockRejectedValueOnce(new Error('network error'))
    render(createElement(EditEntryPage), { wrapper: createWrapper() })

    fireEvent.click(screen.getByRole('button', { name: '更新する' }))

    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('network error', 'error'))
  })

  it('save()が成功したら更新完了のトーストを表示しdate画面へnavigateする', async () => {
    render(createElement(EditEntryPage), { wrapper: createWrapper() })

    fireEvent.click(screen.getByRole('button', { name: '更新する' }))

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/2026-01-01'))
    expect(mockShowToast).toHaveBeenCalledWith('日記を更新しました')
  })
})
