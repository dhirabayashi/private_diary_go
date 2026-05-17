import { useSearchParams } from 'react-router-dom'

export function usePageParam() {
  const [searchParams, setSearchParams] = useSearchParams()
  const raw = Number(searchParams.get('page'))
  const page = Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1
  const setPage = (p: number) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (p === 1) next.delete('page')
      else next.set('page', String(p))
      return next
    })
  }
  return { page, setPage }
}
