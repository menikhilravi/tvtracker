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

interface Upcoming {
  tmdbId: number
  name: string | null
  posterPath: string | null
  season: number
  episode: number
  epName: string | null
  airDate: string
}

export function Calendar() {
  const { session } = useAuth()

  // Followed TV shows we should look for upcoming episodes on.
  const { data: shows } = useQuery({
    queryKey: ['calendar', 'shows'],
    enabled: Boolean(supabase && session),
    queryFn: async (): Promise<ShowRow[]> => {
      const { data, error } = await supabase!
        .from('follows')
        .select('tmdb_id, name, poster_path')
        .eq('media_type', 'tv')
        .in('status', ['watching', 'watchlist'])
      if (error) throw error
      return data as ShowRow[]
    },
  })

  // Fetch each show's detail (cached & shared with the detail screen) and pull
  // out its next scheduled episode.
  const details = useQueries({
    queries: (shows ?? []).map((s) => ({
      queryKey: ['title', 'tv', s.tmdb_id],
      queryFn: () => getTitle('tv', s.tmdb_id),
    })),
  })

  if (!session) {
    return <Empty title="Upcoming" message="Sign in to see upcoming episodes." />
  }

  const showById = new Map((shows ?? []).map((s) => [s.tmdb_id, s]))
  const today = new Date().toISOString().slice(0, 10)

  const upcoming: Upcoming[] = details
    .map((d) => d.data)
    .filter((d): d is NonNullable<typeof d> => Boolean(d?.nextEpisodeToAir?.airDate))
    .map((d) => {
      const next = d.nextEpisodeToAir!
      const s = showById.get(d.id)
      return {
        tmdbId: d.id,
        name: s?.name ?? d.title,
        posterPath: s?.poster_path ?? d.posterPath,
        season: next.seasonNumber,
        episode: next.episodeNumber,
        epName: next.name,
        airDate: next.airDate!,
      }
    })
    .filter((u) => u.airDate >= today)
    .sort((a, b) => a.airDate.localeCompare(b.airDate))

  const loading = details.some((d) => d.isLoading)

  // Group by air date.
  const groups = new Map<string, Upcoming[]>()
  for (const u of upcoming) {
    if (!groups.has(u.airDate)) groups.set(u.airDate, [])
    groups.get(u.airDate)!.push(u)
  }

  return (
    <div className="px-5 pt-14">
      <header className="mb-6">
        <p className="text-sm text-muted">Airing soon</p>
        <h1 className="text-3xl font-bold tracking-tight">Upcoming</h1>
      </header>

      {loading && upcoming.length === 0 && <p className="text-sm text-muted">Loading…</p>}

      {!loading && upcoming.length === 0 && (
        <Empty
          title=""
          message="No upcoming episodes for the shows you follow. Add more shows to your watchlist."
        />
      )}

      <div className="space-y-6">
        {[...groups.entries()].map(([date, items]) => (
          <section key={date}>
            <h2 className="mb-3 text-sm font-semibold text-brand">{formatDate(date)}</h2>
            <div className="space-y-2">
              {items.map((u) => (
                <Link
                  key={`${u.tmdbId}-${u.season}-${u.episode}`}
                  to={`/title/tv/${u.tmdbId}`}
                  className="flex items-center gap-3 rounded-2xl border border-line bg-surface/60 p-2.5 active:scale-[0.99]"
                >
                  <Poster path={u.posterPath} alt={u.name ?? ''} size="w200" className="h-16 w-11" rounded="rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{u.name}</p>
                    <p className="truncate text-xs text-muted">
                      S{u.season} · E{u.episode}
                      {u.epName ? ` — ${u.epName}` : ''}
                    </p>
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
