import { fetchJson } from './client'
import type { Entry, EntryListResponse } from '../types/api'

export interface ListParams {
  page?: number
  page_size?: number
  q?: string
  from?: string
  to?: string
}

export const entries = {
  list: (params: ListParams = {}) =>
    fetchJson<EntryListResponse>('/api/entries', {
      params: params as Record<string, string | number | undefined>,
    }),

  getByDate: (date: string) =>
    fetchJson<Entry>(`/api/entries/${date}`),

  create: (data: { date: string; body: string }) =>
    fetchJson<Entry>('/api/entries', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (date: string, body: string) =>
    fetchJson<Entry>(`/api/entries/${date}`, {
      method: 'PUT',
      body: JSON.stringify({ body }),
    }),

  delete: (date: string) =>
    fetch(`/api/entries/${date}`, { method: 'DELETE' }),

  exportSingle: (date: string) => {
    const a = document.createElement('a')
    a.href = `/api/entries/${date}/export`
    a.click()
  },
}
