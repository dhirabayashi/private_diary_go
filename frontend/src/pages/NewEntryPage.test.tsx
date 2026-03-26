import { createElement, forwardRef, type ReactNode } from 'react'
import { render, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NewEntryPage } from './NewEntryPage'
import { entries } from '../api/entries'
import type { Entry } from '../types/api'

vi.mock('../api/entries', () => ({
  entries: {
    getByDate: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../components/ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

// onDateChange を各テストから呼び出せるようにキャプチャする
let capturedOnDateChange: ((date: string) => void) | undefined

vi.mock('../components/features/EntryForm', () => ({
  EntryForm: forwardRef(({ onDateChange }: { onDateChange?: (date: string) => void }, _ref) => {
    capturedOnDateChange = onDateChange
    return null
  }),
}))

vi.mock('../components/layout/PageLayout', () => ({
  PageLayout: ({ children }: { children: ReactNode }) => createElement('div', null, children),
}))

const mockGetByDate = vi.mocked(entries.getByDate)

const makeEntry = (overrides: Partial<Entry> = {}): Entry => ({
  id: 1,
  entry_date: '2026-03-19',
  body: 'テスト',
  created_at: '2026-03-19T00:00:00Z',
  updated_at: '2026-03-19T00:00:00Z',
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

describe('NewEntryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedOnDateChange = undefined
  })

  it('選択日付に既存の日記がある場合、編集画面にリダイレクトする', async () => {
    const entry = makeEntry()
    mockGetByDate.mockResolvedValue(entry)

    render(createElement(NewEntryPage), { wrapper: createWrapper() })

    await vi.waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(`/${entry.entry_date}/edit`, { replace: true })
    })
  })

  it('選択日付に日記がない場合、リダイレクトしない', async () => {
    mockGetByDate.mockRejectedValue(new Error('NOT_FOUND'))

    render(createElement(NewEntryPage), { wrapper: createWrapper() })

    await vi.waitFor(() => {
      expect(mockGetByDate).toHaveBeenCalled()
    })

    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('日付を変更したとき既存エントリがあれば編集画面にリダイレクトする', async () => {
    // 初期日付（今日）には日記がない
    mockGetByDate.mockRejectedValueOnce(new Error('NOT_FOUND'))
    // 変更後の日付には日記がある
    const entry = makeEntry({ entry_date: '2026-01-01' })
    mockGetByDate.mockResolvedValue(entry)

    render(createElement(NewEntryPage), { wrapper: createWrapper() })

    // 初期クエリが完了するまで待つ
    await vi.waitFor(() => {
      expect(mockGetByDate).toHaveBeenCalled()
    })

    // 日付変更をシミュレート
    act(() => {
      capturedOnDateChange?.('2026-01-01')
    })

    await vi.waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/2026-01-01/edit', { replace: true })
    })
  })
})
