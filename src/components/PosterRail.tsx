import { Link } from 'react-router-dom'
import type { SearchResult } from '../lib/types'
import { Poster } from './Poster'

// A horizontal, snap-scrolling rail of titles (used for Trending / discovery).
export function PosterRail({ title, items }: { title: string; items: SearchResult[] }) {
  if (items.length === 0) return null
  return (
    <section className="mb-7">
      <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted">{title}</h2>
      <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 pb-1">
        {items.map((r) => (
          <Link
            key={`${r.media_type}-${r.id}`}
            to={`/title/${r.media_type}/${r.id}`}
            className="w-28 shrink-0 active:scale-[0.97]"
          >
            <Poster
              path={r.posterPath}
              alt={r.title}
              size="w342"
              className="aspect-[2/3] w-28 shadow-lg shadow-black/40"
            />
            <p className="mt-1.5 truncate text-xs font-medium text-ink/90">{r.title}</p>
          </Link>
        ))}
      </div>
    </section>
  )
}
