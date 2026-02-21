import { useState } from 'react'
import { PageLayout } from '../components/layout/PageLayout'
import { EntryCard } from '../components/features/EntryCard'
import { Pagination } from '../components/ui/Pagination'
import { useEntries } from '../hooks/useEntries'

export function TopPage() {
  const [page, setPage] = useState(1)
  const { data, isLoading, isError } = useEntries({ page, page_size: 10 })

  return (
    <PageLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-stone-800">日記一覧</h1>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-stone-300 border-t-stone-700" />
        </div>
      )}

      {isError && (
        <p className="text-center text-red-600 py-12">読み込みに失敗しました。</p>
      )}

      {data && (
        <>
          {(data.entries ?? []).length === 0 ? (
            <p className="text-center text-stone-400 py-12">まだ日記がありません。</p>
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
