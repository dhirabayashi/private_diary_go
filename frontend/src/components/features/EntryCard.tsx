import { useNavigate } from 'react-router-dom'
import { Card } from '../ui/Card'
import { images } from '../../api/images'
import type { Entry } from '../../types/api'

interface EntryCardProps {
  entry: Entry
}

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-')
  return `${y}年${m}月${d}日`
}

export function EntryCard({ entry }: EntryCardProps) {
  const navigate = useNavigate()
  const thumbnail = entry.images?.[0]

  return (
    <Card onClick={() => navigate(`/${entry.entry_date}`)}>
      <div className="flex gap-4 p-4">
        {thumbnail && (
          <img
            src={images.url(thumbnail.filename)}
            alt={thumbnail.original_name}
            className="h-20 w-20 shrink-0 rounded-md object-cover"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-stone-500 mb-1">
            {formatDate(entry.entry_date)}
          </p>
          <p className="text-stone-700 line-clamp-3 text-sm leading-relaxed">
            {entry.preview ?? entry.body}
          </p>
        </div>
      </div>
    </Card>
  )
}
