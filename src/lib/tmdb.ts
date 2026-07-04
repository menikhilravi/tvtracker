// Client-side helpers that talk to our tmdb-proxy Edge Function (never TMDB
// directly — the key stays on the server). All functions return normalized
// shapes from `types.ts` so components never touch raw TMDB JSON.

import type { Episode, MediaType, SearchResult, Season, TitleDetail } from './types'

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
  media_type: string
  title?: string
  name?: string
  poster_path?: string | null
  release_date?: string
  first_air_date?: string
  overview?: string
}

export async function searchMulti(query: string): Promise<SearchResult[]> {
  if (!query.trim()) return []
  const data = await proxy<{ results: RawMultiItem[] }>('search/multi', {
    query,
    include_adult: 'false',
  })
  return data.results
    .filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
    .map((r) => ({
      id: r.id,
      media_type: r.media_type as MediaType,
      title: r.title ?? r.name ?? 'Untitled',
      posterPath: r.poster_path ?? null,
      year: year(r.release_date ?? r.first_air_date),
      overview: r.overview ?? '',
    }))
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
}

export async function getTitle(mediaType: MediaType, id: number): Promise<TitleDetail> {
  const data = await proxy<RawDetail>(`${mediaType}/${id}`, {
    append_to_response: 'credits',
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
    genres: (data.genres ?? []).map((g) => g.name),
    voteAverage: data.vote_average ?? 0,
    runtime: data.runtime ?? null,
    seasons,
    cast: (data.credits?.cast ?? []).slice(0, 12).map((c) => ({
      name: c.name,
      character: c.character ?? '',
      profilePath: c.profile_path ?? null,
    })),
  }
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
