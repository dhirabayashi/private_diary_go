import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { entries } from '../api/entries'

export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface UseAutoSaveOptions {
  date: string
  body: string
  existingDate?: string
  initialBody?: string
  intervalMs?: number
}

export interface UseAutoSaveReturn {
  status: AutoSaveStatus
  // 新規エントリが自動保存で作成済みかどうか（日付フィールドのロックに使う）
  autoCreated: boolean
  // ref 経由で最新値を直接読む（React state の非同期性を回避）
  getCreatedDate: () => string | null
  // 進行中の保存が完了するまで待機する（手動投稿との競合を防ぐ）
  awaitCurrentSave: () => Promise<void>
}

export function useAutoSave({
  date,
  body,
  existingDate,
  initialBody,
  intervalMs = 30000,
}: UseAutoSaveOptions): UseAutoSaveReturn {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<AutoSaveStatus>('idle')
  const [autoCreated, setAutoCreated] = useState(false)
  const createdDateRef = useRef<string | null>(existingDate ?? null)
  const lastSavedBodyRef = useRef<string | null>(initialBody ?? null)
  const valuesRef = useRef({ date, body })
  const inFlightRef = useRef<Promise<void> | null>(null)

  // refをレンダリングごとに最新値で更新（依存配列なし = 毎レンダリング後に実行して最新値を同期）
  useEffect(() => {
    valuesRef.current = { date, body }
  })

  useEffect(() => {
    const save = async () => {
      // 前回の保存が進行中なら並行実行を防ぐためスキップ
      if (inFlightRef.current !== null) return

      const { date: currentDate, body: currentBody } = valuesRef.current

      // 本文が空なら保存しない
      if (!currentBody.trim()) return
      // 前回保存から内容が変わっていなければスキップ
      if (createdDateRef.current !== null && lastSavedBodyRef.current === currentBody) return

      setStatus('saving')
      const p = (async () => {
        try {
          if (createdDateRef.current === null) {
            // 新規エントリ：初回のみ create
            const entry = await entries.create({ date: currentDate, body: currentBody })
            createdDateRef.current = entry.entry_date
            setAutoCreated(true)
            queryClient.invalidateQueries({ queryKey: ['entries'] })
          } else {
            // 既存エントリ：以降は update
            await entries.update(createdDateRef.current, currentBody)
            queryClient.invalidateQueries({ queryKey: ['entries'] })
            queryClient.invalidateQueries({ queryKey: ['entry', createdDateRef.current] })
          }
          lastSavedBodyRef.current = currentBody
          setStatus('saved')
        } catch (e) {
          console.error('自動保存に失敗しました', e)
          setStatus('error')
        }
      })()

      inFlightRef.current = p
      await p
      inFlightRef.current = null
    }

    const id = setInterval(save, intervalMs)
    return () => clearInterval(id)
  }, [intervalMs, queryClient])

  return {
    status,
    autoCreated,
    getCreatedDate: () => createdDateRef.current,
    awaitCurrentSave: () => inFlightRef.current ?? Promise.resolve(),
  }
}
