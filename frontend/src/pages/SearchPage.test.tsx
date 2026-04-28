import { createElement, type ReactNode } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SearchPage } from './SearchPage'
import { entries } from '../api/entries'
import type { EntryListResponse } from '../types/api'

vi.mock('../api/entries', () => ({
  entries: { list: vi.fn() },
}))

vi.mock('../components/layout/PageLayout', () => ({
  PageLayout: ({ children }: { children: ReactNode }) => createElement('div', null, children),
}))

vi.mock('../components/features/EntryCard', () => ({
  EntryCard: () => createElement('div', { 'data-testid': 'entry-card' }),
}))

const mockList = vi.mocked(entries.list)

const makeResponse = (overrides: Partial<EntryListResponse> = {}): EntryListResponse => ({
  entries: [],
  total: 0,
  page: 1,
  page_size: 10,
  ...overrides,
})

const renderSearchPage = (initialPath = '/search') => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    createElement(QueryClientProvider, { client: queryClient },
      createElement(MemoryRouter, { initialEntries: [initialPath] },
        createElement(SearchPage),
      ),
    ),
  )
}

describe('SearchPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('検索フォーム送信後に page がリセットされ q=テスト, page=1 で API が呼ばれる', async () => {
    mockList.mockResolvedValue(makeResponse())
    renderSearchPage('/search?q=テスト&page=2')

    await waitFor(() => expect(mockList).toHaveBeenCalled())

    const form = screen.getByRole('button', { name: '検索する' }).closest('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(mockList).toHaveBeenCalledWith(
        expect.objectContaining({ q: 'テスト', page: 1, page_size: 10 }),
      )
    })
  })

  it('ページ変更時に検索クエリが保持される', async () => {
    mockList.mockResolvedValue(makeResponse({ total: 25, page_size: 10 }))
    renderSearchPage('/search?q=テスト')

    await screen.findByText('次へ')
    fireEvent.click(screen.getByText('次へ'))

    await waitFor(() => {
      expect(mockList).toHaveBeenCalledWith(
        expect.objectContaining({ q: 'テスト', page: 2, page_size: 10 }),
      )
    })
  })
})
