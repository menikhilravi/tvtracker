import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  getTrending,
  getPopular,
  getTopRated,
  getGenres,
  discoverByGenre,
  discoverByLanguage,
  discoverByProvider,
  getProviders,
  IMG,
  type ServiceSort,
} from '../lib/tmdb'
import type { MediaType } from '../lib/types'
import { useWatchRegion, REGION_NAME } from '../lib/region'
import { useFollowStatusMap, type FollowStatus } from '../lib/tracking'
import { usePersistedState, useHideTracked } from '../lib/uiState'
import { PosterRail } from './PosterRail'
import { HideTrackedToggle } from './HideTrackedToggle'

// The full discovery surface shown on the Search empty state: fixed shelves
// (trending / popular / top-rated) plus a genre browser. Titles already in the
// user's library are badged with their status via `statusByKey`.
export function DiscoverRails() {
  const statusByKey = useFollowStatusMap()
  const [hideTracked] = useHideTracked()

  const trending = useQuery({ queryKey: ['trending', 'week'], queryFn: () => getTrending('week') })
  const popularTv = useQuery({ queryKey: ['popular', 'tv'], queryFn: () => getPopular('tv') })
  const popularMovie = useQuery({ queryKey: ['popular', 'movie'], queryFn: () => getPopular('movie') })
  const topTv = useQuery({ queryKey: ['top_rated', 'tv'], queryFn: () => getTopRated('tv') })
  const topMovie = useQuery({ queryKey: ['top_rated', 'movie'], queryFn: () => getTopRated('movie') })

  const rail = { statusByKey, hideTracked }
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-muted">Discover</h2>
        <HideTrackedToggle />
      </div>
      <PosterRail title="Trending this week" items={trending.data ?? []} {...rail} />
      <PosterRail title="Popular shows" items={popularTv.data ?? []} {...rail} />
      <PosterRail title="Popular movies" items={popularMovie.data ?? []} {...rail} />
      <PosterRail title="Top rated shows" items={topTv.data ?? []} {...rail} />
      <PosterRail title="Top rated movies" items={topMovie.data ?? []} {...rail} />
      <ServiceBrowse {...rail} />
      <GenreBrowse {...rail} />
      <LanguageBrowse {...rail} />
    </div>
  )
}

// Browse cinema by original language — the reliable way to find regional films
// (Telugu, Tamil, Malayalam, …) that rank low in title search. Indian languages
// lead the list; Telugu is the default selection.
const LANGUAGES: { code: string; name: string }[] = [
  { code: 'te', name: 'Telugu' },
  { code: 'ta', name: 'Tamil' },
  { code: 'kn', name: 'Kannada' },
  { code: 'ml', name: 'Malayalam' },
  { code: 'hi', name: 'Hindi' },
  { code: 'bn', name: 'Bengali' },
  { code: 'mr', name: 'Marathi' },
  { code: 'pa', name: 'Punjabi' },
  { code: 'gu', name: 'Gujarati' },
  { code: 'or', name: 'Odia' },
  { code: 'as', name: 'Assamese' },
  { code: 'ur', name: 'Urdu' },
  // A few non-Indian languages for good measure.
  { code: 'ko', name: 'Korean' },
  { code: 'ja', name: 'Japanese' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
]

function LanguageBrowse({
  statusByKey,
  hideTracked,
}: {
  statusByKey: Map<string, FollowStatus>
  hideTracked: boolean
}) {
  const [mediaType, setMediaType] = usePersistedState<MediaType>('discover:langMedia', 'movie')
  // Persisted, defaults to Telugu so regional films show without any tapping.
  const [lang, setLang] = usePersistedState<string | null>('discover:lang', 'te')

  const selected = LANGUAGES.find((l) => l.code === lang) ?? null
  const { data: results } = useQuery({
    queryKey: ['discover-lang', mediaType, lang],
    queryFn: () => discoverByLanguage(mediaType, lang as string),
    enabled: lang !== null,
  })

  return (
    <section className="mb-7">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-muted">Browse by language</h2>
        <div className="flex gap-1 rounded-xl border border-line bg-surface/60 p-0.5 text-xs font-semibold">
          {(['movie', 'tv'] as MediaType[]).map((m) => (
            <button
              key={m}
              onClick={() => setMediaType(m)}
              className={`rounded-lg px-2.5 py-1 transition ${
                mediaType === m ? 'bg-brand-gradient text-white' : 'text-muted'
              }`}
            >
              {m === 'movie' ? 'Film' : 'TV'}
            </button>
          ))}
        </div>
      </div>

      <div className="no-scrollbar -mx-5 mb-4 flex gap-2 overflow-x-auto px-5 pb-1">
        {LANGUAGES.map((l) => (
          <button
            key={l.code}
            onClick={() => setLang(lang === l.code ? null : l.code)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition active:scale-95 ${
              lang === l.code
                ? 'border-transparent bg-brand-gradient text-white'
                : 'border-line bg-surface/60 text-muted'
            }`}
          >
            {l.name}
          </button>
        ))}
      </div>

      {selected && (
        <PosterRail
          title={`Popular in ${selected.name}`}
          items={results ?? []}
          statusByKey={statusByKey}
          hideTracked={hideTracked}
        />
      )}
    </section>
  )
}

function GenreBrowse({
  statusByKey,
  hideTracked,
}: {
  statusByKey: Map<string, FollowStatus>
  hideTracked: boolean
}) {
  const [mediaType, setMediaType] = useState<MediaType>('tv')
  const [genreId, setGenreId] = useState<number | null>(null)

  const { data: genres } = useQuery({
    queryKey: ['genres', mediaType],
    queryFn: () => getGenres(mediaType),
  })

  const selected = genres?.find((g) => g.id === genreId) ?? null
  const { data: results } = useQuery({
    queryKey: ['discover', mediaType, genreId],
    queryFn: () => discoverByGenre(mediaType, genreId as number),
    enabled: genreId !== null,
  })

  const switchMedia = (m: MediaType) => {
    setMediaType(m)
    setGenreId(null) // genre ids differ between movie and tv
  }

  return (
    <section className="mb-7">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-muted">Browse by genre</h2>
        <div className="flex gap-1 rounded-xl border border-line bg-surface/60 p-0.5 text-xs font-semibold">
          {(['tv', 'movie'] as MediaType[]).map((m) => (
            <button
              key={m}
              onClick={() => switchMedia(m)}
              className={`rounded-lg px-2.5 py-1 transition ${
                mediaType === m ? 'bg-brand-gradient text-white' : 'text-muted'
              }`}
            >
              {m === 'tv' ? 'TV' : 'Film'}
            </button>
          ))}
        </div>
      </div>

      <div className="no-scrollbar -mx-5 mb-4 flex gap-2 overflow-x-auto px-5 pb-1">
        {(genres ?? []).map((g) => (
          <button
            key={g.id}
            onClick={() => setGenreId((cur) => (cur === g.id ? null : g.id))}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition active:scale-95 ${
              genreId === g.id
                ? 'border-transparent bg-brand-gradient text-white'
                : 'border-line bg-surface/60 text-muted'
            }`}
          >
            {g.name}
          </button>
        ))}
      </div>

      {selected && (
        <PosterRail
          title={`Best ${selected.name}`}
          items={results ?? []}
          statusByKey={statusByKey}
          hideTracked={hideTracked}
        />
      )}
    </section>
  )
}

// Browse a streaming service's catalogue. Unlike the Tonight screen — which
// checks your watchlist title by title because TMDB has no batch availability
// endpoint — this filters server-side via `discover`, so a whole shelf is one
// request.
const SERVICE_SORTS: { key: ServiceSort; label: string }[] = [
  { key: 'popular', label: 'Popular' },
  { key: 'top_rated', label: 'Top rated' },
  { key: 'new', label: 'Newest' },
]

// The provider list for a region runs to dozens of niche services; the first
// slice covers the ones people actually subscribe to (TMDB orders by its own
// display priority per region).
const SERVICE_LIMIT = 18

function ServiceBrowse({
  statusByKey,
  hideTracked,
}: {
  statusByKey: Map<string, FollowStatus>
  hideTracked: boolean
}) {
  const [region, setRegion] = useWatchRegion()
  const [mediaType, setMediaType] = usePersistedState<MediaType>('discover:svcMedia', 'movie')
  const [providerId, setProviderId] = usePersistedState<number | null>('discover:svc', null)
  const [sort, setSort] = usePersistedState<ServiceSort>('discover:svcSort', 'popular')

  const { data: providers } = useQuery({
    queryKey: ['providers', mediaType, region],
    queryFn: () => getProviders(mediaType, region),
    staleTime: 24 * 60 * 60 * 1000, // a region's service list barely moves
  })

  const shown = (providers ?? []).slice(0, SERVICE_LIMIT)
  // A service that isn't offered for this media type or region acts as "none".
  const selected = shown.find((p) => p.id === providerId) ?? null

  const { data: results, isFetching } = useQuery({
    queryKey: ['discover-provider', mediaType, selected?.id, region, sort],
    queryFn: () => discoverByProvider(mediaType, selected!.id, region, sort),
    enabled: Boolean(selected),
  })

  return (
    <section className="mb-7">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-wide text-muted">Browse by service</h2>
        <div className="flex shrink-0 items-center gap-2">
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            aria-label="Region"
            className="rounded-lg border border-line bg-surface px-2 py-1.5 text-xs font-medium text-muted outline-none focus:border-brand/60"
          >
            {[...new Set([region, 'US', 'GB', 'IN', 'CA', 'AU', 'DE', 'FR'])]
              .sort((a, b) => REGION_NAME(a).localeCompare(REGION_NAME(b)))
              .map((code) => (
                <option key={code} value={code}>
                  {REGION_NAME(code)}
                </option>
              ))}
          </select>
          <div className="flex gap-1 rounded-xl border border-line bg-surface/60 p-0.5 text-xs font-semibold">
            {(['movie', 'tv'] as MediaType[]).map((m) => (
              <button
                key={m}
                onClick={() => setMediaType(m)}
                className={`rounded-lg px-2.5 py-1 transition ${
                  mediaType === m ? 'bg-brand-gradient text-white' : 'text-muted'
                }`}
              >
                {m === 'movie' ? 'Film' : 'TV'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="no-scrollbar -mx-5 mb-3 flex gap-2 overflow-x-auto px-5 pb-1">
        {shown.map((p) => {
          const logo = IMG(p.logoPath, 'w200')
          const isActive = selected?.id === p.id
          return (
            <button
              key={p.id}
              onClick={() => setProviderId(isActive ? null : p.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border py-1.5 pl-1.5 pr-3 text-xs font-medium transition active:scale-95 ${
                isActive
                  ? 'border-transparent bg-brand-gradient text-white'
                  : 'border-line bg-surface/60 text-muted'
              }`}
            >
              {logo && <img src={logo} alt="" className="h-5 w-5 rounded ring-1 ring-line" />}
              {p.name}
            </button>
          )
        })}
      </div>

      {selected && (
        <>
          <div className="mb-3 flex gap-1 rounded-xl border border-line bg-surface/60 p-0.5 text-xs font-semibold">
            {SERVICE_SORTS.map((o) => (
              <button
                key={o.key}
                onClick={() => setSort(o.key)}
                className={`flex-1 rounded-lg px-2.5 py-1 transition ${
                  sort === o.key ? 'bg-brand-gradient text-white' : 'text-muted'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>

          {isFetching && !results ? (
            <p className="text-xs text-muted">Loading {selected.name}…</p>
          ) : (results?.length ?? 0) === 0 ? (
            <p className="text-xs text-muted">
              Nothing found on {selected.name} in {REGION_NAME(region)}.
            </p>
          ) : (
            <PosterRail
              title={`${selected.name} · ${
                SERVICE_SORTS.find((o) => o.key === sort)?.label ?? ''
              }`}
              items={results ?? []}
              statusByKey={statusByKey}
              hideTracked={hideTracked}
            />
          )}
        </>
      )}
    </section>
  )
}
