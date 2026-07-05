// Client-side helpers that talk to our tmdb-proxy Edge Function (never TMDB
// directly — the key stays on the server). All functions return normalized
// shapes from `types.ts` so components never touch raw TMDB JSON.

import type {
  Collection,
  Episode,
  EpisodeRef,
  MediaType,
  RegionProviders,
  SearchResult,
  Season,
  TitleDetail,
  WatchProvider,
} from './types'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// Where the proxy lives. Defaults to the project's Functions URL.
const PROXY_URL =
  (import.meta.env.VITE_TMDB_PROXY_URL as string | undefined)?.replace(/\/$/, '') ||
  (SUPABASE_URL ? `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/tmdb-proxy` : '')

export const IMG = (path: string | null, size: 'w200' | 'w342' | 'w500' | 'original' = 'w342') =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : null

async function proxy<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  if (!PROXY_URL) {
    throw new Error(
      'TMDB proxy is not configured. Set VITE_SUPABASE_URL (and deploy the tmdb-proxy function).',
    )
  }
  const url = new URL(`${PROXY_URL}/${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const res = await fetch(url, {
    headers: ANON_KEY ? { apikey: ANON_KEY, authorization: `Bearer ${ANON_KEY}` } : {},
  })
  if (!res.ok) throw new Error(`TMDB proxy error ${res.status}`)
  return res.json() as Promise<T>
}

const year = (date?: string | null) => (date ? date.slice(0, 4) : null)

// --- Search -----------------------------------------------------------------

interface RawMultiItem {
  id: number
  // Multi-type endpoints (search/multi, trending/all) tag each row; single-type
  // endpoints (popular, top_rated, recommendations, discover) do not — hence
  // the `fallbackType` in `toResults`.
  media_type?: string
  title?: string
  name?: string
  poster_path?: string | null
  release_date?: string
  first_air_date?: string
  overview?: string
  genre_ids?: number[]
}

// Normalize raw TMDB list rows into SearchResult[]. `fallbackType` supplies the
// media type for single-type endpoints whose rows omit `media_type`.
function toResults(items: RawMultiItem[], fallbackType?: MediaType): SearchResult[] {
  return items
    .map((r) => ({ r, type: (r.media_type ?? fallbackType) as MediaType | undefined }))
    .filter(({ type }) => type === 'movie' || type === 'tv')
    .map(({ r, type }) => ({
      id: r.id,
      media_type: type as MediaType,
      title: r.title ?? r.name ?? 'Untitled',
      posterPath: r.poster_path ?? null,
      year: year(r.release_date ?? r.first_air_date),
      overview: r.overview ?? '',
      genreIds: r.genre_ids ?? [],
    }))
}

export async function searchMulti(query: string): Promise<SearchResult[]> {
  if (!query.trim()) return []
  // Pull the first two pages and merge: regional/less-popular titles often rank
  // below global matches and get pushed onto page 2.
  const [p1, p2] = await Promise.all([
    proxy<{ results: RawMultiItem[]; total_pages: number }>('search/multi', {
      query,
      include_adult: 'false',
      page: '1',
    }),
    proxy<{ results: RawMultiItem[] }>('search/multi', {
      query,
      include_adult: 'false',
      page: '2',
    }).catch(() => ({ results: [] })),
  ])
  const merged = toResults([...p1.results, ...(p1.total_pages > 1 ? p2.results : [])])
  // Dedupe by id (pages shouldn't overlap, but be safe).
  const seen = new Set<string>()
  return merged.filter((r) => {
    const k = `${r.media_type}-${r.id}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

// --- Detail -----------------------------------------------------------------

interface RawDetail {
  id: number
  title?: string
  name?: string
  overview?: string
  poster_path?: string | null
  backdrop_path?: string | null
  release_date?: string
  first_air_date?: string
  genres?: { name: string }[]
  vote_average?: number
  runtime?: number
  episode_run_time?: number[]
  number_of_episodes?: number
  networks?: { name: string }[]
  seasons?: {
    season_number: number
    name: string
    episode_count: number
    poster_path?: string | null
    air_date?: string | null
  }[]
  credits?: {
    cast?: { name: string; character?: string; profile_path?: string | null }[]
  }
  last_episode_to_air?: RawEpisodeRef | null
  next_episode_to_air?: RawEpisodeRef | null
  status?: string
  'watch/providers'?: { results?: Record<string, RawRegionProviders> }
  belongs_to_collection?: { id: number; name: string; poster_path?: string | null } | null
}

interface RawProvider {
  provider_id: number
  provider_name: string
  logo_path?: string | null
  display_priority?: number
}

interface RawRegionProviders {
  link?: string | null
  flatrate?: RawProvider[]
  free?: RawProvider[]
  ads?: RawProvider[]
  rent?: RawProvider[]
  buy?: RawProvider[]
}

interface RawEpisodeRef {
  season_number: number
  episode_number: number
  name?: string | null
  air_date?: string | null
}

const episodeRef = (e?: RawEpisodeRef | null): EpisodeRef | null =>
  e
    ? {
        seasonNumber: e.season_number,
        episodeNumber: e.episode_number,
        name: e.name ?? null,
        airDate: e.air_date ?? null,
      }
    : null

// TMDB returns providers per category (flatrate/rent/buy/…). Normalize one
// region's block, sorting each category by TMDB's display_priority.
const providers = (list?: RawProvider[]): WatchProvider[] =>
  (list ?? [])
    .slice()
    .sort((a, b) => (a.display_priority ?? 99) - (b.display_priority ?? 99))
    .map((p) => ({ id: p.provider_id, name: p.provider_name, logoPath: p.logo_path ?? null }))

function normalizeProviders(
  raw?: Record<string, RawRegionProviders>,
): Record<string, RegionProviders> {
  const out: Record<string, RegionProviders> = {}
  for (const [region, r] of Object.entries(raw ?? {})) {
    out[region] = {
      link: r.link ?? null,
      flatrate: providers(r.flatrate),
      free: providers(r.free),
      ads: providers(r.ads),
      rent: providers(r.rent),
      buy: providers(r.buy),
    }
  }
  return out
}

export async function getTitle(mediaType: MediaType, id: number): Promise<TitleDetail> {
  const data = await proxy<RawDetail>(`${mediaType}/${id}`, {
    append_to_response: 'credits,watch/providers',
  })
  const seasons: Season[] = (data.seasons ?? [])
    .filter((s) => s.season_number > 0) // hide "Specials" (season 0) by default
    .map((s) => ({
      seasonNumber: s.season_number,
      name: s.name,
      episodeCount: s.episode_count,
      posterPath: s.poster_path ?? null,
      airDate: s.air_date ?? null,
    }))
  return {
    id: data.id,
    media_type: mediaType,
    title: data.title ?? data.name ?? 'Untitled',
    overview: data.overview ?? '',
    posterPath: data.poster_path ?? null,
    backdropPath: data.backdrop_path ?? null,
    year: year(data.release_date ?? data.first_air_date),
    releaseDate: data.release_date ?? null,
    genres: (data.genres ?? []).map((g) => g.name),
    voteAverage: data.vote_average ?? 0,
    runtime: data.runtime ?? null,
    episodeRunTime: data.episode_run_time?.[0] ?? null,
    numberOfEpisodes: data.number_of_episodes ?? null,
    networks: (data.networks ?? []).map((n) => n.name),
    seasons,
    cast: (data.credits?.cast ?? []).slice(0, 12).map((c) => ({
      name: c.name,
      character: c.character ?? '',
      profilePath: c.profile_path ?? null,
    })),
    lastEpisodeToAir: episodeRef(data.last_episode_to_air),
    nextEpisodeToAir: episodeRef(data.next_episode_to_air),
    // TMDB's production status ('Ended' / 'Canceled' / 'Returning Series' / …).
    showStatus: data.status ?? null,
    ended: mediaType === 'tv' && (data.status === 'Ended' || data.status === 'Canceled'),
    watchProviders: normalizeProviders(data['watch/providers']?.results),
    collection: data.belongs_to_collection
      ? {
          id: data.belongs_to_collection.id,
          name: data.belongs_to_collection.name,
          posterPath: data.belongs_to_collection.poster_path ?? null,
        }
      : null,
  }
}

// A movie franchise and its member movies (ordered by release date), for the
// "watch the whole saga" view.
export async function getCollection(id: number): Promise<Collection> {
  const data = await proxy<{ id: number; name: string; parts?: RawMultiItem[] }>(`collection/${id}`)
  const parts = toResults(data.parts ?? [], 'movie').sort((a, b) =>
    (a.year ?? '9999').localeCompare(b.year ?? '9999'),
  )
  return { id: data.id, name: data.name, parts }
}

// --- Season episodes --------------------------------------------------------

interface RawSeason {
  episodes?: {
    episode_number: number
    season_number: number
    name: string
    overview?: string
    air_date?: string | null
    still_path?: string | null
  }[]
}

export async function getSeason(showId: number, seasonNumber: number): Promise<Episode[]> {
  const data = await proxy<RawSeason>(`tv/${showId}/season/${seasonNumber}`)
  return (data.episodes ?? []).map((e) => ({
    episodeNumber: e.episode_number,
    seasonNumber: e.season_number,
    name: e.name,
    overview: e.overview ?? '',
    airDate: e.air_date ?? null,
    stillPath: e.still_path ?? null,
  }))
}

// --- Trending (discovery) ---------------------------------------------------

export async function getTrending(window: 'day' | 'week' = 'week'): Promise<SearchResult[]> {
  const data = await proxy<{ results: RawMultiItem[] }>(`trending/all/${window}`)
  return toResults(data.results)
}

export async function getPopular(mediaType: MediaType): Promise<SearchResult[]> {
  const data = await proxy<{ results: RawMultiItem[] }>(`${mediaType}/popular`)
  return toResults(data.results, mediaType)
}

export async function getTopRated(mediaType: MediaType): Promise<SearchResult[]> {
  const data = await proxy<{ results: RawMultiItem[] }>(`${mediaType}/top_rated`)
  return toResults(data.results, mediaType)
}

// Titles similar to one the user already likes ("Because you watched …").
export async function getRecommendations(
  mediaType: MediaType,
  id: number,
): Promise<SearchResult[]> {
  const data = await proxy<{ results: RawMultiItem[] }>(`${mediaType}/${id}/recommendations`)
  return toResults(data.results, mediaType)
}

// --- Genre browsing ---------------------------------------------------------

export interface Genre {
  id: number
  name: string
}

export async function getGenres(mediaType: MediaType): Promise<Genre[]> {
  const data = await proxy<{ genres: Genre[] }>(`genre/${mediaType}/list`)
  return data.genres ?? []
}

export async function discoverByGenre(
  mediaType: MediaType,
  genreId: number,
): Promise<SearchResult[]> {
  const data = await proxy<{ results: RawMultiItem[] }>(`discover/${mediaType}`, {
    with_genres: String(genreId),
    sort_by: 'popularity.desc',
    include_adult: 'false',
  })
  return toResults(data.results, mediaType)
}

// Popular titles in a given original language (ISO 639-1, e.g. 'ta' Tamil,
// 'ml' Malayalam) — the way to browse regional cinema that's hard to find by
// title alone.
export async function discoverByLanguage(
  mediaType: MediaType,
  language: string,
): Promise<SearchResult[]> {
  const data = await proxy<{ results: RawMultiItem[] }>(`discover/${mediaType}`, {
    with_original_language: language,
    sort_by: 'popularity.desc',
    include_adult: 'false',
  })
  return toResults(data.results, mediaType)
}
