import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageLayout } from '../components/layout/PageLayout'
import { Button } from '../components/ui/Button'
import { useToast } from '../components/ui/Toast'
import { importFile } from '../api/importApi'

export function ImportPage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)

  const handleFile = (f: File) => {
    if (!f.name.endsWith('.txt')) {
      showToast('.txt ファイルのみ対応しています', 'error')
      return
    }
    setFile(f)
    setPendingFile(null)
  }

  const doImport = async (f: File, overwrite = false) => {
    setLoading(true)
    try {
      const result = await importFile(f, overwrite)
      if (result.needsConfirm) {
        setPendingFile(f)
        return
      }
      showToast(`${f.name} をインポートしました`)
      if (result.entry) navigate(`/${result.entry.entry_date}`)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'インポートに失敗しました', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <PageLayout title="テキストインポート">
      <div className="max-w-lg space-y-6">
        <p className="text-sm text-stone-600">
          <code className="bg-stone-100 px-1 rounded">yyyyMMdd.txt</code> 形式のファイルをアップロードすると、
          ファイル名の日付で日記として登録されます。
        </p>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            const f = e.dataTransfer.files[0]
            if (f) handleFile(f)
          }}
          onClick={() => inputRef.current?.click()}
          className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-stone-300
            p-10 cursor-pointer hover:border-stone-400 hover:bg-stone-50 transition-colors"
        >
          <svg className="h-10 w-10 text-stone-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          {file ? (
            <p className="text-sm font-medium text-stone-700">{file.name}</p>
          ) : (
            <>
              <p className="text-sm text-stone-500">クリックまたはドラッグ&ドロップ</p>
              <p className="text-xs text-stone-400 mt-1">.txt ファイル</p>
            </>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".txt"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleFile(f)
          }}
        />

        {file && !pendingFile && (
          <Button onClick={() => doImport(file)} loading={loading}>
            インポートする
          </Button>
        )}

        {/* Overwrite confirmation */}
        {pendingFile && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
            <p className="text-sm font-medium text-amber-800">
              この日付にはすでに日記が存在します。上書きしますか？
            </p>
            <div className="flex gap-3">
              <Button onClick={() => doImport(pendingFile, true)} loading={loading} variant="danger">
                上書きする
              </Button>
              <Button variant="secondary" onClick={() => { setPendingFile(null); setFile(null) }}>
                キャンセル
              </Button>
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  )
}
