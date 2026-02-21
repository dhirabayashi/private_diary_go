import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

export function Header() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      navigate(`/search?q=${encodeURIComponent(query.trim())}`)
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-stone-200 bg-white shadow-sm">
      <div className="mx-auto max-w-5xl px-4 py-3 flex items-center gap-4">
        <Link to="/" className="text-xl font-bold text-stone-800 shrink-0">
          📓 私の日記
        </Link>

        <nav className="hidden sm:flex items-center gap-1 text-sm">
          <Link to="/" className="rounded-md px-3 py-1.5 text-stone-600 hover:bg-stone-100">一覧</Link>
          <Link to="/new" className="rounded-md px-3 py-1.5 text-stone-600 hover:bg-stone-100">新規投稿</Link>
          <Link to="/import" className="rounded-md px-3 py-1.5 text-stone-600 hover:bg-stone-100">インポート</Link>
          <Link to="/export" className="rounded-md px-3 py-1.5 text-stone-600 hover:bg-stone-100">エクスポート</Link>
        </nav>

        <form onSubmit={handleSearch} className="ml-auto flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="キーワード検索..."
            className="rounded-md border border-stone-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-stone-500 w-48"
          />
          <button type="submit" className="rounded-md bg-stone-800 px-3 py-1.5 text-sm text-white hover:bg-stone-700">
            検索
          </button>
        </form>
      </div>
    </header>
  )
}
