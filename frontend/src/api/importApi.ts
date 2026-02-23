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

export interface ZipSkippedEntry {
  date: string
  reason: string
}

export interface ZipImportResult {
  imported: number
  skipped: ZipSkippedEntry[]
}

export async function importZip(file: File): Promise<ZipImportResult> {
  const form = new FormData()
  form.append('file', file)

  const res = await fetch('/api/import/zip', { method: 'POST', body: form })
  const json = await res.json()

  if (!res.ok) {
    throw new Error(json?.error?.message ?? 'import failed')
  }
  return json.data as ZipImportResult
}
