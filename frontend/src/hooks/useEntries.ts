import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { entries, type ListParams } from '../api/entries'

export function useEntries(params: ListParams = {}) {
  return useQuery({
    queryKey: ['entries', params],
    queryFn: () => entries.list(params),
  })
}

export function useEntry(date: string, options?: { refetchOnWindowFocus?: boolean }) {
  return useQuery({
    queryKey: ['entry', date],
    queryFn: () => entries.getByDate(date),
    enabled: !!date,
    retry: false,
    refetchOnWindowFocus: options?.refetchOnWindowFocus ?? true,
  })
}

export function useDeleteEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: entries.delete,
    onSuccess: (_data, date) => {
      qc.invalidateQueries({ queryKey: ['entries'] })
      qc.removeQueries({ queryKey: ['entry', date] })
    },
  })
}
