import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { Poster } from '../components/Poster'
import { UpNextRail } from '../components/UpNext'
import { useFollows, type FollowRow } from '../lib/tracking'
import { usePersistedState } from '../lib/uiState'

type MediaTab = 'tv' | 'movie'
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
  const [tab, setTab] = usePersistedState<MediaTab>('home:tab', 'tv')
  const [sort, setSort] = usePersistedState<SortKey>('home:sort', 'recent')

  const { data: follows } = useFollows()

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

  // Watchlist = things you haven't started yet, for the active media tab.
  const watchlist = sortRows(
    (follows ?? []).filter((f) => f.status === 'watchlist' && f.media_type === tab),
    sort,
  )

  return (
    <div className="px-5 pt-14">
      <header className="mb-6">
        <p className="text-sm text-muted">Welcome back</p>
        <h1 className="text-3xl font-bold tracking-tight">Your library</h1>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-3">
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

      <div className="mb-6 flex gap-1 rounded-2xl border border-line bg-surface/60 p-1">
        {(
          [
            { key: 'tv', label: '📺 TV Shows' },
            { key: 'movie', label: '🎬 Movies' },
          ] as { key: MediaTab; label: string }[]
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition active:scale-[0.98] ${
              tab === t.key ? 'bg-brand-gradient text-white shadow-lg shadow-brand/25' : 'text-muted'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'tv' && <UpNextRail />}

      <section className="mb-7">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold tracking-wide text-muted">Watchlist</h2>
          {watchlist.length > 1 && (
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-muted outline-none focus:border-brand/60"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </div>

        {watchlist.length > 0 ? (
          <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 pb-1">
            {watchlist.map((r) => (
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
        ) : (
          <EmptyWatchlist tab={tab} hasAnything={Boolean(follows && follows.length > 0)} />
        )}
      </section>
    </div>
  )
}

function EmptyWatchlist({ tab, hasAnything }: { tab: MediaTab; hasAnything: boolean }) {
  const noun = tab === 'tv' ? 'shows' : 'movies'
  return (
    <div className="rounded-3xl border border-line bg-surface/60 p-8 text-center">
      <div className="text-4xl">🍿</div>
      <p className="mt-3 font-medium">
        {hasAnything ? `No ${noun} on your watchlist` : 'Nothing tracked yet'}
      </p>
      <p className="mt-1 text-sm text-muted">Find something to add to your list.</p>
      <Link
        to="/search"
        className="mt-5 inline-block rounded-xl bg-brand-gradient px-5 py-2.5 text-sm font-semibold"
      >
        Search
      </Link>
    </div>
  )
}
