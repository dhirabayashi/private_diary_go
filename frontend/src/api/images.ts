import type { Image } from '../types/api'

export const images = {
  upload: async (date: string, file: File): Promise<Image> => {
    const form = new FormData()
    form.append('image', file)
    const res = await fetch(`/api/entries/${date}/images`, {
      method: 'POST',
      body: form,
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json?.error?.message ?? 'upload failed')
    return json.data as Image
  },

  delete: (id: number) =>
    fetch(`/api/images/${id}`, { method: 'DELETE' }),

  url: (filename: string) => `/data/images/${filename}`,
}
