import { useRef, useState } from 'react'
import { images } from '../../api/images'
import type { Image } from '../../types/api'

const ACCEPTED = '.jpg,.jpeg,.png,.gif,.webp'
const MAX_SIZE = 20 * 1024 * 1024 // 20MB

interface ImageUploaderProps {
  entryImages: Image[]
  onUpload: (files: File[]) => Promise<void>
  onDelete: (id: number) => Promise<void>
  uploading: boolean
}

export function ImageUploader({ entryImages, onUpload, onDelete, uploading }: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const validate = (files: FileList | File[]): File[] => {
    const valid: File[] = []
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('image/')) {
        setLocalError(`${f.name}: 画像ファイルのみ対応しています`)
        continue
      }
      if (f.size > MAX_SIZE) {
        setLocalError(`${f.name}: ファイルサイズが大きすぎます（最大20MB）`)
        continue
      }
      valid.push(f)
    }
    return valid
  }

  const handleFiles = async (files: FileList | File[]) => {
    setLocalError(null)
    const valid = validate(files)
    if (valid.length > 0) await onUpload(valid)
  }

  return (
    <div className="space-y-3">
      {/* Existing images */}
      {entryImages.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {entryImages.map((img) => (
            <div key={img.id} className="relative group">
              <img
                src={images.url(img.filename)}
                alt={img.original_name}
                className="h-24 w-24 rounded-md object-cover border border-stone-200"
              />
              <button
                type="button"
                onClick={() => onDelete(img.id)}
                className="absolute -top-2 -right-2 hidden group-hover:flex h-5 w-5 items-center justify-center
                  rounded-full bg-red-600 text-white text-xs font-bold shadow"
              >
                ×
              </button>
              <p className="text-xs text-stone-500 mt-1 truncate w-24">{img.original_name}</p>
            </div>
          ))}
        </div>
      )}

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          handleFiles(e.dataTransfer.files)
        }}
        onClick={() => inputRef.current?.click()}
        className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 cursor-pointer transition-colors
          ${dragOver ? 'border-stone-500 bg-stone-100' : 'border-stone-300 hover:border-stone-400 hover:bg-stone-50'}`}
      >
        {uploading ? (
          <p className="text-sm text-stone-500">アップロード中...</p>
        ) : (
          <>
            <svg className="h-8 w-8 text-stone-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-sm text-stone-500">クリックまたはドラッグ&ドロップで画像を追加</p>
            <p className="text-xs text-stone-400 mt-1">JPEG, PNG, GIF, WebP（複数可）</p>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        multiple
        className="hidden"
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />

      {localError && <p className="text-sm text-red-600">{localError}</p>}
    </div>
  )
}
