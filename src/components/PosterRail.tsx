import { Link } from 'react-router-dom'
import type { SearchResult } from '../lib/types'
import { trackedKey, type FollowStatus } from '../lib/tracking'
import { Poster } from './Poster'
import { PosterStatusBadge, isSettled } from './StatusBadge'

// A horizontal, snap-scrolling rail of titles (used for Trending / discovery).
// Pass `statusByKey` (see useFollowStatusMap) to badge titles already in the
// user's library with what they are to them — watching, watchlist, finished —
// rather than a flat "tracked".
export function PosterRail({
  title,
  items,
  statusByKey,
}: {
  title: string
  items: SearchResult[]
  statusByKey?: Map<string, FollowStatus>
}) {
  if (items.length === 0) return null
  return (
    <section className="mb-7">
      <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted">{title}</h2>
      <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 pb-1">
        {items.map((r) => {
          const status = statusByKey?.get(trackedKey(r.media_type, r.id))
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
                    isSettled(status) ? 'opacity-55' : ''
                  }`}
                />
                <PosterStatusBadge status={status} mediaType={r.media_type} />
              </div>
              <p className="mt-1.5 truncate text-xs font-medium text-ink/90">{r.title}</p>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
