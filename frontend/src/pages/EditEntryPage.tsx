import { useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { PageLayout } from '../components/layout/PageLayout'
import { EntryForm, type EntryFormHandle } from '../components/features/EntryForm'
import { Button } from '../components/ui/Button'
import { useEntry, useUpdateEntry } from '../hooks/useEntries'
import { useToast } from '../components/ui/Toast'

export function EditEntryPage() {
  const { date } = useParams<{ date: string }>()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { data: entry, isLoading } = useEntry(date ?? '')
  const { mutateAsync: updateEntry } = useUpdateEntry()
  const formRef = useRef<EntryFormHandle>(null)

  const handleSubmit = async (values: { date: string; body: string }) => {
    if (!date) return
    try {
      // 進行中の自動保存を待ってから更新することで、古い内容による上書きを防ぐ
      await formRef.current?.awaitCurrentSave()
      await updateEntry({ date, body: values.body })
      showToast('日記を更新しました')
      navigate(`/${date}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : '更新に失敗しました'
      showToast(msg, 'error')
    }
  }

  if (isLoading) {
    return (
      <PageLayout>
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-stone-300 border-t-stone-700" />
        </div>
      </PageLayout>
    )
  }

  if (!entry) {
    return (
      <PageLayout>
        <p className="text-center text-red-600 py-12">日記が見つかりませんでした。</p>
      </PageLayout>
    )
  }

  return (
    <PageLayout title="日記を編集">
      <div className="max-w-2xl">
        <div className="mb-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            ← 戻る
          </Button>
        </div>
        <EntryForm
          ref={formRef}
          defaultValues={{ date: entry.entry_date, body: entry.body }}
          onSubmit={handleSubmit}
          submitLabel="更新する"
          dateReadOnly
          autoSaveExistingDate={entry.entry_date}
        />
      </div>
    </PageLayout>
  )
}
