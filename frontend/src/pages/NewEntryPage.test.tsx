import { createElement, forwardRef, useImperativeHandle, type ReactNode } from 'react'
import { render, act, screen, fireEvent, waitFor } from '@testing-library/react'
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

const { mockShowToast, mockSave, mockGetCreatedDate } = vi.hoisted(() => ({
  mockShowToast: vi.fn(),
  mockSave: vi.fn().mockResolvedValue(undefined),
  mockGetCreatedDate: vi.fn(() => '2026-03-19'),
}))

vi.mock('../components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}))

// onDateChange を各テストから呼び出せるようにキャプチャする
let capturedOnDateChange: ((date: string) => void) | undefined

vi.mock('../components/features/EntryForm', () => ({
  EntryForm: forwardRef(
    (
      { onDateChange, onSubmit }: { onDateChange?: (date: string) => void; onSubmit: () => Promise<void> },
      ref,
    ) => {
      capturedOnDateChange = onDateChange
      useImperativeHandle(ref, () => ({
        save: mockSave,
        getCreatedDate: mockGetCreatedDate,
        isAutoCreated: () => false,
      }))
      return createElement('button', { onClick: () => onSubmit() }, '投稿する')
    },
  ),
}))

vi.mock('../components/layout/PageLayout', () => ({
  PageLayout: ({ children }: { children: ReactNode }) => createElement('div', null, children),
}))

const mockGetByDate = vi.mocked(entries.getByDate)

const makeEntry = (overrides: Partial<Entry> = {}): Entry => ({
  id: 1,
  entry_date: '2026-03-19',
  version: 1,
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
    mockSave.mockReset().mockResolvedValue(undefined)
    mockGetCreatedDate.mockReset().mockReturnValue('2026-03-19')
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

  it('save()が通常のエラーで失敗した場合はエラーメッセージのトーストを表示する', async () => {
    mockGetByDate.mockRejectedValue(new Error('NOT_FOUND'))
    mockSave.mockRejectedValueOnce(new Error('network error'))

    render(createElement(NewEntryPage), { wrapper: createWrapper() })
    fireEvent.click(screen.getByRole('button', { name: '投稿する' }))

    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('network error', 'error'))
  })

  it('save()が成功したら投稿完了のトーストを表示しgetCreatedDate()の日付へnavigateする', async () => {
    mockGetByDate.mockRejectedValue(new Error('NOT_FOUND'))

    render(createElement(NewEntryPage), { wrapper: createWrapper() })
    fireEvent.click(screen.getByRole('button', { name: '投稿する' }))

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/2026-03-19'))
    expect(mockShowToast).toHaveBeenCalledWith('日記を投稿しました')
  })
})
