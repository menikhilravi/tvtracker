import { useQueries, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getTitle } from '../lib/tmdb'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Poster } from '../components/Poster'

interface ShowRow {
  tmdb_id: number
  name: string | null
  poster_path: string | null
}

// A unified timeline entry: either a TV episode airing or a movie release.
interface Upcoming {
  key: string
  mediaType: 'tv' | 'movie'
  tmdbId: number
  name: string | null
  posterPath: string | null
  date: string
  subtitle: string
}

// Followed rows of one media type we should look for upcoming dates on.
function useFollowedForCalendar(mediaType: 'tv' | 'movie', session: unknown) {
  return useQuery({
    queryKey: ['calendar', mediaType],
    enabled: Boolean(supabase && session),
    queryFn: async (): Promise<ShowRow[]> => {
      const { data, error } = await supabase!
        .from('follows')
        .select('tmdb_id, name, poster_path')
        .eq('media_type', mediaType)
        .in('status', ['watching', 'watchlist'])
      if (error) throw error
      return data as ShowRow[]
    },
  })
}

export function Calendar() {
  const { session } = useAuth()

  const { data: shows } = useFollowedForCalendar('tv', session)
  const { data: movies } = useFollowedForCalendar('movie', session)

  // Fetch each title's detail (cached & shared with the detail screen) and pull
  // out its next scheduled episode (TV) or release date (movie).
  const tvDetails = useQueries({
    queries: (shows ?? []).map((s) => ({
      queryKey: ['title', 'tv', s.tmdb_id],
      queryFn: () => getTitle('tv', s.tmdb_id),
    })),
  })
  const movieDetails = useQueries({
    queries: (movies ?? []).map((m) => ({
      queryKey: ['title', 'movie', m.tmdb_id],
      queryFn: () => getTitle('movie', m.tmdb_id),
    })),
  })

  if (!session) {
    return <Empty title="Upcoming" message="Sign in to see upcoming episodes and releases." />
  }

  const showById = new Map((shows ?? []).map((s) => [s.tmdb_id, s]))
  const movieById = new Map((movies ?? []).map((m) => [m.tmdb_id, m]))
  const today = new Date().toISOString().slice(0, 10)

  const upcomingTv: Upcoming[] = tvDetails
    .map((d) => d.data)
    .filter((d): d is NonNullable<typeof d> => Boolean(d?.nextEpisodeToAir?.airDate))
    .map((d) => {
      const next = d.nextEpisodeToAir!
      const s = showById.get(d.id)
      return {
        key: `tv-${d.id}-${next.seasonNumber}-${next.episodeNumber}`,
        mediaType: 'tv' as const,
        tmdbId: d.id,
        name: s?.name ?? d.title,
        posterPath: s?.poster_path ?? d.posterPath,
        date: next.airDate!,
        subtitle: `S${next.seasonNumber} · E${next.episodeNumber}${next.name ? ` — ${next.name}` : ''}`,
      }
    })

  const upcomingMovies: Upcoming[] = movieDetails
    .map((d) => d.data)
    .filter((d): d is NonNullable<typeof d> => Boolean(d?.releaseDate))
    .map((d) => {
      const m = movieById.get(d.id)
      return {
        key: `movie-${d.id}`,
        mediaType: 'movie' as const,
        tmdbId: d.id,
        name: m?.name ?? d.title,
        posterPath: m?.poster_path ?? d.posterPath,
        date: d.releaseDate!,
        subtitle: '🎬 Movie release',
      }
    })

  const upcoming = [...upcomingTv, ...upcomingMovies]
    .filter((u) => u.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))

  const loading = tvDetails.some((d) => d.isLoading) || movieDetails.some((d) => d.isLoading)

  // Group by date.
  const groups = new Map<string, Upcoming[]>()
  for (const u of upcoming) {
    if (!groups.has(u.date)) groups.set(u.date, [])
    groups.get(u.date)!.push(u)
  }

  return (
    <div className="px-5 pt-14">
      <header className="mb-6">
        <p className="text-sm text-muted">Airing & releasing soon</p>
        <h1 className="text-3xl font-bold tracking-tight">Upcoming</h1>
      </header>

      {loading && upcoming.length === 0 && <p className="text-sm text-muted">Loading…</p>}

      {!loading && upcoming.length === 0 && (
        <Empty
          title=""
          message="Nothing upcoming for the shows and movies you follow. Add more to your watchlist."
        />
      )}

      <div className="space-y-6">
        {[...groups.entries()].map(([date, items]) => (
          <section key={date}>
            <h2 className="mb-3 text-sm font-semibold text-brand">{formatDate(date)}</h2>
            <div className="space-y-2">
              {items.map((u) => (
                <Link
                  key={u.key}
                  to={`/title/${u.mediaType}/${u.tmdbId}`}
                  className="flex items-center gap-3 rounded-2xl border border-line bg-surface/60 p-2.5 active:scale-[0.99]"
                >
                  <Poster path={u.posterPath} alt={u.name ?? ''} size="w200" className="h-16 w-11" rounded="rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{u.name}</p>
                    <p className="truncate text-xs text-muted">{u.subtitle}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function Empty({ title, message }: { title: string; message: string }) {
  return (
    <div className="px-5 pt-14">
      {title && <h1 className="mb-6 text-3xl font-bold tracking-tight">{title}</h1>}
      <div className="mt-10 rounded-3xl border border-line bg-surface/60 p-8 text-center">
        <div className="text-4xl">🗓️</div>
        <p className="mt-3 text-sm text-muted">{message}</p>
      </div>
    </div>
  )
}

function formatDate(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
}
