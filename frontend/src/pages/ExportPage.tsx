import { useState } from 'react'
import { PageLayout } from '../components/layout/PageLayout'
import { Button } from '../components/ui/Button'
import { Input, Label } from '../components/ui/Input'
import { triggerExport } from '../api/exportApi'

export function ExportPage() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const handleExport = () => {
    triggerExport(from || undefined, to || undefined)
  }

  return (
    <PageLayout title="データエクスポート">
      <div className="max-w-lg space-y-6">
        <p className="text-sm text-stone-600">
          日記データをZIPファイルとしてダウンロードします。期間を指定しない場合は全件エクスポートされます。
        </p>

        <div className="bg-white rounded-lg border border-stone-200 p-5 space-y-4">
          <div>
            <Label htmlFor="from">開始日（任意）</Label>
            <Input
              id="from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="to">終了日（任意）</Label>
            <Input
              id="to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs text-stone-500">ZIPの内容:</p>
          <pre className="text-xs bg-stone-100 rounded p-3 text-stone-600">
{`diary_export_YYYYMMDD_YYYYMMDD.zip
├── 20240101.txt
├── 20240315.txt
└── images/
    ├── 20240101/
    │   └── photo.jpg
    └── 20240315/
        └── photo.png`}
          </pre>
        </div>

        <Button onClick={handleExport} size="lg">
          ZIPをダウンロード
        </Button>
      </div>
    </PageLayout>
  )
}
