import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getSeason, getTitle } from '../lib/tmdb'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { airedProgress, computeNextUp, useEpisodeWatches, useToggleEpisode } from '../lib/tracking'
import type { TitleDetail } from '../lib/types'
import { Poster } from './Poster'
import type { ViewMode } from './ViewToggle'

interface WatchingRow {
  tmdb_id: number
  name: string | null
  poster_path: string | null
}

export function UpNextRail({ view = 'rail' }: { view?: ViewMode }) {
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

  const container =
    view === 'grid'
      ? 'grid grid-cols-2 gap-3'
      : view === 'list'
        ? 'space-y-2'
        : 'no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 pb-1'

  return (
    <section className="mb-7">
      <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted">Up next</h2>
      <div className={container}>
        {watching.map((w) => (
          <UpNextCard key={w.tmdb_id} row={w} view={view} />
        ))}
      </div>
    </section>
  )
}

function UpNextCard({ row, view }: { row: WatchingRow; view: ViewMode }) {
  const { data: detail } = useQuery({
    queryKey: ['title', 'tv', row.tmdb_id],
    queryFn: () => getTitle('tv', row.tmdb_id),
  })
  const watches = useEpisodeWatches(row.tmdb_id)
  const toggle = useToggleEpisode(
    detail ??
      ({
        id: row.tmdb_id,
        media_type: 'tv',
        title: row.name ?? '',
        posterPath: row.poster_path,
      } as TitleDetail),
  )

  const watchedSet = watches.data ?? new Set<string>()
  const nextUp = detail ? computeNextUp(detail, watchedSet) : null
  const progress = detail ? airedProgress(detail, watchedSet) : { done: 0, total: 0 }

  // The season fetch gives the episode's title for a richer card.
  const { data: episodes } = useQuery({
    queryKey: ['season', row.tmdb_id, nextUp?.season],
    queryFn: () => getSeason(row.tmdb_id, nextUp!.season),
    enabled: Boolean(nextUp),
  })
  const epName = episodes?.find((e) => e.episodeNumber === nextUp?.episode)?.name

  // Only render once we know the next episode. This hides caught-up shows and,
  // crucially, avoids briefly showing a show (from the follow row) that then
  // vanishes when its detail loads and reveals it's caught up.
  if (!detail || !nextUp) return null

  const bar =
    progress.total > 0 ? (
      <div className="h-1 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-brand-gradient"
          style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
        />
      </div>
    ) : null

  const markWatched = () =>
    nextUp && toggle.mutate({ season: nextUp.season, episode: nextUp.episode, watched: false })

  // List: horizontal row with a thumbnail and a compact ✓ button.
  if (view === 'list') {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface/60 p-2.5">
        <Link to={`/title/tv/${row.tmdb_id}`} className="shrink-0 active:scale-[0.98]">
          <Poster path={row.poster_path} alt={row.name ?? ''} size="w200" className="h-20 w-14" rounded="rounded-lg" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{row.name}</p>
          {nextUp && (
            <p className="truncate text-xs text-muted">
              S{nextUp.season} · E{nextUp.episode}
              {epName ? ` — ${epName}` : ''}
            </p>
          )}
          {bar && <div className="mt-1.5">{bar}</div>}
        </div>
        {nextUp && (
          <button
            onClick={markWatched}
            disabled={toggle.isPending}
            aria-label="Mark watched"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-gradient text-sm font-semibold text-white transition active:scale-90 disabled:opacity-60"
          >
            {toggle.isPending ? '…' : '✓'}
          </button>
        )}
      </div>
    )
  }

  // Rail & grid: a vertical card (rail is fixed-width & scrolls; grid fills).
  const posterWidth = view === 'rail' ? 'w-40' : 'w-full'
  return (
    <div className={view === 'rail' ? 'w-40 shrink-0' : 'w-full'}>
      <Link to={`/title/tv/${row.tmdb_id}`} className="block active:scale-[0.98]">
        <Poster
          path={row.poster_path}
          alt={row.name ?? ''}
          size="w342"
          className={`aspect-[2/3] ${posterWidth} shadow-lg shadow-black/40`}
        />
      </Link>
      <p className="mt-1.5 truncate text-sm font-medium">{row.name}</p>
      {bar && <div className="mt-1.5">{bar}</div>}
      {progress.total > 0 && (
        <p className="mt-1 text-[10px] text-faint">
          {progress.done}/{progress.total} episodes
        </p>
      )}
      {nextUp && (
        <>
          <p className="truncate text-xs text-muted">
            S{nextUp.season} · E{nextUp.episode}
            {epName ? ` — ${epName}` : ''}
          </p>
          <button
            onClick={markWatched}
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
