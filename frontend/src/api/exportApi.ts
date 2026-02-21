export function triggerExport(from?: string, to?: string) {
  const params = new URLSearchParams()
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  const qs = params.toString()
  window.location.href = `/api/export${qs ? '?' + qs : ''}`
}
