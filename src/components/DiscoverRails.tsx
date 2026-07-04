import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  getTrending,
  getPopular,
  getTopRated,
  getGenres,
  discoverByGenre,
} from '../lib/tmdb'
import type { MediaType } from '../lib/types'
import { useFollows } from '../lib/tracking'
import { PosterRail, trackedKey } from './PosterRail'

// The full discovery surface shown on the Search empty state: fixed shelves
// (trending / popular / top-rated) plus a genre browser. Titles the user
// already tracks are dimmed via `trackedIds`.
export function DiscoverRails() {
  const { data: follows } = useFollows()
  const trackedIds = useMemo(
    () => new Set((follows ?? []).map((f) => trackedKey(f.media_type, f.tmdb_id))),
    [follows],
  )

  const trending = useQuery({ queryKey: ['trending', 'week'], queryFn: () => getTrending('week') })
  const popularTv = useQuery({ queryKey: ['popular', 'tv'], queryFn: () => getPopular('tv') })
  const popularMovie = useQuery({ queryKey: ['popular', 'movie'], queryFn: () => getPopular('movie') })
  const topTv = useQuery({ queryKey: ['top_rated', 'tv'], queryFn: () => getTopRated('tv') })
  const topMovie = useQuery({ queryKey: ['top_rated', 'movie'], queryFn: () => getTopRated('movie') })

  return (
    <div>
      <PosterRail title="Trending this week" items={trending.data ?? []} trackedIds={trackedIds} />
      <PosterRail title="Popular shows" items={popularTv.data ?? []} trackedIds={trackedIds} />
      <PosterRail title="Popular movies" items={popularMovie.data ?? []} trackedIds={trackedIds} />
      <PosterRail title="Top rated shows" items={topTv.data ?? []} trackedIds={trackedIds} />
      <PosterRail title="Top rated movies" items={topMovie.data ?? []} trackedIds={trackedIds} />
      <GenreBrowse trackedIds={trackedIds} />
    </div>
  )
}

function GenreBrowse({ trackedIds }: { trackedIds: Set<string> }) {
  const [mediaType, setMediaType] = useState<MediaType>('tv')
  const [genreId, setGenreId] = useState<number | null>(null)

  const { data: genres } = useQuery({
    queryKey: ['genres', mediaType],
    queryFn: () => getGenres(mediaType),
  })

  const selected = genres?.find((g) => g.id === genreId) ?? null
  const { data: results } = useQuery({
    queryKey: ['discover', mediaType, genreId],
    queryFn: () => discoverByGenre(mediaType, genreId as number),
    enabled: genreId !== null,
  })

  const switchMedia = (m: MediaType) => {
    setMediaType(m)
    setGenreId(null) // genre ids differ between movie and tv
  }

  return (
    <section className="mb-7">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-muted">Browse by genre</h2>
        <div className="flex gap-1 rounded-xl border border-line bg-surface/60 p-0.5 text-xs font-semibold">
          {(['tv', 'movie'] as MediaType[]).map((m) => (
            <button
              key={m}
              onClick={() => switchMedia(m)}
              className={`rounded-lg px-2.5 py-1 transition ${
                mediaType === m ? 'bg-brand-gradient text-white' : 'text-muted'
              }`}
            >
              {m === 'tv' ? 'TV' : 'Film'}
            </button>
          ))}
        </div>
      </div>

      <div className="no-scrollbar -mx-5 mb-4 flex gap-2 overflow-x-auto px-5 pb-1">
        {(genres ?? []).map((g) => (
          <button
            key={g.id}
            onClick={() => setGenreId((cur) => (cur === g.id ? null : g.id))}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition active:scale-95 ${
              genreId === g.id
                ? 'border-transparent bg-brand-gradient text-white'
                : 'border-line bg-surface/60 text-muted'
            }`}
          >
            {g.name}
          </button>
        ))}
      </div>

      {selected && (
        <PosterRail title={`Best ${selected.name}`} items={results ?? []} trackedIds={trackedIds} />
      )}
    </section>
  )
}
