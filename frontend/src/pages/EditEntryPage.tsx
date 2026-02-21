import { useParams, useNavigate } from 'react-router-dom'
import { PageLayout } from '../components/layout/PageLayout'
import { EntryForm } from '../components/features/EntryForm'
import { useEntry, useUpdateEntry } from '../hooks/useEntries'
import { useToast } from '../components/ui/Toast'

export function EditEntryPage() {
  const { date } = useParams<{ date: string }>()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { data: entry, isLoading } = useEntry(date ?? '')
  const { mutateAsync: updateEntry } = useUpdateEntry()

  const handleSubmit = async (values: { date: string; body: string }) => {
    if (!date) return
    try {
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
        <EntryForm
          defaultValues={{ date: entry.entry_date, body: entry.body }}
          onSubmit={handleSubmit}
          submitLabel="更新する"
          dateReadOnly
        />
      </div>
    </PageLayout>
  )
}
