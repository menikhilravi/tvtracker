import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { searchMulti } from '../lib/tmdb'
import { Poster } from '../components/Poster'

export function Search() {
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')

  // Debounce typing so we don't hit the proxy on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => setQuery(input.trim()), 350)
    return () => clearTimeout(id)
  }, [input])

  const { data, isFetching, error } = useQuery({
    queryKey: ['search', query],
    queryFn: () => searchMulti(query),
    enabled: query.length > 1,
  })

  return (
    <div className="p-4">
      <h1 className="mb-3 text-xl font-bold">Search</h1>
      <input
        autoFocus
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Shows & movies…"
        className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-base outline-none focus:border-indigo-500"
      />

      {error && (
        <p className="mt-4 text-sm text-red-400">
          {(error as Error).message}
        </p>
      )}

      {isFetching && <p className="mt-4 text-sm text-slate-400">Searching…</p>}

      <ul className="mt-4 space-y-2">
        {data?.map((r) => (
          <li key={`${r.media_type}-${r.id}`}>
            <Link
              to={`/title/${r.media_type}/${r.id}`}
              className="flex gap-3 rounded-xl bg-slate-800 p-2 active:bg-slate-700"
            >
              <Poster path={r.posterPath} alt={r.title} size="w200" className="h-24 w-16 rounded-lg" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold">{r.title}</span>
                  <span className="shrink-0 rounded bg-slate-700 px-1.5 py-0.5 text-[10px] uppercase text-slate-300">
                    {r.media_type}
                  </span>
                </div>
                <div className="text-xs text-slate-400">{r.year ?? '—'}</div>
                <p className="mt-1 line-clamp-2 text-xs text-slate-400">{r.overview}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {query.length > 1 && !isFetching && data?.length === 0 && (
        <p className="mt-4 text-sm text-slate-400">No results.</p>
      )}
    </div>
  )
}
