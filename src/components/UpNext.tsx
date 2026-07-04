import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getSeason, getTitle } from '../lib/tmdb'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { computeNextUp, useEpisodeWatches, useToggleEpisode } from '../lib/tracking'
import type { TitleDetail } from '../lib/types'
import { Poster } from './Poster'

interface WatchingRow {
  tmdb_id: number
  name: string | null
  poster_path: string | null
}

export function UpNextRail() {
  const { session } = useAuth()

  const { data: watching } = useQuery({
    queryKey: ['up-next', 'shows'],
    enabled: Boolean(supabase && session),
    queryFn: async (): Promise<WatchingRow[]> => {
      const { data, error } = await supabase!
        .from('follows')
        .select('tmdb_id, name, poster_path')
        .eq('media_type', 'tv')
        .eq('status', 'watching')
        .order('updated_at', { ascending: false })
      if (error) throw error
      return data as WatchingRow[]
    },
  })

  if (!watching || watching.length === 0) return null

  return (
    <section className="mb-7">
      <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted">Up next</h2>
      <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 pb-1">
        {watching.map((w) => (
          <UpNextCard key={w.tmdb_id} row={w} />
        ))}
      </div>
    </section>
  )
}

function UpNextCard({ row }: { row: WatchingRow }) {
  const { data: detail } = useQuery({
    queryKey: ['title', 'tv', row.tmdb_id],
    queryFn: () => getTitle('tv', row.tmdb_id),
  })
  const watches = useEpisodeWatches(row.tmdb_id)
  const toggle = useToggleEpisode(
    detail ?? {
      id: row.tmdb_id,
      media_type: 'tv',
      title: row.name ?? '',
      posterPath: row.poster_path,
    } as TitleDetail,
  )

  const nextUp = detail ? computeNextUp(detail, watches.data ?? new Set()) : null

  // The season fetch gives the episode's title for a richer card.
  const { data: episodes } = useQuery({
    queryKey: ['season', row.tmdb_id, nextUp?.season],
    queryFn: () => getSeason(row.tmdb_id, nextUp!.season),
    enabled: Boolean(nextUp),
  })
  const epName = episodes?.find((e) => e.episodeNumber === nextUp?.episode)?.name

  // Caught up (or still loading detail) — nothing to show here.
  if (detail && !nextUp) return null

  return (
    <div className="w-40 shrink-0">
      <Link to={`/title/tv/${row.tmdb_id}`} className="block active:scale-[0.98]">
        <Poster
          path={row.poster_path}
          alt={row.name ?? ''}
          size="w342"
          className="aspect-[2/3] w-40 shadow-lg shadow-black/40"
        />
      </Link>
      <p className="mt-1.5 truncate text-sm font-medium">{row.name}</p>
      {nextUp && (
        <>
          <p className="truncate text-xs text-muted">
            S{nextUp.season} · E{nextUp.episode}
            {epName ? ` — ${epName}` : ''}
          </p>
          <button
            onClick={() =>
              toggle.mutate({ season: nextUp.season, episode: nextUp.episode, watched: false })
            }
            disabled={toggle.isPending}
            className="mt-2 w-full rounded-xl bg-brand-gradient py-2 text-xs font-semibold shadow-md shadow-brand/20 transition active:scale-[0.97] disabled:opacity-60"
          >
            {toggle.isPending ? '…' : '✓ Watched'}
          </button>
        </>
      )}
    </div>
  )
}
