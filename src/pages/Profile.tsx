import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { isSupabaseConfigured } from '../lib/supabase'
import { useLibrary, useStats, type LibraryCategory, type LibraryItem } from '../lib/tracking'
import { Poster } from '../components/Poster'

export function Profile() {
  const { session, signInWithPassword, signOut } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isSupabaseConfigured) {
    return (
      <div className="px-5 pt-14">
        <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
        <p className="mt-5 rounded-2xl border border-line bg-surface/60 p-4 text-sm leading-relaxed text-muted">
          Supabase isn’t configured yet. Add <code className="text-ink">VITE_SUPABASE_URL</code> and{' '}
          <code className="text-ink">VITE_SUPABASE_ANON_KEY</code> to <code className="text-ink">.env</code>{' '}
          (see the README), then reload. Search still works without it.
        </p>
      </div>
    )
  }

  if (session) {
    const email = session.user.email ?? ''
    const initial = email.charAt(0).toUpperCase() || '?'
    return (
      <div className="px-5 pt-14 pb-6">
        <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
        <div className="mt-6 flex items-center gap-4 rounded-3xl border border-line bg-surface/60 p-5">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-brand-gradient text-2xl font-bold">
            {initial}
          </div>
          <div className="min-w-0">
            <p className="text-xs text-faint">Signed in as</p>
            <p className="truncate font-medium">{email}</p>
          </div>
        </div>

        <StatsSection />
        <LibrarySection />

        <Link
          to="/history"
          className="mt-6 flex items-center justify-between rounded-2xl border border-line bg-surface/60 px-5 py-3.5 font-medium active:scale-[0.98]"
        >
          <span>🕑 Watch history</span>
          <span className="text-faint">›</span>
        </Link>

        <button
          onClick={() => signOut()}
          className="mt-4 w-full rounded-2xl border border-line bg-surface py-3 font-semibold active:scale-[0.98]"
        >
          Sign out
        </button>
      </div>
    )
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await signInWithPassword(email, password)
    setSubmitting(false)
    if (error) setError(error)
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center px-6">
      <div className="mb-8 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-brand-gradient text-3xl shadow-2xl shadow-brand/30">
          📺
        </div>
        <h1 className="mt-5 text-2xl font-bold tracking-tight">Welcome back</h1>
        <p className="mt-1.5 text-sm text-muted">Sign in to your tracker</p>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <input
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-2xl border border-line bg-surface/80 px-4 py-3.5 outline-none transition-colors placeholder:text-faint focus:border-brand/60 focus:bg-surface"
        />
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded-2xl border border-line bg-surface/80 px-4 py-3.5 outline-none transition-colors placeholder:text-faint focus:border-brand/60 focus:bg-surface"
        />
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-2xl bg-brand-gradient py-3.5 font-semibold shadow-lg shadow-brand/25 transition active:scale-[0.98] disabled:opacity-50"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
        {error && <p className="text-center text-sm text-red-400">{error}</p>}
      </form>

      <p className="mt-6 text-center text-xs leading-relaxed text-faint">
        No account yet? Create your user in the Supabase dashboard under
        Authentication → Users → Add user (set a password and auto-confirm), then
        sign in here.
      </p>
    </div>
  )
}

function StatsSection() {
  const { data: stats } = useStats()
  if (!stats) return null

  const hours = Math.round(stats.estimatedMinutes / 60)
  const days = stats.estimatedMinutes / 60 / 24
  const timeValue = hours >= 48 ? days.toFixed(1) : String(hours)
  const timeUnit = hours >= 48 ? 'days' : 'hours'

  const tiles = [
    { icon: '📺', label: 'Episodes', value: stats.episodesWatched },
    { icon: '🎬', label: 'Movies', value: stats.moviesWatched },
    { icon: '✓', label: 'Finished', value: stats.completed },
  ]

  return (
    <div className="mt-6">
      <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted">Your stats</h2>

      {/* Hero: estimated watch time. */}
      <div className="relative overflow-hidden rounded-3xl border border-line bg-brand-gradient p-5 shadow-lg shadow-brand/20">
        <div className="absolute -right-6 -top-8 text-[7rem] leading-none opacity-15 select-none">⏱️</div>
        <p className="text-xs font-medium uppercase tracking-wider text-white/70">Time watched</p>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-4xl font-extrabold tracking-tight text-white">{timeValue}</span>
          <span className="text-lg font-semibold text-white/80">{timeUnit}</span>
        </div>
        <p className="mt-1 text-[11px] text-white/60">Estimated across everything you’ve watched</p>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl border border-line bg-surface/60 px-3 py-4 text-center">
            <div className="text-lg">{t.icon}</div>
            <div className="mt-1 text-2xl font-bold tracking-tight">{t.value}</div>
            <div className="mt-0.5 text-[11px] uppercase tracking-wide text-faint">{t.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// --- Library ----------------------------------------------------------------

type Filter = 'all' | LibraryCategory
type SortKey = 'recent' | 'title'

const CATEGORY_ORDER: LibraryCategory[] = [
  'watching',
  'not_started',
  'up_to_date',
  'finished',
  'stopped',
]

const CATEGORY_LABEL: Record<LibraryCategory, string> = {
  watching: 'Watching',
  not_started: 'Haven’t started',
  up_to_date: 'Up to date',
  finished: 'Finished',
  stopped: 'Stopped',
}

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'recent', label: 'Recently updated' },
  { key: 'title', label: 'Title (A–Z)' },
]

function LibrarySection() {
  const { items, isLoading, refining } = useLibrary()
  const [search, setSearch] = useState('')

  const q = search.trim().toLowerCase()
  const match = (it: LibraryItem) => !q || (it.name ?? '').toLowerCase().includes(q)
  const tv = items.filter((i) => i.media_type === 'tv' && match(i))
  const movies = items.filter((i) => i.media_type === 'movie' && match(i))

  return (
    <div className="mt-8">
      <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted">
        Library
        {refining && <span className="ml-1.5 text-[11px] font-normal text-faint">refining…</span>}
      </h2>

      <div className="relative mb-5">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-faint">
          🔍
        </span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search your shows & movies"
          className="w-full rounded-2xl border border-line bg-surface/80 py-2.5 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-faint focus:border-brand/60 focus:bg-surface"
        />
      </div>

      {isLoading ? (
        <p className="rounded-2xl border border-line bg-surface/60 px-4 py-6 text-center text-sm text-muted">
          Loading your library…
        </p>
      ) : tv.length === 0 && movies.length === 0 ? (
        <p className="rounded-2xl border border-line bg-surface/60 px-4 py-6 text-center text-sm text-muted">
          {q ? `No matches for “${search.trim()}”.` : 'Nothing tracked yet.'}
        </p>
      ) : (
        <>
          <LibraryGroup title="TV Shows" icon="📺" items={tv} />
          <LibraryGroup title="Movies" icon="🎬" items={movies} />
        </>
      )}
    </div>
  )
}

function LibraryGroup({ title, icon, items }: { title: string; icon: string; items: LibraryItem[] }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<SortKey>('recent')

  const counts = useMemo(() => {
    const c: Record<LibraryCategory, number> = {
      watching: 0,
      not_started: 0,
      up_to_date: 0,
      finished: 0,
      stopped: 0,
    }
    for (const it of items) c[it.category]++
    return c
  }, [items])

  // Only offer filters that actually have items in this group.
  const filters: Filter[] = ['all', ...CATEGORY_ORDER.filter((c) => counts[c] > 0)]
  const active: Filter = filters.includes(filter) ? filter : 'all'

  const shown = useMemo(() => {
    const list = items.filter((it) => active === 'all' || it.category === active)
    const byName = (a: LibraryItem, b: LibraryItem) => (a.name ?? '').localeCompare(b.name ?? '')
    return sort === 'title'
      ? [...list].sort(byName)
      : [...list].sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  }, [items, active, sort])

  if (items.length === 0) return null

  return (
    <div className="mb-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">
          {icon} {title} <span className="text-faint">· {items.length}</span>
        </h3>
        {shown.length > 1 && (
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

      <div className="no-scrollbar -mx-5 mb-4 flex gap-2 overflow-x-auto px-5">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition active:scale-[0.97] ${
              active === f
                ? 'border-transparent bg-brand-gradient text-white shadow-md shadow-brand/25'
                : 'border-line bg-surface/60 text-muted'
            }`}
          >
            {f === 'all' ? 'All' : CATEGORY_LABEL[f]}
            <span className={active === f ? 'text-white/70' : 'text-faint'}>
              {' '}
              {f === 'all' ? items.length : counts[f]}
            </span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {shown.map((r) => (
          <Link
            key={`${r.media_type}-${r.tmdb_id}`}
            to={`/title/${r.media_type}/${r.tmdb_id}`}
            className="active:scale-[0.97]"
          >
            <Poster
              path={r.poster_path}
              alt={r.name ?? ''}
              size="w342"
              className="aspect-[2/3] w-full shadow-lg shadow-black/40"
            />
            <p className="mt-1.5 truncate text-xs font-medium text-ink/90">{r.name}</p>
            <p className="truncate text-[11px] text-faint">{CATEGORY_LABEL[r.category]}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
