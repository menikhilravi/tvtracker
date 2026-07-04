import { Link } from 'react-router-dom'
import type { SearchResult } from '../lib/types'
import { Poster } from './Poster'

// The key format shared by rails to mark titles already in the user's library.
export const trackedKey = (mediaType: string, id: number) => `${mediaType}-${id}`

// A horizontal, snap-scrolling rail of titles (used for Trending / discovery).
// Pass `trackedIds` (a set of `trackedKey(...)`) to dim and badge titles the
// user already tracks, so discovery surfaces mostly new things.
export function PosterRail({
  title,
  items,
  trackedIds,
}: {
  title: string
  items: SearchResult[]
  trackedIds?: Set<string>
}) {
  if (items.length === 0) return null
  return (
    <section className="mb-7">
      <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted">{title}</h2>
      <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 pb-1">
        {items.map((r) => {
          const isTracked = trackedIds?.has(trackedKey(r.media_type, r.id))
          return (
            <Link
              key={`${r.media_type}-${r.id}`}
              to={`/title/${r.media_type}/${r.id}`}
              className="w-28 shrink-0 active:scale-[0.97]"
            >
              <div className="relative">
                <Poster
                  path={r.posterPath}
                  alt={r.title}
                  size="w342"
                  className={`aspect-[2/3] w-28 shadow-lg shadow-black/40 ${
                    isTracked ? 'opacity-55' : ''
                  }`}
                />
                {isTracked && (
                  <span className="absolute left-1.5 top-1.5 rounded-md bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
                    ✓ Tracked
                  </span>
                )}
              </div>
              <p className="mt-1.5 truncate text-xs font-medium text-ink/90">{r.title}</p>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
