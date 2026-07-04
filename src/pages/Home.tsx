import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Poster } from '../components/Poster'
import type { MediaType } from '../lib/types'

interface FollowRow {
  tmdb_id: number
  media_type: MediaType
  status: string
  name: string | null
  poster_path: string | null
}

export function Home() {
  const { session, loading } = useAuth()

  const { data: follows } = useQuery({
    queryKey: ['follows'],
    enabled: Boolean(supabase && session),
    queryFn: async (): Promise<FollowRow[]> => {
      const { data, error } = await supabase!
        .from('follows')
        .select('tmdb_id, media_type, status, name, poster_path')
        .order('updated_at', { ascending: false })
      if (error) throw error
      return data as FollowRow[]
    },
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

  const watching = follows?.filter((f) => f.status === 'watching') ?? []
  const watchlist = follows?.filter((f) => f.status === 'watchlist') ?? []
  const completed = follows?.filter((f) => f.status === 'completed') ?? []

  return (
    <div className="px-5 pt-14">
      <header className="mb-6">
        <p className="text-sm text-muted">Welcome back</p>
        <h1 className="text-3xl font-bold tracking-tight">Your library</h1>
      </header>

      {follows && follows.length > 0 && (
        <div className="mb-7 grid grid-cols-3 gap-3">
          <Stat label="Watching" value={watching.length} />
          <Stat label="Watchlist" value={watchlist.length} />
          <Stat label="Completed" value={completed.length} />
        </div>
      )}

      <Shelf title="Continue watching" rows={watching} />
      <Shelf title="Watchlist" rows={watchlist} />
      <Shelf title="Completed" rows={completed} />

      {follows?.length === 0 && (
        <div className="mt-10 rounded-3xl border border-line bg-surface/60 p-8 text-center">
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

function Shelf({ title, rows }: { title: string; rows: FollowRow[] }) {
  if (rows.length === 0) return null
  return (
    <section className="mb-7">
      <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted">{title}</h2>
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
