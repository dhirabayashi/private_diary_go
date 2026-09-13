import { useRef, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageLayout } from '../components/layout/PageLayout'
import { EntryForm, type EntryFormHandle } from '../components/features/EntryForm'
import { useEntry } from '../hooks/useEntries'
import { useToast } from '../components/ui/Toast'
import { today } from '../utils/date'

export function NewEntryPage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const formRef = useRef<EntryFormHandle>(null)
  const [selectedDate, setSelectedDate] = useState(today())

  // refetchOnWindowFocus: false — このクエリは「/newを開いた瞬間に既存投稿がないか確認する」
  // 用途のみなので継続的な再フェッチは不要。自動保存が作成した自分自身のエントリをバックグラウンド
  // 再フェッチで検知して誤って編集画面へ遷移することを防ぐ（下のisAutoCreated判定と合わせた多層防御）。
  const { data: existingEntry } = useEntry(selectedDate, { refetchOnWindowFocus: false })

  useEffect(() => {
    if (existingEntry && !formRef.current?.isAutoCreated()) {
      navigate(`/${existingEntry.entry_date}/edit`, { replace: true })
    }
  }, [existingEntry, navigate])

  const handleSubmit = async () => {
    try {
      await formRef.current?.save()
      const savedDate = formRef.current?.getCreatedDate()
      showToast('日記を投稿しました')
      navigate(`/${savedDate}`)
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
