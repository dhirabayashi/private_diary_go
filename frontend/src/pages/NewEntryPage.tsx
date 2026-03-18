import { useRef, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { PageLayout } from '../components/layout/PageLayout'
import { EntryForm, type EntryFormHandle } from '../components/features/EntryForm'
import { useCreateEntry, useUpdateEntry } from '../hooks/useEntries'
import { useToast } from '../components/ui/Toast'
import { entries } from '../api/entries'

// 'sv'（スウェーデン）ロケールは YYYY-MM-DD 形式を返すため、JST 日付を簡潔に取得するために利用している
const today = () => new Date().toLocaleDateString('sv', { timeZone: 'Asia/Tokyo' })

export function NewEntryPage() {
  const navigate = useNavigate()
  const { mutateAsync: createEntry } = useCreateEntry()
  const { mutateAsync: updateEntry } = useUpdateEntry()
  const { showToast } = useToast()
  const formRef = useRef<EntryFormHandle>(null)
  const [selectedDate, setSelectedDate] = useState(today())

  const { data: existingEntry } = useQuery({
    queryKey: ['entry', selectedDate],
    queryFn: () => entries.getByDate(selectedDate),
    enabled: !!selectedDate,
    retry: false,
  })

  useEffect(() => {
    if (existingEntry) {
      navigate(`/${selectedDate}/edit`, { replace: true })
    }
  }, [existingEntry, selectedDate, navigate])

  const handleSubmit = async (values: { date: string; body: string }) => {
    try {
      // 進行中の自動保存を待ってから判断することで、create の重複と state の非同期性による競合を防ぐ
      await formRef.current?.awaitCurrentSave()
      const autoSavedDate = formRef.current?.getCreatedDate() ?? null

      if (autoSavedDate === values.date) {
        // 自動保存でエントリ作成済みなので update する
        await updateEntry({ date: autoSavedDate, body: values.body })
        showToast('日記を投稿しました')
        navigate(`/${autoSavedDate}`)
      } else {
        // autoCreated === true のとき EntryForm が日付を readOnly にするため、
        // autoSavedDate !== values.date のケースは自動保存前の手動投稿のみ。
        const entry = await createEntry(values)
        showToast('日記を投稿しました')
        navigate(`/${entry.entry_date}`)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '投稿に失敗しました'
      showToast(msg, 'error')
    }
  }

  return (
    <PageLayout title="新規投稿">
      <div className="max-w-2xl">
        <EntryForm
          ref={formRef}
          onSubmit={handleSubmit}
          submitLabel="投稿する"
          onDateChange={setSelectedDate}
        />
      </div>
    </PageLayout>
  )
}
