import { useNavigate } from 'react-router-dom'
import { PageLayout } from '../components/layout/PageLayout'
import { EntryForm } from '../components/features/EntryForm'
import { useCreateEntry } from '../hooks/useEntries'
import { useToast } from '../components/ui/Toast'

export function NewEntryPage() {
  const navigate = useNavigate()
  const { mutateAsync: createEntry } = useCreateEntry()
  const { showToast } = useToast()

  const handleSubmit = async (values: { date: string; body: string }) => {
    try {
      const entry = await createEntry(values)
      showToast('日記を投稿しました')
      navigate(`/${entry.entry_date}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : '投稿に失敗しました'
      showToast(msg, 'error')
    }
  }

  return (
    <PageLayout title="新規投稿">
      <div className="max-w-2xl">
        <EntryForm onSubmit={handleSubmit} submitLabel="投稿する" />
      </div>
    </PageLayout>
  )
}
