import { useParams, useNavigate, Link } from 'react-router-dom'
import { PageLayout } from '../components/layout/PageLayout'
import { EntryBody } from '../components/features/EntryBody'
import { ImageUploader } from '../components/features/ImageUploader'
import { Button } from '../components/ui/Button'
import { useEntry, useDeleteEntry } from '../hooks/useEntries'
import { useImageUpload } from '../hooks/useImageUpload'
import { useToast } from '../components/ui/Toast'
import { entries } from '../api/entries'
import { images } from '../api/images'

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-')
  return `${y}年${m}月${d}日`
}

export function EntryDetailPage() {
  const { date } = useParams<{ date: string }>()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { data: entry, isLoading, isError } = useEntry(date ?? '')
  const { mutateAsync: deleteEntry } = useDeleteEntry()
  const { upload, remove, uploading } = useImageUpload(date ?? '')

  const handleDelete = async () => {
    if (!date || !confirm('この日記を削除しますか？')) return
    try {
      await deleteEntry(date)
      showToast('日記を削除しました')
      navigate('/')
    } catch {
      showToast('削除に失敗しました', 'error')
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

  if (isError || !entry) {
    return (
      <PageLayout>
        <p className="text-center text-red-600 py-12">日記が見つかりませんでした。</p>
      </PageLayout>
    )
  }

  return (
    <PageLayout>
      <article className="max-w-2xl">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <time className="text-sm font-medium text-stone-500">{formatDate(entry.entry_date)}</time>
            <h1 className="text-2xl font-bold text-stone-800 mt-1">{formatDate(entry.entry_date)}の日記</h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => entries.exportSingle(entry.entry_date)}
            >
              ダウンロード
            </Button>
            <Link to={`/${entry.entry_date}/edit`}>
              <Button variant="secondary" size="sm">編集</Button>
            </Link>
            <Button variant="danger" size="sm" onClick={handleDelete}>
              削除
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="rounded-lg border border-stone-200 bg-white p-6 mb-6">
          <EntryBody body={entry.body} />
        </div>

        {/* Images */}
        {(entry.images ?? []).length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-medium text-stone-600 mb-3">添付画像</h2>
            <div className="flex flex-wrap gap-3">
              {entry.images!.map((img) => (
                <div key={img.id} className="relative group">
                  <img
                    src={images.url(img.filename)}
                    alt={img.original_name}
                    className="h-32 w-32 rounded-md object-cover border border-stone-200"
                  />
                  <button
                    onClick={() => remove(img.id)}
                    className="absolute -top-2 -right-2 hidden group-hover:flex h-5 w-5 items-center justify-center
                      rounded-full bg-red-600 text-white text-xs font-bold shadow"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Image upload */}
        <div>
          <h2 className="text-sm font-medium text-stone-600 mb-3">画像を追加</h2>
          <ImageUploader
            entryImages={[]}
            onUpload={upload}
            onDelete={remove}
            uploading={uploading}
          />
        </div>
      </article>
    </PageLayout>
  )
}
