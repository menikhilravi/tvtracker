import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { useStats } from '../lib/tracking'
import { Poster } from '../components/Poster'
import type { MediaType } from '../lib/types'

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
        <CompletedSection />

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
    { icon: '✓', label: 'Completed', value: stats.completed },
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

// --- Completed library ------------------------------------------------------

interface CompletedRow {
  tmdb_id: number
  media_type: MediaType
  name: string | null
  poster_path: string | null
  updated_at: string
}

type SortKey = 'recent' | 'title' | 'type'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'recent', label: 'Recently completed' },
  { key: 'title', label: 'Title (A–Z)' },
  { key: 'type', label: 'Type' },
]

function CompletedSection() {
  const { session } = useAuth()
  const [sort, setSort] = useState<SortKey>('recent')

  const { data: rows } = useQuery({
    queryKey: ['completed-follows'],
    enabled: Boolean(supabase && session),
    queryFn: async (): Promise<CompletedRow[]> => {
      const { data, error } = await supabase!
        .from('follows')
        .select('tmdb_id, media_type, name, poster_path, updated_at')
        .eq('status', 'completed')
      if (error) throw error
      return data as CompletedRow[]
    },
  })

  const sorted = useMemo(() => {
    const items = [...(rows ?? [])]
    const byName = (a: CompletedRow, b: CompletedRow) =>
      (a.name ?? '').localeCompare(b.name ?? '')
    switch (sort) {
      case 'title':
        return items.sort(byName)
      case 'type':
        return items.sort(
          (a, b) => a.media_type.localeCompare(b.media_type) || byName(a, b),
        )
      case 'recent':
      default:
        return items.sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    }
  }, [rows, sort])

  return (
    <div className="mt-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-muted">
          Completed{sorted.length > 0 && <span className="text-faint"> · {sorted.length}</span>}
        </h2>
        {sorted.length > 1 && (
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

      {sorted.length === 0 ? (
        <p className="rounded-2xl border border-line bg-surface/60 px-4 py-6 text-center text-sm text-muted">
          Nothing completed yet. Mark a show or movie as completed to see it here.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {sorted.map((r) => (
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
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
