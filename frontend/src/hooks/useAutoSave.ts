import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { entries } from '../api/entries'
import { ApiError } from '../api/client'

export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'conflict'

interface UseAutoSaveOptions {
  date: string
  body: string
  existingDate?: string
  initialBody?: string
  initialVersion?: number
  intervalMs?: number
}

export interface UseAutoSaveReturn {
  status: AutoSaveStatus
  // 新規エントリが自動保存で作成済みかどうか（日付フィールドのロックに使う）
  autoCreated: boolean
  // ref 経由で最新値を直接読む（React state の非同期性を回避）
  getCreatedDate: () => string | null
  // 自動保存・手動投稿の両方が呼ぶ唯一の保存入口。同時に呼ばれた分は1本のリクエストに合流する。
  save: () => Promise<void>
  // 競合時: サーバー側の最新内容を取得し、内部の版管理をそれに同期する
  reloadFromServer: () => Promise<{ body: string; version: number }>
  // 競合時: サーバー側の最新versionを採用した上で、現在の入力内容を強制的に再送する
  forceSave: () => Promise<void>
}

// 1回の保存試行（＝1ラウンド）に対応するPromiseと、それを解決する手段の組。
type Round = {
  promise: Promise<void>
  resolve: () => void
  reject: (e: unknown) => void
}

function createRound(): Round {
  let resolve!: () => void
  let reject!: (e: unknown) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

export function useAutoSave({
  date,
  body,
  existingDate,
  initialBody,
  initialVersion,
  intervalMs = 30000,
}: UseAutoSaveOptions): UseAutoSaveReturn {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<AutoSaveStatus>('idle')
  const [autoCreated, setAutoCreated] = useState(false)
  const createdDateRef = useRef<string | null>(existingDate ?? null)
  const lastSavedBodyRef = useRef<string | null>(initialBody ?? null)
  const versionRef = useRef<number | null>(initialVersion ?? null)
  const conflictVersionRef = useRef<number | null>(null)
  const valuesRef = useRef({ date, body })
  const activeRoundRef = useRef<Round | null>(null)
  const nextRoundRef = useRef<Round | null>(null)
  const statusRef = useRef(status)
  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    valuesRef.current = { date, body }
  })

  useEffect(() => {
    statusRef.current = status
  })

  // 1ラウンド分の保存を実行し、resolve/rejectしてラウンドを閉じる。
  // 閉じた時点で次のラウンドが積まれていれば、そのまま続けて実行する。
  const runRound = useCallback(async (round: Round) => {
    const settle = (finish: () => void) => {
      finish()
      activeRoundRef.current = null
      const next = nextRoundRef.current
      if (next) {
        nextRoundRef.current = null
        activeRoundRef.current = next
        runRound(next)
      }
    }

    const { date: currentDate, body: currentBody } = valuesRef.current
    if (!currentBody.trim()) return settle(round.resolve)
    if (createdDateRef.current !== null && lastSavedBodyRef.current === currentBody) {
      return settle(round.resolve)
    }

    setStatus('saving')
    const controller = new AbortController()
    abortControllerRef.current = controller
    try {
      if (createdDateRef.current === null) {
        const entry = await entries.create({ date: currentDate, body: currentBody }, controller.signal)
        createdDateRef.current = entry.entry_date
        versionRef.current = entry.version
        setAutoCreated(true)
        queryClient.invalidateQueries({ queryKey: ['entries'] })
      } else {
        const entry = await entries.update(
          createdDateRef.current, currentBody, versionRef.current!, controller.signal,
        )
        versionRef.current = entry.version
        // NOTE: ['entry', date] は意図的に無効化しない（NewEntryPageでの誤リダイレクト防止のため）。
        queryClient.invalidateQueries({ queryKey: ['entries'] })
      }
      lastSavedBodyRef.current = currentBody
      setStatus('saved')
      settle(round.resolve)
    } catch (e) {
      // アンマウントによるabortの場合、このラウンドを待っている相手は既に画面を離れた
      // コンポーネントのクロージャだけなので、resolve/rejectのどちらもせず未解決のまま
      // 放置する（＝合流待ちの次ラウンドを起動するsettle()も呼ばない）。キャンセルを
      // エラーとして呼び出し元に伝播させると、「アンマウント時は特別扱いする」という
      // 判断を全呼び出し元に強制することになるため、ここで完全に握りつぶすのが正しい。
      if (e instanceof DOMException && e.name === 'AbortError') {
        activeRoundRef.current = null
        return
      }
      if (e instanceof ApiError && e.code === 'VERSION_CONFLICT') {
        conflictVersionRef.current = e.currentVersion ?? null
        setStatus('conflict')
      } else {
        console.error('自動保存に失敗しました', e)
        setStatus('error')
      }
      settle(() => round.reject(e))
    } finally {
      // このラウンドの後に次のラウンドが同期的に開始している場合、既にabortControllerRefは
      // 次のラウンド用のControllerに差し替わっているため、自分が積んだものと一致する時だけ消す。
      if (abortControllerRef.current === controller) abortControllerRef.current = null
    }
  }, [])

  // 自動保存・手動投稿の両方が呼び出す唯一の入口。
  // 呼び出しごとに、自分の保存が実行されるラウンドに対応したPromiseを返す。
  const requestSave = useCallback((): Promise<void> => {
    if (activeRoundRef.current) {
      if (!nextRoundRef.current) nextRoundRef.current = createRound()
      return nextRoundRef.current.promise
    }
    const round = createRound()
    activeRoundRef.current = round
    runRound(round)
    return round.promise
  }, [runRound])

  // 「最新の内容を読み込み直す」：サーバーの最新状態で内部の版管理を同期する。
  const reloadFromServer = useCallback(async (): Promise<{ body: string; version: number }> => {
    const { date: currentDate } = valuesRef.current
    const entry = await entries.getByDate(currentDate)
    versionRef.current = entry.version
    lastSavedBodyRef.current = entry.body
    conflictVersionRef.current = null
    setStatus('idle')
    return { body: entry.body, version: entry.version }
  }, [])

  // 「このまま自分の内容で保存する」：サーバー側の最新versionを採用した上で強制的に再送する。
  const forceSave = useCallback((): Promise<void> => {
    if (conflictVersionRef.current === null) {
      return Promise.reject(new Error('競合状態ではありません'))
    }
    versionRef.current = conflictVersionRef.current
    conflictVersionRef.current = null
    return requestSave()
  }, [requestSave])

  // アンマウント時、飛び去ったリクエストの完了を待たずに次の画面へ遷移できるようにする
  // （レスポンス待ちで queryClient.invalidateQueries 等がアンマウント後に呼ばれるのを防ぐ）。
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
      // 合流待ちだった次ラウンドは、参照を外すだけで良い（interval側もclearIntervalで停止し、
      // 以後このコンポーネントから新たなラウンドが積まれることはないため）。そのPromiseは
      // 未解決のまま残るが、待っているのは既にアンマウントしたコンポーネント側のクロージャのみ
      // なので実害はない。
      nextRoundRef.current = null
    }
  }, [])

  useEffect(() => {
    // status を依存配列に入れると保存サイクルごとにエフェクトが再生成されタイマーがリセットされてしまうため、
    // conflict判定はstatusRef経由で行い、このエフェクト自体はintervalMsにのみ依存させる。
    const id = setInterval(() => {
      if (statusRef.current === 'conflict') return
      requestSave().catch(() => {})
    }, intervalMs)
    return () => clearInterval(id)
  }, [intervalMs, requestSave])

  return {
    status,
    autoCreated,
    getCreatedDate: () => createdDateRef.current,
    save: requestSave,
    reloadFromServer,
    forceSave,
  }
}
