import type { Entry } from '../types/api'

export interface ImportResult {
  entry?: Entry
  needsConfirm: boolean
}

export async function importFile(file: File, overwrite = false): Promise<ImportResult> {
  const form = new FormData()
  form.append('file', file)
  if (overwrite) form.append('overwrite', 'true')

  const res = await fetch('/api/import', { method: 'POST', body: form })
  const json = await res.json()

  if (res.status === 409 && json?.error?.code === 'ALREADY_EXISTS') {
    return { needsConfirm: true }
  }
  if (!res.ok) {
    throw new Error(json?.error?.message ?? 'import failed')
  }
  return { entry: json.data as Entry, needsConfirm: false }
}
