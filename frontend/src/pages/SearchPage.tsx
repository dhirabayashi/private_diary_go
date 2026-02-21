import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageLayout } from '../components/layout/PageLayout'
import { EntryCard } from '../components/features/EntryCard'
import { Pagination } from '../components/ui/Pagination'
import { Input, Label } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { useEntries } from '../hooks/useEntries'

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [q, setQ] = useState(searchParams.get('q') ?? '')
  const [from, setFrom] = useState(searchParams.get('from') ?? '')
  const [to, setTo] = useState(searchParams.get('to') ?? '')
  const [page, setPage] = useState(1)

  const query = searchParams.get('q') ?? ''
  const fromParam = searchParams.get('from') ?? ''
  const toParam = searchParams.get('to') ?? ''

  const { data, isLoading } = useEntries({
    q: query || undefined,
    from: fromParam || undefined,
    to: toParam || undefined,
    page,
    page_size: 10,
  })

  useEffect(() => { setPage(1) }, [query, fromParam, toParam])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const params: Record<string, string> = {}
    if (q) params.q = q
    if (from) params.from = from
    if (to) params.to = to
    setSearchParams(params)
    setPage(1)
  }

  return (
    <PageLayout title="検索">
      <form onSubmit={handleSearch} className="bg-white rounded-lg border border-stone-200 p-4 mb-6 space-y-4">
        <div>
          <Label htmlFor="q">キーワード</Label>
          <Input
            id="q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="本文を検索..."
          />
        </div>
        <div className="flex gap-4">
          <div className="flex-1">
            <Label htmlFor="from">開始日</Label>
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="flex-1">
            <Label htmlFor="to">終了日</Label>
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <Button type="submit">検索する</Button>
      </form>

      {isLoading && (
        <div className="flex justify-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-stone-300 border-t-stone-700" />
        </div>
      )}

      {data && (
        <>
          <p className="text-sm text-stone-500 mb-4">
            {data.total} 件見つかりました
          </p>
          {(data.entries ?? []).length === 0 ? (
            <p className="text-center text-stone-400 py-8">該当する日記がありません。</p>
          ) : (
            <div className="space-y-3">
              {(data.entries ?? []).map((entry) => (
                <EntryCard key={entry.id} entry={entry} />
              ))}
            </div>
          )}
          <Pagination
            page={page}
            pageSize={data.page_size}
            total={data.total}
            onChange={setPage}
          />
        </>
      )}
    </PageLayout>
  )
}
