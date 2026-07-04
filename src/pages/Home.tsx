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

  if (loading) return <p className="p-4 text-slate-400">Loading…</p>

  if (!session) {
    return (
      <div className="p-6 text-center">
        <div className="mt-10 text-5xl">📺</div>
        <h1 className="mt-4 text-xl font-bold">TV Tracker</h1>
        <p className="mt-2 text-sm text-slate-400">
          Track the shows and movies you watch. Sign in to get started, then search for something.
        </p>
        <Link to="/profile" className="mt-6 inline-block rounded-xl bg-indigo-600 px-5 py-2.5 font-semibold">
          Sign in
        </Link>
        <Link to="/search" className="mt-3 block text-sm text-slate-400 underline">
          or just browse
        </Link>
      </div>
    )
  }

  const watching = follows?.filter((f) => f.status === 'watching') ?? []
  const watchlist = follows?.filter((f) => f.status === 'watchlist') ?? []

  return (
    <div className="p-4">
      <h1 className="mb-4 text-xl font-bold">Home</h1>
      <Shelf title="Watching" rows={watching} empty="Nothing in progress yet." />
      <Shelf title="Watchlist" rows={watchlist} empty="Your watchlist is empty." />
      {follows?.length === 0 && (
        <p className="mt-8 text-center text-sm text-slate-400">
          Nothing tracked yet.{' '}
          <Link to="/search" className="text-indigo-400 underline">
            Search for a show →
          </Link>
        </p>
      )}
    </div>
  )
}

function Shelf({ title, rows, empty }: { title: string; rows: FollowRow[]; empty: string }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-500">{empty}</p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {rows.map((r) => (
            <Link
              key={`${r.media_type}-${r.tmdb_id}`}
              to={`/title/${r.media_type}/${r.tmdb_id}`}
              className="w-24 shrink-0"
            >
              <Poster
                path={r.poster_path}
                alt={r.name ?? ''}
                size="w200"
                className="h-36 w-24 rounded-lg"
              />
              <p className="mt-1 truncate text-xs">{r.name}</p>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
