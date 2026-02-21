import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { images } from '../api/images'

export function useImageUpload(date: string) {
  const qc = useQueryClient()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upload = async (files: File[]) => {
    setUploading(true)
    setError(null)
    try {
      for (const file of files) {
        await images.upload(date, file)
      }
      qc.invalidateQueries({ queryKey: ['entry', date] })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'upload failed')
    } finally {
      setUploading(false)
    }
  }

  const remove = async (id: number) => {
    await images.delete(id)
    qc.invalidateQueries({ queryKey: ['entry', date] })
  }

  return { upload, remove, uploading, error }
}
