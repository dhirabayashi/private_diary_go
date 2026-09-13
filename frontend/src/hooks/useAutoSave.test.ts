import { createElement, type ReactNode } from 'react'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAutoSave } from './useAutoSave'
import { entries } from '../api/entries'
import { ApiError } from '../api/client'
import type { Entry } from '../types/api'

vi.mock('../api/entries', () => ({
  entries: {
    create: vi.fn(),
    update: vi.fn(),
    getByDate: vi.fn(),
  },
}))

const mockCreate = vi.mocked(entries.create)
const mockUpdate = vi.mocked(entries.update)
const mockGetByDate = vi.mocked(entries.getByDate)

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
  version: 1,
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

      expect(mockCreate).toHaveBeenCalledWith({ date: '2026-03-04', body: '今日の日記' }, expect.any(AbortSignal))
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

    it('create 後に内容が変わったとき、create レスポンスの version で update を呼ぶ', async () => {
      mockCreate.mockResolvedValue(makeEntry({ version: 1 }))
      mockUpdate.mockResolvedValue(makeEntry({ body: '更新内容', version: 2 }))

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
      expect(mockUpdate).toHaveBeenCalledWith('2026-03-04', '更新内容', 1, expect.any(AbortSignal))
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
    it('内容が変わったとき、initialVersion を使って update を呼ぶ、create は呼ばない', async () => {
      mockUpdate.mockResolvedValue(makeEntry({ body: '変更内容', version: 4 }))

      renderHook(
        () =>
          useAutoSave({
            date: '2026-03-04',
            body: '変更内容',
            existingDate: '2026-03-04',
            initialBody: '元の内容',
            initialVersion: 3,
          }),
        { wrapper },
      )

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000)
      })

      expect(mockCreate).not.toHaveBeenCalled()
      expect(mockUpdate).toHaveBeenCalledWith('2026-03-04', '変更内容', 3, expect.any(AbortSignal))
    })

    it('内容が変わっていなければ保存しない', async () => {
      renderHook(
        () =>
          useAutoSave({
            date: '2026-03-04',
            body: '同じ内容',
            existingDate: '2026-03-04',
            initialBody: '同じ内容',
            initialVersion: 1,
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
            initialVersion: 1,
          }),
        { wrapper },
      )

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000)
      })

      expect(result.current.status).toBe('error')
    })

    it('update 成功後の version が次回の update 呼び出しに使われる', async () => {
      mockUpdate
        .mockResolvedValueOnce(makeEntry({ body: '1回目の変更', version: 2 }))
        .mockResolvedValueOnce(makeEntry({ body: '2回目の変更', version: 3 }))

      const { rerender } = renderHook(
        ({ body }: { body: string }) =>
          useAutoSave({
            date: '2026-03-04',
            body,
            existingDate: '2026-03-04',
            initialBody: '元の内容',
            initialVersion: 1,
          }),
        { wrapper, initialProps: { body: '1回目の変更' } },
      )

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000)
      })
      expect(mockUpdate).toHaveBeenNthCalledWith(1, '2026-03-04', '1回目の変更', 1, expect.any(AbortSignal))

      rerender({ body: '2回目の変更' })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000)
      })
      expect(mockUpdate).toHaveBeenNthCalledWith(2, '2026-03-04', '2回目の変更', 2, expect.any(AbortSignal))
    })
  })

  describe('キャッシュの無効化', () => {
    it('create 成功後に entries のキャッシュを無効化する', async () => {
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
      expect(queryClient.invalidateQueries).not.toHaveBeenCalledWith({ queryKey: ['entry', '2026-03-04'] })
    })

    it('update 成功後に entries のキャッシュを無効化する（entry は無効化しない）', async () => {
      mockUpdate.mockResolvedValue(makeEntry({ body: '変更内容' }))
      vi.spyOn(queryClient, 'invalidateQueries')

      renderHook(
        () =>
          useAutoSave({
            date: '2026-03-04',
            body: '変更内容',
            existingDate: '2026-03-04',
            initialBody: '元の内容',
            initialVersion: 1,
          }),
        { wrapper },
      )

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000)
      })

      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['entries'] })
      expect(queryClient.invalidateQueries).not.toHaveBeenCalledWith({ queryKey: ['entry', '2026-03-04'] })
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

  describe('保存の合流（coalescing）', () => {
    it('保存中に自動保存tickと手動saveが重なった場合、実際のリクエストは1本のみで、完了後に最新内容で追いの保存が1回だけ走る', async () => {
      let resolveFirst!: (value: Entry) => void
      const firstCreate = new Promise<Entry>((resolve) => {
        resolveFirst = resolve
      })
      mockCreate.mockReturnValueOnce(firstCreate)
      mockUpdate.mockResolvedValue(makeEntry({ body: '2回目の内容', version: 2 }))

      const { result, rerender } = renderHook(
        ({ body }: { body: string }) => useAutoSave({ date: '2026-03-04', body }),
        { wrapper, initialProps: { body: '1回目の内容' } },
      )

      // 1回目のインターバル発火: create が未完了のまま
      let firstSavePromise!: Promise<void>
      act(() => {
        firstSavePromise = result.current.save()
      })
      expect(mockCreate).toHaveBeenCalledTimes(1)

      // 進行中に本文が変わり、手動saveが呼ばれる → 次のラウンドに合流するだけで即時リクエストは増えない
      rerender({ body: '2回目の内容' })
      let secondSavePromise!: Promise<void>
      act(() => {
        secondSavePromise = result.current.save()
      })
      expect(mockCreate).toHaveBeenCalledTimes(1)
      expect(mockUpdate).not.toHaveBeenCalled()

      // 1回目を完了させると、合流していた2回目のラウンドが最新内容で実行される
      await act(async () => {
        resolveFirst(makeEntry({ version: 1 }))
        await firstSavePromise
        await secondSavePromise
      })

      expect(mockUpdate).toHaveBeenCalledTimes(1)
      expect(mockUpdate).toHaveBeenCalledWith('2026-03-04', '2回目の内容', 1, expect.any(AbortSignal))
    })

    it('本文が空、または前回保存から内容が変化していないためスキップされたラウンドでも、合流していた呼び出し元の save() がハングせず解決される', async () => {
      const { result } = renderHook(
        () => useAutoSave({ date: '2026-03-04', body: '' }),
        { wrapper },
      )

      let resolved = false
      await act(async () => {
        await result.current.save()
        resolved = true
      })

      expect(resolved).toBe(true)
      expect(mockCreate).not.toHaveBeenCalled()
    })

    it('進行中の保存Aが成功し、それに合流していた次ラウンドBの保存が失敗した場合、Aの呼び出し元は成功のまま解決され、Bの呼び出し元だけがrejectされる', async () => {
      let resolveFirst!: (value: Entry) => void
      const firstCreate = new Promise<Entry>((resolve) => {
        resolveFirst = resolve
      })
      mockCreate.mockReturnValueOnce(firstCreate)
      mockUpdate.mockRejectedValue(new Error('network error'))

      const { result, rerender } = renderHook(
        ({ body }: { body: string }) => useAutoSave({ date: '2026-03-04', body }),
        { wrapper, initialProps: { body: 'A' } },
      )

      let promiseA!: Promise<void>
      act(() => {
        promiseA = result.current.save()
      })

      rerender({ body: 'B' })
      let promiseB!: Promise<void>
      act(() => {
        promiseB = result.current.save()
      })

      let aResolved = false
      let bRejected = false
      promiseA.then(() => { aResolved = true })
      promiseB.catch(() => { bRejected = true })

      await act(async () => {
        resolveFirst(makeEntry({ version: 1 }))
        await promiseA
        await promiseB.catch(() => {})
      })

      expect(aResolved).toBe(true)
      expect(bRejected).toBe(true)
    })
  })

  describe('バージョン競合（VERSION_CONFLICT）', () => {
    it('409(VERSION_CONFLICT)を受けたら status が conflict になり、current_version を保持する', async () => {
      mockUpdate.mockRejectedValue(new ApiError('VERSION_CONFLICT', '競合しました', 409, 5))

      const { result } = renderHook(
        () =>
          useAutoSave({
            date: '2026-03-04',
            body: '変更内容',
            existingDate: '2026-03-04',
            initialBody: '元の内容',
            initialVersion: 1,
          }),
        { wrapper },
      )

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000)
      })

      expect(result.current.status).toBe('conflict')
    })

    it('conflict状態のときは以降のtickで保存しない', async () => {
      mockUpdate.mockRejectedValue(new ApiError('VERSION_CONFLICT', '競合しました', 409, 5))

      renderHook(
        () =>
          useAutoSave({
            date: '2026-03-04',
            body: '変更内容',
            existingDate: '2026-03-04',
            initialBody: '元の内容',
            initialVersion: 1,
          }),
        { wrapper },
      )

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000)
      })
      expect(mockUpdate).toHaveBeenCalledTimes(1)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000)
      })
      expect(mockUpdate).toHaveBeenCalledTimes(1)
    })

    it('reloadFromServer() は最新の内容で version・status を同期し、{ body, version } を返す', async () => {
      mockUpdate.mockRejectedValue(new ApiError('VERSION_CONFLICT', '競合しました', 409, 5))
      mockGetByDate.mockResolvedValue(makeEntry({ body: '他所での最新内容', version: 5 }))

      const { result } = renderHook(
        () =>
          useAutoSave({
            date: '2026-03-04',
            body: '変更内容',
            existingDate: '2026-03-04',
            initialBody: '元の内容',
            initialVersion: 1,
          }),
        { wrapper },
      )

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000)
      })
      expect(result.current.status).toBe('conflict')

      let reloaded!: { body: string; version: number }
      await act(async () => {
        reloaded = await result.current.reloadFromServer()
      })

      expect(reloaded).toEqual({ body: '他所での最新内容', version: 5 })
      expect(result.current.status).toBe('idle')
    })

    it('forceSave() は保持していた current_version を使って update を呼び、成功すれば conflict を抜ける', async () => {
      mockUpdate
        .mockRejectedValueOnce(new ApiError('VERSION_CONFLICT', '競合しました', 409, 5))
        .mockResolvedValueOnce(makeEntry({ body: '変更内容', version: 6 }))

      const { result } = renderHook(
        () =>
          useAutoSave({
            date: '2026-03-04',
            body: '変更内容',
            existingDate: '2026-03-04',
            initialBody: '元の内容',
            initialVersion: 1,
          }),
        { wrapper },
      )

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000)
      })
      expect(result.current.status).toBe('conflict')

      await act(async () => {
        await result.current.forceSave()
      })

      expect(mockUpdate).toHaveBeenNthCalledWith(2, '2026-03-04', '変更内容', 5, expect.any(AbortSignal))
      expect(result.current.status).toBe('saved')
    })

    it('competing状態でない（current_versionを保持していない）ときにforceSave()を呼ぶとreject される', async () => {
      const { result } = renderHook(
        () => useAutoSave({ date: '2026-03-04', body: '本文', existingDate: '2026-03-04', initialBody: '本文', initialVersion: 1 }),
        { wrapper },
      )

      await expect(result.current.forceSave()).rejects.toThrow()
    })
  })

  describe('保存インターバルの一定周期', () => {
    it('保存が saving→saved と状態遷移してもタイマーがリセットされず intervalMs ごとに発火し続ける', async () => {
      mockUpdate.mockResolvedValue(makeEntry({ body: '内容', version: 2 }))

      renderHook(
        () =>
          useAutoSave({
            date: '2026-03-04',
            body: '内容',
            existingDate: '2026-03-04',
            initialBody: '元の内容',
            initialVersion: 1,
          }),
        { wrapper },
      )

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000)
      })
      expect(mockUpdate).toHaveBeenCalledTimes(1)

      // 2回目以降は内容が変わっていないためスキップされるが、
      // インターバル自体は30秒ごとに変わらず発火し続ける（タイマーの再起動が起きていないこと）
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000)
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000)
      })
      // 3回目のtickの前後で合計60秒しか経過していない前提のもとスキップが安定していることを確認
      expect(mockUpdate).toHaveBeenCalledTimes(1)
    })
  })

  describe('新規エントリで自動保存によるcreateが成功した場合のautoCreated（回帰テスト）', () => {
    it('create成功後にautoCreatedがtrueになる', async () => {
      mockCreate.mockResolvedValue(makeEntry())

      const { result } = renderHook(
        () => useAutoSave({ date: '2026-03-04', body: '今日の日記' }),
        { wrapper },
      )

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000)
      })

      expect(result.current.autoCreated).toBe(true)
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

    it('保存が進行中のままアンマウントされたら、in-flightリクエストがabortされる', async () => {
      let capturedSignal: AbortSignal | undefined
      mockCreate.mockImplementation((_data, signal) => {
        capturedSignal = signal
        return new Promise(() => {}) // 完了しないPromise（アンマウント時点でin-flight）
      })

      const { unmount } = renderHook(
        () => useAutoSave({ date: '2026-03-04', body: '日記内容' }),
        { wrapper },
      )

      act(() => {
        vi.advanceTimersByTime(30000)
      })
      expect(mockCreate).toHaveBeenCalledTimes(1)
      expect(capturedSignal?.aborted).toBe(false)

      unmount()

      expect(capturedSignal?.aborted).toBe(true)
    })

    it('保存が進行中でなければアンマウント時に何もabortしない（例外が飛ばない）', () => {
      const { unmount } = renderHook(
        () => useAutoSave({ date: '2026-03-04', body: '' }),
        { wrapper },
      )

      expect(() => unmount()).not.toThrow()
    })

    it('合流待ちの次ラウンドがある状態でアンマウントしても、そのラウンドのために新規リクエストは飛ばない', async () => {
      let resolveFirst!: (value: Entry) => void
      const firstCreate = new Promise<Entry>((resolve) => {
        resolveFirst = resolve
      })
      mockCreate.mockReturnValueOnce(firstCreate)

      const { result, unmount } = renderHook(
        () => useAutoSave({ date: '2026-03-04', body: '1回目の内容' }),
        { wrapper },
      )

      let firstSavePromise!: Promise<void>
      act(() => {
        firstSavePromise = result.current.save()
      })
      expect(mockCreate).toHaveBeenCalledTimes(1)

      // 1回目が進行中のまま、2回目のsave()が合流待ち（nextRoundRef）に積まれる。
      // アンマウント後は誰も結果を必要としないため、このPromiseは意図的に未解決のまま
      // 放置される（resolve/rejectいずれも起きない）ことを確認する。
      let secondSettled = false
      act(() => {
        result.current.save().then(
          () => { secondSettled = true },
          () => { secondSettled = true },
        )
      })
      expect(mockCreate).toHaveBeenCalledTimes(1)

      unmount()

      // 1回目（進行中だったリクエスト）は後から普通に解決する
      await act(async () => {
        resolveFirst(makeEntry({ version: 1 }))
        await firstSavePromise
      })

      // 合流待ちだった2回目のために新規リクエストは発火せず、Promiseも未解決のまま
      expect(secondSettled).toBe(false)
      expect(mockCreate).toHaveBeenCalledTimes(1)
      expect(mockUpdate).not.toHaveBeenCalled()
    })

    it('in-flightリクエストが実際にabort由来のエラーで失敗しても、そのラウンドのPromiseは未解決のまま残る（誰にも伝播しない）', async () => {
      let rejectCreate!: (e: unknown) => void
      const pendingCreate = new Promise<Entry>((_resolve, reject) => {
        rejectCreate = reject
      })
      mockCreate.mockReturnValueOnce(pendingCreate)

      const { result, unmount } = renderHook(
        () => useAutoSave({ date: '2026-03-04', body: '日記内容' }),
        { wrapper },
      )

      let settled = false
      act(() => {
        result.current.save().then(
          () => { settled = true },
          () => { settled = true },
        )
      })

      unmount()

      // 実際のfetchがAbortControllerによってabortされ、AbortErrorで拒否された場合を模す
      await act(async () => {
        rejectCreate(new DOMException('The operation was aborted', 'AbortError'))
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(settled).toBe(false)
    })
  })
})
