export interface Image {
  id: number
  entry_id: number
  filename: string
  original_name: string
  order: number
  created_at: string
}

export interface Entry {
  id: number
  entry_date: string
  body: string
  preview?: string
  images?: Image[]
  created_at: string
  updated_at: string
}

export interface EntryListResponse {
  entries: Entry[]
  total: number
  page: number
  page_size: number
}

export interface ApiSuccess<T> {
  data: T
}

export interface ApiError {
  error: {
    code: string
    message: string
  }
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError

export function isApiError(res: unknown): res is ApiError {
  return typeof res === 'object' && res !== null && 'error' in res
}
