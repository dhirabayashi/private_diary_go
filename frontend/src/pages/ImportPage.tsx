import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageLayout } from '../components/layout/PageLayout'
import { Button } from '../components/ui/Button'
import { useToast } from '../components/ui/Toast'
import { importFile, importZip } from '../api/importApi'
import type { ZipImportResult } from '../api/importApi'

export function ImportPage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)

  const zipInputRef = useRef<HTMLInputElement>(null)
  const [zipFile, setZipFile] = useState<File | null>(null)
  const [zipLoading, setZipLoading] = useState(false)
  const [zipResult, setZipResult] = useState<ZipImportResult | null>(null)

  const handleFile = (f: File) => {
    if (!f.name.endsWith('.txt')) {
      showToast('.txt ファイルのみ対応しています', 'error')
      return
    }
    setFile(f)
    setPendingFile(null)
  }

  const handleZipFile = (f: File) => {
    if (!f.name.toLowerCase().endsWith('.zip')) {
      showToast('.zip ファイルのみ対応しています', 'error')
      return
    }
    setZipFile(f)
    setZipResult(null)
  }

  const doZipImport = async () => {
    if (!zipFile) return
    setZipLoading(true)
    try {
      const result = await importZip(zipFile)
      setZipResult(result)
      if (result.imported > 0) {
        showToast(`${result.imported}件インポートしました`)
      } else {
        showToast('インポートできる日記がありませんでした', 'error')
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'インポートに失敗しました', 'error')
    } finally {
      setZipLoading(false)
    }
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
    <PageLayout title="インポート">
      <div className="max-w-lg space-y-10">

        {/* ZIP bulk import */}
        <section className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-stone-800">ZIP一括インポート</h2>
            <p className="text-sm text-stone-600 mt-1">
              <code className="bg-stone-100 px-1 rounded">yyyyMMdd.txt</code> ファイルを含むZIPをアップロードすると、
              一括で登録されます。ディレクトリ構造は無視されます。
            </p>
          </div>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const f = e.dataTransfer.files[0]
              if (f) handleZipFile(f)
            }}
            onClick={() => zipInputRef.current?.click()}
            className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-stone-300
              p-10 cursor-pointer hover:border-stone-400 hover:bg-stone-50 transition-colors"
          >
            <svg className="h-10 w-10 text-stone-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
            </svg>
            {zipFile ? (
              <p className="text-sm font-medium text-stone-700">{zipFile.name}</p>
            ) : (
              <>
                <p className="text-sm text-stone-500">クリックまたはドラッグ&ドロップ</p>
                <p className="text-xs text-stone-400 mt-1">.zip ファイル</p>
              </>
            )}
          </div>

          <input
            ref={zipInputRef}
            type="file"
            accept=".zip"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleZipFile(f)
              e.target.value = ''
            }}
          />

          {zipFile && !zipResult && (
            <Button onClick={doZipImport} loading={zipLoading}>
              一括インポートする
            </Button>
          )}

          {zipResult && (
            <div className="space-y-3">
              <p className="text-sm text-stone-700">
                <span className="font-semibold">{zipResult.imported}件</span> インポートしました。
              </p>
              {zipResult.skipped.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-2">
                  <p className="text-sm font-medium text-amber-800">
                    以下の日付はスキップされました（既に日記が存在します）
                  </p>
                  <ul className="text-sm text-amber-700 space-y-1">
                    {zipResult.skipped.map((s) => (
                      <li key={s.date}>{s.date}</li>
                    ))}
                  </ul>
                </div>
              )}
              <Button variant="secondary" onClick={() => { setZipFile(null); setZipResult(null) }}>
                別のファイルをインポート
              </Button>
            </div>
          )}
        </section>

        <hr className="border-stone-200" />

        {/* Single file import */}
        <section className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-stone-800">単一ファイルインポート</h2>
            <p className="text-sm text-stone-600 mt-1">
              <code className="bg-stone-100 px-1 rounded">yyyyMMdd.txt</code> 形式のファイルをアップロードすると、
              ファイル名の日付で日記として登録されます。
            </p>
          </div>

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
              e.target.value = ''
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
        </section>

      </div>
    </PageLayout>
  )
}
