import { createElement, type ReactNode } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TopPage } from './TopPage'
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

const renderTopPage = (initialPath = '/') => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    createElement(QueryClientProvider, { client: queryClient },
      createElement(MemoryRouter, { initialEntries: [initialPath] },
        createElement(TopPage),
      ),
    ),
  )
}

describe('TopPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('URL に page パラメータがない場合、page=1 で API を呼ぶ', async () => {
    mockList.mockResolvedValue(makeResponse())
    renderTopPage('/')
    await waitFor(() => {
      expect(mockList).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, page_size: 10 }),
      )
    })
  })

  it('URL に ?page=2 がある場合、page=2 で API を呼ぶ', async () => {
    mockList.mockResolvedValue(makeResponse({ page: 2 }))
    renderTopPage('/?page=2')
    await waitFor(() => {
      expect(mockList).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2, page_size: 10 }),
      )
    })
  })

  it('「次へ」クリックで page=2 で API が呼ばれる', async () => {
    mockList.mockResolvedValue(makeResponse({ total: 25, page_size: 10 }))
    renderTopPage('/')
    await screen.findByText('次へ')
    fireEvent.click(screen.getByText('次へ'))
    await waitFor(() => {
      expect(mockList).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2, page_size: 10 }),
      )
    })
  })

  it('page=2 のとき「前へ」クリックで page=1 で API が呼ばれる', async () => {
    mockList.mockResolvedValue(makeResponse({ total: 25, page: 2, page_size: 10 }))
    renderTopPage('/?page=2')
    await screen.findByText('前へ')
    fireEvent.click(screen.getByText('前へ'))
    await waitFor(() => {
      const pages = mockList.mock.calls.map(c => (c[0] as { page: number }).page)
      expect(pages).toContain(1)
    })
  })
})
