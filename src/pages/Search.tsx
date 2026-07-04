import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { searchMulti } from '../lib/tmdb'
import { Poster } from '../components/Poster'
import { DiscoverRails } from '../components/DiscoverRails'
import { ProviderBadge } from '../components/ProviderBadge'
import { useWatchRegion } from '../lib/region'

export function Search() {
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  const [region] = useWatchRegion()

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
    <div className="min-h-dvh">
      <div className="glass sticky top-0 z-10 border-b px-5 pb-3 pt-14">
        <h1 className="mb-3 text-2xl font-bold tracking-tight">Search</h1>
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Shows & movies…"
            className="w-full rounded-2xl border border-line bg-surface/80 py-3.5 pl-11 pr-4 text-base outline-none transition-colors placeholder:text-faint focus:border-brand/60 focus:bg-surface"
          />
          {input && (
            <button
              onClick={() => setInput('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-faint active:scale-90"
              aria-label="Clear"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="px-5 py-4">
        {error && <p className="text-sm text-red-400">{(error as Error).message}</p>}

        {isFetching && <p className="text-sm text-muted">Searching…</p>}

        <ul className="space-y-2">
          {data?.map((r) => (
            <li key={`${r.media_type}-${r.id}`}>
              <Link
                to={`/title/${r.media_type}/${r.id}`}
                className="flex gap-3 rounded-2xl border border-transparent p-2 transition-colors hover:border-line hover:bg-surface/60 active:scale-[0.99]"
              >
                <Poster path={r.posterPath} alt={r.title} size="w200" className="h-24 w-16 shrink-0" />
                <div className="min-w-0 flex-1 py-0.5">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold">{r.title}</span>
                    <span className="shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                      {r.media_type === 'tv' ? 'TV' : 'Film'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-faint">
                    <span>{r.year ?? '—'}</span>
                    <ProviderBadge mediaType={r.media_type} id={r.id} region={region} />
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">{r.overview}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>

        {query.length <= 1 && (
          <div className="pt-2">
            <DiscoverRails />
          </div>
        )}

        {query.length > 1 && !isFetching && data?.length === 0 && (
          <p className="mt-8 text-center text-sm text-muted">No results for “{query}”.</p>
        )}
      </div>
    </div>
  )
}
