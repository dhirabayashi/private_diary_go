import { createElement, type ReactNode } from 'react'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAutoSave } from './useAutoSave'
import { entries } from '../api/entries'
import type { Entry } from '../types/api'

vi.mock('../api/entries', () => ({
  entries: {
    create: vi.fn(),
    update: vi.fn(),
  },
}))

const mockCreate = vi.mocked(entries.create)
const mockUpdate = vi.mocked(entries.update)

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
  return { wrapper, queryClient }
}

const makeEntry = (overrides: Partial<Entry> = {}): Entry => ({
  id: 1,
  entry_date: '2026-03-04',
  body: 'テスト',
  created_at: '2026-03-04T00:00:00Z',
  updated_at: '2026-03-04T00:00:00Z',
  ...overrides,
})

describe('useAutoSave', () => {
  let wrapper: ReturnType<typeof createWrapper>['wrapper']
  let queryClient: QueryClient

  beforeEach(() => {
    vi.useFakeTimers()
    ;({ wrapper, queryClient } = createWrapper())
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  describe('新規エントリ（existingDate なし）', () => {
    it('本文が空のときは保存しない', async () => {
      const { result } = renderHook(
        () => useAutoSave({ date: '2026-03-04', body: '' }),
        { wrapper },
      )

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000)
      })

      expect(mockCreate).not.toHaveBeenCalled()
      expect(result.current.status).toBe('idle')
      expect(result.current.autoCreated).toBe(false)
    })

    it('本文がスペースのみのときは保存しない', async () => {
      const { result } = renderHook(
        () => useAutoSave({ date: '2026-03-04', body: '   ' }),
        { wrapper },
      )

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000)
      })

      expect(mockCreate).not.toHaveBeenCalled()
      expect(result.current.status).toBe('idle')
    })

    it('本文があれば create を呼ぶ', async () => {
      mockCreate.mockResolvedValue(makeEntry())

      const { result } = renderHook(
        () => useAutoSave({ date: '2026-03-04', body: '今日の日記' }),
        { wrapper },
      )

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000)
      })

      expect(mockCreate).toHaveBeenCalledWith({ date: '2026-03-04', body: '今日の日記' })
      expect(result.current.status).toBe('saved')
      expect(result.current.autoCreated).toBe(true)
      expect(result.current.getCreatedDate()).toBe('2026-03-04')
    })

    it('create 後に内容が変わっていなければ保存しない', async () => {
      mockCreate.mockResolvedValue(makeEntry())

      renderHook(
        () => useAutoSave({ date: '2026-03-04', body: '同じ内容' }),
        { wrapper },
      )

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000)
      })
      expect(mockCreate).toHaveBeenCalledTimes(1)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000)
      })
      expect(mockCreate).toHaveBeenCalledTimes(1)
      expect(mockUpdate).not.toHaveBeenCalled()
    })

    it('create 後に内容が変わったとき update を呼ぶ', async () => {
      mockCreate.mockResolvedValue(makeEntry())
      mockUpdate.mockResolvedValue(makeEntry({ body: '更新内容' }))

      const { rerender } = renderHook(
        ({ body }: { body: string }) => useAutoSave({ date: '2026-03-04', body }),
        { wrapper, initialProps: { body: '初回内容' } },
      )

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000)
      })
      expect(mockCreate).toHaveBeenCalledTimes(1)

      rerender({ body: '更新内容' })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000)
      })
      expect(mockUpdate).toHaveBeenCalledWith('2026-03-04', '更新内容')
    })

    it('create が失敗したとき status が error、autoCreated が false のまま', async () => {
      mockCreate.mockRejectedValue(new Error('network error'))

      const { result } = renderHook(
        () => useAutoSave({ date: '2026-03-04', body: '日記内容' }),
        { wrapper },
      )

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000)
      })

      expect(result.current.status).toBe('error')
      expect(result.current.autoCreated).toBe(false)
      expect(result.current.getCreatedDate()).toBeNull()
    })
  })

  describe('既存エントリ（existingDate あり）', () => {
    it('内容が変わったとき update を呼ぶ、create は呼ばない', async () => {
      mockUpdate.mockResolvedValue(makeEntry({ body: '変更内容' }))

      renderHook(
        () =>
          useAutoSave({
            date: '2026-03-04',
            body: '変更内容',
            existingDate: '2026-03-04',
            initialBody: '元の内容',
          }),
        { wrapper },
      )

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000)
      })

      expect(mockCreate).not.toHaveBeenCalled()
      expect(mockUpdate).toHaveBeenCalledWith('2026-03-04', '変更内容')
    })

    it('内容が変わっていなければ保存しない', async () => {
      renderHook(
        () =>
          useAutoSave({
            date: '2026-03-04',
            body: '同じ内容',
            existingDate: '2026-03-04',
            initialBody: '同じ内容',
          }),
        { wrapper },
      )

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000)
      })

      expect(mockUpdate).not.toHaveBeenCalled()
    })

    it('update が失敗したとき status が error', async () => {
      mockUpdate.mockRejectedValue(new Error('network error'))

      const { result } = renderHook(
        () =>
          useAutoSave({
            date: '2026-03-04',
            body: '変更内容',
            existingDate: '2026-03-04',
            initialBody: '元の内容',
          }),
        { wrapper },
      )

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000)
      })

      expect(result.current.status).toBe('error')
    })
  })

  describe('キャッシュの無効化', () => {
    it('create 成功後に entries と entry のキャッシュを無効化する', async () => {
      mockCreate.mockResolvedValue(makeEntry())
      vi.spyOn(queryClient, 'invalidateQueries')

      renderHook(
        () => useAutoSave({ date: '2026-03-04', body: '今日の日記' }),
        { wrapper },
      )

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000)
      })

      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['entries'] })
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['entry', '2026-03-04'] })
    })

    it('update 成功後に entries と entry のキャッシュを無効化する', async () => {
      mockUpdate.mockResolvedValue(makeEntry({ body: '変更内容' }))
      vi.spyOn(queryClient, 'invalidateQueries')

      renderHook(
        () =>
          useAutoSave({
            date: '2026-03-04',
            body: '変更内容',
            existingDate: '2026-03-04',
            initialBody: '元の内容',
          }),
        { wrapper },
      )

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000)
      })

      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['entries'] })
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['entry', '2026-03-04'] })
    })

    it('create が失敗したときはキャッシュを無効化しない', async () => {
      mockCreate.mockRejectedValue(new Error('network error'))
      vi.spyOn(queryClient, 'invalidateQueries')

      renderHook(
        () => useAutoSave({ date: '2026-03-04', body: '日記内容' }),
        { wrapper },
      )

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000)
      })

      expect(queryClient.invalidateQueries).not.toHaveBeenCalled()
    })
  })

  describe('並行実行の防止', () => {
    it('前回の保存が進行中のとき次のインターバルはスキップする', async () => {
      let resolveCreate!: (value: Entry | PromiseLike<Entry>) => void
      const pendingCreate = new Promise<Entry>(resolve => {
        resolveCreate = resolve
      })
      mockCreate.mockReturnValueOnce(pendingCreate)

      renderHook(
        () => useAutoSave({ date: '2026-03-04', body: '日記内容' }),
        { wrapper },
      )

      // 1回目のインターバル発火: create が未完了のまま
      act(() => {
        vi.advanceTimersByTime(30000)
      })
      expect(mockCreate).toHaveBeenCalledTimes(1)

      // 2回目のインターバル発火: 1回目が進行中なのでスキップされる
      act(() => {
        vi.advanceTimersByTime(30000)
      })
      expect(mockCreate).toHaveBeenCalledTimes(1)

      // 1回目を完了させる
      await act(async () => {
        resolveCreate(makeEntry())
      })
    })
  })

  describe('アンマウント', () => {
    it('アンマウント後はインターバルが停止する', async () => {
      const { unmount } = renderHook(
        () => useAutoSave({ date: '2026-03-04', body: '日記内容' }),
        { wrapper },
      )

      unmount()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000)
      })

      expect(mockCreate).not.toHaveBeenCalled()
    })
  })

  describe('awaitCurrentSave', () => {
    it('保存中でなければ即座に解決する', async () => {
      const { result } = renderHook(
        () => useAutoSave({ date: '2026-03-04', body: '日記内容' }),
        { wrapper },
      )

      let resolved = false
      await act(async () => {
        await result.current.awaitCurrentSave()
        resolved = true
      })

      expect(resolved).toBe(true)
    })

    it('保存中であれば完了まで待機する', async () => {
      let resolveCreate!: (value: Entry | PromiseLike<Entry>) => void
      const pendingCreate = new Promise<Entry>(resolve => {
        resolveCreate = resolve
      })
      mockCreate.mockReturnValueOnce(pendingCreate)

      const { result } = renderHook(
        () => useAutoSave({ date: '2026-03-04', body: '日記内容' }),
        { wrapper },
      )

      // インターバルを発火させるが、create は未完了のまま
      act(() => {
        vi.advanceTimersByTime(30000)
      })

      let resolved = false
      const waitPromise = result.current.awaitCurrentSave().then(() => {
        resolved = true
      })

      expect(resolved).toBe(false)

      // create を完了させ、awaitCurrentSave が解決するのを待つ
      await act(async () => {
        resolveCreate(makeEntry())
        await waitPromise
      })

      expect(resolved).toBe(true)
    })
  })
})
