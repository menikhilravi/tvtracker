import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Poster } from '../components/Poster'
import { UpNextRail } from '../components/UpNext'
import { PosterRail } from '../components/PosterRail'
import { getTrending } from '../lib/tmdb'
import type { MediaType } from '../lib/types'

interface FollowRow {
  tmdb_id: number
  media_type: MediaType
  status: string
  name: string | null
  poster_path: string | null
  updated_at: string
}

type MediaFilter = 'all' | 'tv' | 'movie'
type SortKey = 'recent' | 'title'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'recent', label: 'Recently added' },
  { key: 'title', label: 'Title (A–Z)' },
]

function sortRows(rows: FollowRow[], sort: SortKey) {
  const items = [...rows]
  if (sort === 'title') return items.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
  return items.sort((a, b) => b.updated_at.localeCompare(a.updated_at))
}

export function Home() {
  const { session, loading } = useAuth()
  const [filter, setFilter] = useState<MediaFilter>('all')
  const [watchlistSort, setWatchlistSort] = useState<SortKey>('recent')

  const { data: follows } = useQuery({
    queryKey: ['follows'],
    enabled: Boolean(supabase && session),
    queryFn: async (): Promise<FollowRow[]> => {
      const { data, error } = await supabase!
        .from('follows')
        .select('tmdb_id, media_type, status, name, poster_path, updated_at')
        .order('updated_at', { ascending: false })
      if (error) throw error
      return data as FollowRow[]
    },
  })

  const { data: trending } = useQuery({
    queryKey: ['trending', 'week'],
    queryFn: () => getTrending('week'),
  })

  if (loading) {
    return <p className="p-6 text-sm text-muted">Loading…</p>
  }

  if (!session) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-8 text-center">
        <div className="grid h-20 w-20 place-items-center rounded-3xl bg-brand-gradient text-4xl shadow-2xl shadow-brand/30">
          📺
        </div>
        <h1 className="mt-6 text-2xl font-bold tracking-tight">TV Tracker</h1>
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted">
          Your shows and movies, all in one place. Track what you watch, pick up
          where you left off.
        </p>
        <Link
          to="/profile"
          className="mt-8 w-full max-w-xs rounded-2xl bg-brand-gradient py-3.5 text-center font-semibold shadow-lg shadow-brand/25 active:scale-[0.98]"
        >
          Sign in
        </Link>
        <Link to="/search" className="mt-4 text-sm text-muted underline-offset-4 hover:underline">
          or just browse →
        </Link>
      </div>
    )
  }

  const active = follows?.filter((f) => f.status === 'watching' || f.status === 'watchlist') ?? []
  const shows = active.filter((f) => f.media_type === 'tv')
  const movies = active.filter((f) => f.media_type === 'movie')

  const inFilter = (f: FollowRow) => filter === 'all' || f.media_type === filter
  const watching = active.filter((f) => f.status === 'watching' && inFilter(f))
  const watchlist = sortRows(
    active.filter((f) => f.status === 'watchlist' && inFilter(f)),
    watchlistSort,
  )

  return (
    <div className="px-5 pt-14">
      <header className="mb-6">
        <p className="text-sm text-muted">Welcome back</p>
        <h1 className="text-3xl font-bold tracking-tight">Your library</h1>
      </header>

      <div className="mb-7 grid grid-cols-2 gap-3">
        <Link
          to="/calendar"
          className="flex items-center gap-2 rounded-2xl border border-line bg-surface/60 px-4 py-3 text-sm font-medium active:scale-[0.98]"
        >
          🗓️ Upcoming
        </Link>
        <Link
          to="/history"
          className="flex items-center gap-2 rounded-2xl border border-line bg-surface/60 px-4 py-3 text-sm font-medium active:scale-[0.98]"
        >
          🕑 History
        </Link>
      </div>

      {active.length > 0 && (
        <div className="mb-6 grid grid-cols-3 gap-3">
          <Stat label="Watching" value={active.filter((f) => f.status === 'watching').length} />
          <Stat label="Shows" value={shows.length} />
          <Stat label="Movies" value={movies.length} />
        </div>
      )}

      <UpNextRail />

      {active.length > 0 && (
        <MediaTabs
          filter={filter}
          onChange={setFilter}
          showCount={shows.length}
          movieCount={movies.length}
        />
      )}

      <Shelf title="Continue watching" rows={watching} />
      <Shelf
        title="Watchlist"
        rows={watchlist}
        action={
          watchlist.length > 1 ? (
            <SortSelect value={watchlistSort} onChange={setWatchlistSort} />
          ) : null
        }
      />

      {active.length > 0 && watching.length === 0 && watchlist.length === 0 && (
        <p className="mb-7 rounded-2xl border border-line bg-surface/60 px-4 py-6 text-center text-sm text-muted">
          Nothing here in {filter === 'tv' ? 'TV shows' : 'movies'} yet.
        </p>
      )}

      {follows?.length === 0 && (
        <div className="my-7 rounded-3xl border border-line bg-surface/60 p-8 text-center">
          <div className="text-4xl">🍿</div>
          <p className="mt-3 font-medium">Nothing tracked yet</p>
          <p className="mt-1 text-sm text-muted">Find a show or movie to get started.</p>
          <Link
            to="/search"
            className="mt-5 inline-block rounded-xl bg-brand-gradient px-5 py-2.5 text-sm font-semibold"
          >
            Search
          </Link>
        </div>
      )}

      <PosterRail title="Trending this week" items={trending ?? []} />
    </div>
  )
}

function MediaTabs({
  filter,
  onChange,
  showCount,
  movieCount,
}: {
  filter: MediaFilter
  onChange: (f: MediaFilter) => void
  showCount: number
  movieCount: number
}) {
  const tabs: { key: MediaFilter; label: string }[] = [
    { key: 'all', label: `All ${showCount + movieCount}` },
    { key: 'tv', label: `📺 Shows ${showCount}` },
    { key: 'movie', label: `🎬 Movies ${movieCount}` },
  ]
  return (
    <div className="mb-5 flex gap-1 rounded-2xl border border-line bg-surface/60 p-1">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition active:scale-[0.97] ${
            filter === t.key ? 'bg-brand-gradient text-white shadow-lg shadow-brand/25' : 'text-muted'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-line bg-surface/60 px-3 py-3 text-center">
      <div className="text-2xl font-bold tracking-tight">{value}</div>
      <div className="mt-0.5 text-[11px] uppercase tracking-wide text-faint">{label}</div>
    </div>
  )
}

function SortSelect({ value, onChange }: { value: SortKey; onChange: (s: SortKey) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as SortKey)}
      className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-muted outline-none focus:border-brand/60"
    >
      {SORT_OPTIONS.map((o) => (
        <option key={o.key} value={o.key}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

function Shelf({
  title,
  rows,
  action,
}: {
  title: string
  rows: FollowRow[]
  action?: React.ReactNode
}) {
  if (rows.length === 0) return null
  return (
    <section className="mb-7">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-muted">{title}</h2>
        {action}
      </div>
      <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 pb-1">
        {rows.map((r) => (
          <Link
            key={`${r.media_type}-${r.tmdb_id}`}
            to={`/title/${r.media_type}/${r.tmdb_id}`}
            className="w-28 shrink-0 active:scale-[0.97]"
          >
            <Poster
              path={r.poster_path}
              alt={r.name ?? ''}
              size="w342"
              className="aspect-[2/3] w-28 shadow-lg shadow-black/40"
            />
            <p className="mt-1.5 truncate text-xs font-medium text-ink/90">{r.name}</p>
          </Link>
        ))}
      </div>
    </section>
  )
}
