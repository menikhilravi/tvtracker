// Client-side helpers that talk to our tmdb-proxy Edge Function (never TMDB
// directly — the key stays on the server). All functions return normalized
// shapes from `types.ts` so components never touch raw TMDB JSON.

import type {
  Collection,
  Episode,
  EpisodeRef,
  MediaType,
  Person,
  RegionProviders,
  Review,
  SearchResult,
  Season,
  TitleDetail,
  Video,
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
  original_language?: string
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
      originalLanguage: r.original_language ?? null,
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
  original_language?: string
  genres?: { id: number; name: string }[]
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
    cast?: { id: number; name: string; character?: string; profile_path?: string | null }[]
  }
  last_episode_to_air?: RawEpisodeRef | null
  next_episode_to_air?: RawEpisodeRef | null
  status?: string
  'watch/providers'?: { results?: Record<string, RawRegionProviders> }
  belongs_to_collection?: { id: number; name: string; poster_path?: string | null } | null
  tagline?: string
  budget?: number
  revenue?: number
  videos?: { results?: RawVideo[] }
  images?: { backdrops?: { file_path: string; vote_count?: number }[] }
  reviews?: { results?: RawReview[] }
  // Appended keywords arrive under `keywords` for movies but `results` for TV.
  keywords?: { keywords?: { name: string }[]; results?: { name: string }[] }
}

interface RawVideo {
  key?: string
  name?: string
  site?: string
  type?: string
  official?: boolean
}

interface RawReview {
  id: string
  author?: string
  author_details?: { rating?: number | null; avatar_path?: string | null }
  content?: string
  created_at?: string
  url?: string
}

// Post-watch interest order: the stuff you want *after* seeing it first, the
// stuff that sells it to you last.
const VIDEO_TYPE_ORDER = ['Bloopers', 'Behind the Scenes', 'Featurette', 'Clip', 'Trailer', 'Teaser']

function normalizeVideos(raw?: RawVideo[]): Video[] {
  return (raw ?? [])
    .filter((v): v is RawVideo & { key: string } => Boolean(v.key) && v.site === 'YouTube')
    .map((v) => ({
      key: v.key,
      name: v.name ?? '',
      type: v.type ?? '',
      official: v.official ?? false,
    }))
    .sort((a, b) => {
      const rank = (t: string) => {
        const i = VIDEO_TYPE_ORDER.indexOf(t)
        return i === -1 ? VIDEO_TYPE_ORDER.length : i
      }
      const byType = rank(a.type) - rank(b.type)
      return byType !== 0 ? byType : Number(b.official) - Number(a.official)
    })
}

function normalizeReviews(raw?: RawReview[]): Review[] {
  return (raw ?? [])
    .filter((r) => (r.content ?? '').trim().length > 0)
    .map((r) => ({
      id: r.id,
      author: r.author || 'Anonymous',
      rating: r.author_details?.rating ?? null,
      avatarPath: r.author_details?.avatar_path ?? null,
      content: r.content ?? '',
      createdAt: r.created_at ?? null,
      url: r.url ?? null,
    }))
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
    append_to_response: 'credits,watch/providers,videos,images,reviews,keywords',
    // Most textless backdrops are language-tagged `null`; without this TMDB
    // filters them out of the appended images. The proxy drops the param until
    // it's redeployed with it allowlisted — the feed just gets fewer stills.
    include_image_language: 'en,null',
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
    genreIds: (data.genres ?? []).map((g) => g.id),
    originalLanguage: data.original_language ?? null,
    voteAverage: data.vote_average ?? 0,
    runtime: data.runtime ?? null,
    episodeRunTime: data.episode_run_time?.[0] ?? null,
    numberOfEpisodes: data.number_of_episodes ?? null,
    networks: (data.networks ?? []).map((n) => n.name),
    seasons,
    cast: (data.credits?.cast ?? []).slice(0, 12).map((c) => ({
      id: c.id,
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
    tagline: data.tagline?.trim() || null,
    budget: data.budget && data.budget > 0 ? data.budget : null,
    revenue: data.revenue && data.revenue > 0 ? data.revenue : null,
    videos: normalizeVideos(data.videos?.results),
    backdrops: (data.images?.backdrops ?? [])
      .filter((b) => b.file_path && b.file_path !== data.backdrop_path)
      .sort((a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0))
      .slice(0, 10)
      .map((b) => b.file_path),
    reviews: normalizeReviews(data.reviews?.results),
    keywords: [
      ...(data.keywords?.keywords ?? []),
      ...(data.keywords?.results ?? []),
    ].map((k) => k.name),
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

// --- People (actors) --------------------------------------------------------

// An actor plus their filmography. `combined_credits` merges movie + TV roles;
// we sort by TMDB popularity so the titles they're best known for lead, and
// dedupe because a person can hold several roles in the same title.
export async function getPerson(id: number): Promise<Person> {
  const data = await proxy<{
    id: number
    name: string
    profile_path?: string | null
    known_for_department?: string
    combined_credits?: { cast?: (RawMultiItem & { popularity?: number })[] }
  }>(`person/${id}`, { append_to_response: 'combined_credits' })

  const ranked = (data.combined_credits?.cast ?? [])
    .slice()
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))

  const seen = new Set<string>()
  const credits = toResults(ranked).filter((r) => {
    const k = `${r.media_type}-${r.id}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })

  return {
    id: data.id,
    name: data.name,
    profilePath: data.profile_path ?? null,
    knownFor: data.known_for_department ?? null,
    credits,
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
    vote_average?: number
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
    // TMDB reports 0 for "no votes yet" — that's absence, not a score.
    voteAverage: e.vote_average && e.vote_average > 0 ? e.vote_average : null,
  }))
}

// --- Single episode (guest stars & crew) ------------------------------------

export interface EpisodeExtras {
  guestStars: { id: number; name: string; character: string; profilePath: string | null }[]
  directors: string[]
  writers: string[]
}

// The episode endpoint carries guest_stars and crew in its base response.
// Requires the proxy's episode route — an older deploy 400s, which callers
// should treat as "no extras" rather than an error.
export async function getEpisodeExtras(
  showId: number,
  seasonNumber: number,
  episodeNumber: number,
): Promise<EpisodeExtras> {
  const data = await proxy<{
    guest_stars?: { id: number; name: string; character?: string; profile_path?: string | null }[]
    crew?: { job?: string; name?: string }[]
  }>(`tv/${showId}/season/${seasonNumber}/episode/${episodeNumber}`)
  const crewNames = (job: string) =>
    [...new Set((data.crew ?? []).filter((c) => c.job === job && c.name).map((c) => c.name!))]
  return {
    guestStars: (data.guest_stars ?? []).map((g) => ({
      id: g.id,
      name: g.name,
      character: g.character ?? '',
      profilePath: g.profile_path ?? null,
    })),
    directors: crewNames('Director'),
    writers: crewNames('Writer'),
  }
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

// The seed's traits that let us keep regional recommendations regional.
export interface SimilarSeed {
  originalLanguage: string | null
  genreIds: number[]
}

const dedupeResults = (items: SearchResult[]): SearchResult[] => {
  const seen = new Set<string>()
  return items.filter((r) => {
    const k = `${r.media_type}-${r.id}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

// "More like this" / "Because you watched …". TMDB's /recommendations is
// popularity-driven and skews toward global (mostly English) hits, so for a
// regional title it returns thin or off-context results. We blend it with
// /similar (genre+keyword based), and for non-English titles supplement with a
// same-language + same-genre /discover pass, ranking same-language titles first
// so the regional context leads.
export async function getSimilarTitles(
  mediaType: MediaType,
  id: number,
  seed: SimilarSeed,
): Promise<SearchResult[]> {
  const [recs, similar] = await Promise.all([
    proxy<{ results: RawMultiItem[] }>(`${mediaType}/${id}/recommendations`).catch(() => ({
      results: [],
    })),
    proxy<{ results: RawMultiItem[] }>(`${mediaType}/${id}/similar`).catch(() => ({ results: [] })),
  ])

  let merged = dedupeResults(toResults([...recs.results, ...similar.results], mediaType)).filter(
    (r) => r.id !== id,
  )

  const lang = seed.originalLanguage
  const isRegional = Boolean(lang) && lang !== 'en'

  if (isRegional && lang) {
    const sameLang = merged.filter((r) => r.originalLanguage === lang)
    // TMDB's recs are sparse for regional cinema — top up from same-language,
    // same-genre discovery so the rail actually fills with relevant titles.
    if (sameLang.length < 8) {
      const disc = await discoverSimilar(mediaType, lang, seed.genreIds).catch(() => [])
      merged = dedupeResults([...merged, ...disc]).filter((r) => r.id !== id)
    }
    // Stable sort: same-language titles lead, original order preserved otherwise.
    merged = merged
      .map((r, i) => ({ r, i }))
      .sort((a, b) => {
        const rank = Number(b.r.originalLanguage === lang) - Number(a.r.originalLanguage === lang)
        return rank !== 0 ? rank : a.i - b.i
      })
      .map(({ r }) => r)
  }

  return merged
}

// Popular titles sharing a seed's original language and (a few of) its genres.
// Genres are OR'd (`|`) to widen the net rather than over-constrain.
async function discoverSimilar(
  mediaType: MediaType,
  language: string,
  genreIds: number[],
): Promise<SearchResult[]> {
  const params: Record<string, string> = {
    with_original_language: language,
    sort_by: 'popularity.desc',
    include_adult: 'false',
  }
  if (genreIds.length) params.with_genres = genreIds.slice(0, 3).join('|')
  const data = await proxy<{ results: RawMultiItem[] }>(`discover/${mediaType}`, params)
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

// --- Streaming services -----------------------------------------------------

// "Streaming" throughout the app means watchable without paying per title:
// included with a subscription, free, or free with ads. Rent and buy are always
// excluded.
//
// The rule shows up in two forms — this list, for filtering a title's own
// provider data, and STREAMING_TYPES below, which asks TMDB to apply the same
// filter server-side. Keep them in step.
const STREAMING_CATEGORIES = ['flatrate', 'free', 'ads'] as const
const RENT_BUY_CATEGORIES = ['rent', 'buy'] as const

const dedupeById = (lists: WatchProvider[][]): WatchProvider[] => {
  const seen = new Map<number, WatchProvider>()
  for (const list of lists) for (const p of list) if (!seen.has(p.id)) seen.set(p.id, p)
  return [...seen.values()]
}

/** Ways to watch a title in a region without paying per title. */
export function streamingIn(region?: RegionProviders): WatchProvider[] {
  if (!region) return []
  return dedupeById(STREAMING_CATEGORIES.map((c) => region[c]))
}

/** Ways to watch that cost money per title. */
export function rentBuyIn(region?: RegionProviders): WatchProvider[] {
  if (!region) return []
  return dedupeById(RENT_BUY_CATEGORIES.map((c) => region[c]))
}

// The server-side form of STREAMING_CATEGORIES; TMDB takes them pipe-separated.
const STREAMING_TYPES = STREAMING_CATEGORIES.join('|')

// Discover is ranked by raw popularity, which floats thin titles with a handful
// of votes to the top of a service's shelf. A modest vote floor keeps the
// browse view to things enough people have actually rated.
const MIN_VOTES = 50

/** How a service's catalogue is ordered. */
export type ServiceSort = 'popular' | 'top_rated' | 'new'

const SORT_PARAM: Record<ServiceSort, string> = {
  popular: 'popularity.desc',
  top_rated: 'vote_average.desc',
  new: 'primary_release_date.desc',
}

/** The streaming services available in a region, most prominent first. */
export async function getProviders(
  mediaType: MediaType,
  region: string,
): Promise<WatchProvider[]> {
  const data = await proxy<{
    results?: {
      provider_id: number
      provider_name: string
      logo_path?: string | null
      display_priority?: number
    }[]
  }>(`watch/providers/${mediaType}`, { watch_region: region })

  return (data.results ?? [])
    .slice()
    .sort((a, b) => (a.display_priority ?? 999) - (b.display_priority ?? 999))
    .map((p) => ({ id: p.provider_id, name: p.provider_name, logoPath: p.logo_path ?? null }))
}

/** What a service is streaming in a region. Filtered server-side, so this is a
 *  single request rather than a provider lookup per title. */
export async function discoverByProvider(
  mediaType: MediaType,
  providerId: number,
  region: string,
  sort: ServiceSort = 'popular',
): Promise<SearchResult[]> {
  const data = await proxy<{ results: RawMultiItem[] }>(`discover/${mediaType}`, {
    with_watch_providers: String(providerId),
    watch_region: region,
    with_watch_monetization_types: STREAMING_TYPES,
    sort_by: SORT_PARAM[sort],
    'vote_count.gte': String(MIN_VOTES),
    include_adult: 'false',
  })
  return toResults(data.results, mediaType)
}
