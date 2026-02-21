import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { entries, type ListParams } from '../api/entries'

export function useEntries(params: ListParams = {}) {
  return useQuery({
    queryKey: ['entries', params],
    queryFn: () => entries.list(params),
  })
}

export function useEntry(date: string) {
  return useQuery({
    queryKey: ['entry', date],
    queryFn: () => entries.getByDate(date),
    enabled: !!date,
  })
}

export function useCreateEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: entries.create,
    onSuccess: (entry) => {
      qc.invalidateQueries({ queryKey: ['entries'] })
      qc.invalidateQueries({ queryKey: ['entry', entry.entry_date] })
    },
  })
}

export function useUpdateEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ date, body }: { date: string; body: string }) =>
      entries.update(date, body),
    onSuccess: (_data, { date }) => {
      qc.invalidateQueries({ queryKey: ['entries'] })
      qc.invalidateQueries({ queryKey: ['entry', date] })
    },
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
