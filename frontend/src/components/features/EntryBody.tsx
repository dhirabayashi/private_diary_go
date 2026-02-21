// Renders diary body text with URLs converted to clickable links.
// Uses textContent approach to avoid XSS.

const URL_RE = /https?:\/\/[^\s<>"{}|\\^\[\]`]+/g

interface Segment {
  type: 'text' | 'url'
  value: string
}

function parseBody(text: string): Segment[] {
  const segments: Segment[] = []
  let last = 0
  let match: RegExpExecArray | null
  URL_RE.lastIndex = 0
  while ((match = URL_RE.exec(text)) !== null) {
    if (match.index > last) {
      segments.push({ type: 'text', value: text.slice(last, match.index) })
    }
    segments.push({ type: 'url', value: match[0] })
    last = match.index + match[0].length
  }
  if (last < text.length) {
    segments.push({ type: 'text', value: text.slice(last) })
  }
  return segments
}

export function EntryBody({ body }: { body: string }) {
  const segments = parseBody(body)
  return (
    <div className="whitespace-pre-wrap leading-relaxed text-stone-800 break-words">
      {segments.map((seg, i) =>
        seg.type === 'url' ? (
          <a
            key={i}
            href={seg.value}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline hover:text-blue-800 break-all"
          >
            {seg.value}
          </a>
        ) : (
          <span key={i}>{seg.value}</span>
        ),
      )}
    </div>
  )
}
