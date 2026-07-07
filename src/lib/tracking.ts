// Tracking hooks: follows, episode/movie watches, and ratings.
// These read/write the user's private rows in Supabase (guarded by RLS).
// When Supabase is not configured they no-op so the browse experience keeps
// working.

import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import { useAuth } from './auth'
import { getTitle } from './tmdb'
import type { MediaType, TitleDetail } from './types'

// Keep a lightweight copy of the title so history/watchlist can render without
// re-fetching TMDB for each row.
async function cacheTitle(t: Pick<TitleDetail, 'id' | 'media_type' | 'title' | 'posterPath' | 'year'>) {
  if (!supabase) return
  await supabase.from('titles').upsert(
    {
      tmdb_id: t.id,
      media_type: t.media_type,
      name: t.title,
      poster_path: t.posterPath,
      release_year: t.year ? Number(t.year) : null,
    },
    { onConflict: 'tmdb_id,media_type' },
  )
}

// Logging a watch should start tracking a title as "watching". This promotes
// only from watchlist or untracked — it never overrides completed/dropped, and
// leaves an already-watching show alone. Returns true if the status changed.
async function promoteToWatching(
  show: Pick<TitleDetail, 'id' | 'media_type' | 'title' | 'posterPath'>,
): Promise<boolean> {
  if (!supabase) return false
  const { data } = await supabase
    .from('follows')
    .select('status')
    .eq('tmdb_id', show.id)
    .eq('media_type', show.media_type)
    .maybeSingle()
  const status = data?.status ?? null
  if (status !== null && status !== 'watchlist') return false
  await supabase.from('follows').upsert(
    {
      tmdb_id: show.id,
      media_type: show.media_type,
      status: 'watching',
      name: show.title,
      poster_path: show.posterPath,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,tmdb_id,media_type' },
  )
  return true
}

export type FollowStatus = 'watchlist' | 'watching' | 'completed' | 'dropped'

export function useFollow(
  title: Pick<TitleDetail, 'id' | 'media_type' | 'title' | 'posterPath'>,
) {
  const tmdbId = title.id
  const mediaType = title.media_type
  const { session } = useAuth()
  const qc = useQueryClient()
  const enabled = Boolean(supabase && session)

  const query = useQuery({
    queryKey: ['follow', tmdbId, mediaType],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('follows')
        .select('status')
        .eq('tmdb_id', tmdbId)
        .eq('media_type', mediaType)
        .maybeSingle()
      if (error) throw error
      return (data?.status ?? null) as FollowStatus | null
    },
  })

  const setStatus = useMutation({
    mutationFn: async (status: FollowStatus | null) => {
      if (!supabase) throw new Error('Not configured')
      if (status === null) {
        await supabase.from('follows').delete().eq('tmdb_id', tmdbId).eq('media_type', mediaType)
        return null
      }
      await supabase
        .from('follows')
        .upsert(
          {
            tmdb_id: tmdbId,
            media_type: mediaType,
            status,
            // Denormalized so Home can render lists without a join/extra fetch.
            name: title.title,
            poster_path: title.posterPath,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,tmdb_id,media_type' },
        )
      return status
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['follow', tmdbId, mediaType] })
      qc.invalidateQueries({ queryKey: ['follows'] })
    },
  })

  return { status: query.data ?? null, isLoading: query.isLoading, setStatus, enabled }
}

// Remove a title from the library entirely (deletes the follow row). Watch
// history is left intact. Works from list views without the per-title hook.
export function useRemoveFollow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { tmdbId: number; mediaType: MediaType }) => {
      if (!supabase) throw new Error('Not configured')
      await supabase
        .from('follows')
        .delete()
        .eq('tmdb_id', args.tmdbId)
        .eq('media_type', args.mediaType)
    },
    onSuccess: (_data, args) => {
      qc.invalidateQueries({ queryKey: ['follows'] })
      qc.invalidateQueries({ queryKey: ['follow', args.tmdbId, args.mediaType] })
    },
  })
}

export function useMarkMovieWatched(title: TitleDetail) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      if (!supabase) throw new Error('Not configured')
      await cacheTitle(title)
      await supabase.from('movie_watches').insert({ tmdb_movie_id: title.id })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['history'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      qc.invalidateQueries({ queryKey: ['movie-watches'] })
    },
  })
}

// Watch counts per calendar day (UTC), merging episode + movie watches. Feeds
// the activity heatmap and streaks. NB: imported history shares the import
// timestamp, so pre-import dates aren't reconstructed — this is accurate for
// watches logged in-app going forward.
export function useWatchActivity() {
  const { session } = useAuth()
  return useQuery({
    queryKey: ['watch-activity'],
    enabled: Boolean(supabase && session),
    queryFn: async () => {
      const page = (table: string) =>
        fetchAllRows<{ watched_at: string }>((from, to) =>
          supabase!
            .from(table)
            .select('watched_at')
            .order('id', { ascending: true })
            .range(from, to),
        )
      const [eps, movies] = await Promise.all([page('episode_watches'), page('movie_watches')])
      const byDay = new Map<string, number>()
      for (const r of [...eps, ...movies]) {
        const day = r.watched_at.slice(0, 10)
        byDay.set(day, (byDay.get(day) ?? 0) + 1)
      }
      return byDay
    },
  })
}

// The set of TMDB movie ids the user has logged a watch for. Used to show
// franchise progress ("seen 18/33").
export function useWatchedMovieIds() {
  const { session } = useAuth()
  return useQuery({
    queryKey: ['movie-watches', 'ids'],
    enabled: Boolean(supabase && session),
    queryFn: async () => {
      const rows = await fetchAllRows<{ tmdb_movie_id: number }>((from, to) =>
        supabase!
          .from('movie_watches')
          .select('tmdb_movie_id')
          .order('id', { ascending: true })
          .range(from, to),
      )
      return new Set(rows.map((r) => r.tmdb_movie_id))
    },
  })
}

// Watched episodes for a show, as a Set of "S{n}E{n}" keys for quick lookup.
export function useEpisodeWatches(showId: number) {
  const { session } = useAuth()
  return useQuery({
    queryKey: ['episode-watches', showId],
    enabled: Boolean(supabase && session),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('episode_watches')
        .select('season_number, episode_number')
        .eq('tmdb_show_id', showId)
      if (error) throw error
      return new Set(data.map((r) => `S${r.season_number}E${r.episode_number}`))
    },
  })
}

export function useToggleEpisode(show: TitleDetail) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { season: number; episode: number; watched: boolean }) => {
      if (!supabase) throw new Error('Not configured')
      await cacheTitle(show)
      if (args.watched) {
        await supabase
          .from('episode_watches')
          .delete()
          .eq('tmdb_show_id', show.id)
          .eq('season_number', args.season)
          .eq('episode_number', args.episode)
      } else {
        await supabase.from('episode_watches').insert({
          tmdb_show_id: show.id,
          season_number: args.season,
          episode_number: args.episode,
        })
        // First watch of a not-started show → move it to "watching".
        await promoteToWatching(show)
      }
    },
    onSuccess: () => {
      // Prefix match invalidates both the per-show set and the ['episode-watches','all'] map.
      qc.invalidateQueries({ queryKey: ['episode-watches'] })
      qc.invalidateQueries({ queryKey: ['history'] })
      qc.invalidateQueries({ queryKey: ['up-next'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      qc.invalidateQueries({ queryKey: ['follows'] })
      qc.invalidateQueries({ queryKey: ['follow', show.id, show.media_type] })
    },
  })
}

// --- Episode ratings --------------------------------------------------------

// Your scores for a show's episodes, as a Map of "S{n}E{n}" -> score (1–10).
export function useEpisodeRatings(showId: number) {
  const { session } = useAuth()
  return useQuery({
    queryKey: ['episode-ratings', showId],
    enabled: Boolean(supabase && session),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('episode_ratings')
        .select('season_number, episode_number, score')
        .eq('tmdb_show_id', showId)
      if (error) throw error
      const map = new Map<string, number>()
      for (const r of data) map.set(`S${r.season_number}E${r.episode_number}`, r.score)
      return map
    },
  })
}

// Set (score 1–10) or clear (null) a single episode's rating. Rating an episode
// also marks it watched, since you can only rate what you've seen.
export function useRateEpisode(show: TitleDetail) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { season: number; episode: number; score: number | null }) => {
      if (!supabase) throw new Error('Not configured')
      await cacheTitle(show)
      if (args.score === null) {
        await supabase
          .from('episode_ratings')
          .delete()
          .eq('tmdb_show_id', show.id)
          .eq('season_number', args.season)
          .eq('episode_number', args.episode)
        return
      }
      await supabase.from('episode_ratings').upsert(
        {
          tmdb_show_id: show.id,
          season_number: args.season,
          episode_number: args.episode,
          score: args.score,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,tmdb_show_id,season_number,episode_number' },
      )
      // Rating implies watched — mark it (idempotent upsert) and start the show.
      await supabase.from('episode_watches').upsert(
        { tmdb_show_id: show.id, season_number: args.season, episode_number: args.episode },
        { onConflict: 'user_id,tmdb_show_id,season_number,episode_number' },
      )
      await promoteToWatching(show)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['episode-ratings', show.id] })
      qc.invalidateQueries({ queryKey: ['episode-watches'] })
      qc.invalidateQueries({ queryKey: ['history'] })
      qc.invalidateQueries({ queryKey: ['up-next'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      qc.invalidateQueries({ queryKey: ['follows'] })
      qc.invalidateQueries({ queryKey: ['follow', show.id, show.media_type] })
    },
  })
}

// Mark an entire season watched or unwatched in one shot.
export function useToggleSeason(show: TitleDetail) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { season: number; episodes: number[]; watched: boolean }) => {
      if (!supabase) throw new Error('Not configured')
      if (args.episodes.length === 0) return
      await cacheTitle(show)
      if (args.watched) {
        // Currently all watched → clear the whole season.
        await supabase
          .from('episode_watches')
          .delete()
          .eq('tmdb_show_id', show.id)
          .eq('season_number', args.season)
          .in('episode_number', args.episodes)
      } else {
        const rows = args.episodes.map((e) => ({
          tmdb_show_id: show.id,
          season_number: args.season,
          episode_number: e,
        }))
        await supabase
          .from('episode_watches')
          .upsert(rows, { onConflict: 'user_id,tmdb_show_id,season_number,episode_number' })
        await promoteToWatching(show)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['episode-watches'] })
      qc.invalidateQueries({ queryKey: ['history'] })
      qc.invalidateQueries({ queryKey: ['up-next'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      qc.invalidateQueries({ queryKey: ['follows'] })
      qc.invalidateQueries({ queryKey: ['follow', show.id, show.media_type] })
    },
  })
}

// --- Ratings ----------------------------------------------------------------

export function useRating(title: Pick<TitleDetail, 'id' | 'media_type' | 'title' | 'posterPath' | 'year'>) {
  const { session } = useAuth()
  const qc = useQueryClient()
  const enabled = Boolean(supabase && session)

  const query = useQuery({
    queryKey: ['rating', title.id, title.media_type],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('ratings')
        .select('score, review')
        .eq('tmdb_id', title.id)
        .eq('media_type', title.media_type)
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as { score: number; review: string | null } | null
    },
  })

  const save = useMutation({
    mutationFn: async (args: { score: number | null; review?: string | null }) => {
      if (!supabase) throw new Error('Not configured')
      if (args.score === null) {
        await supabase
          .from('ratings')
          .delete()
          .eq('tmdb_id', title.id)
          .eq('media_type', title.media_type)
        return
      }
      await cacheTitle(title)
      await supabase.from('ratings').upsert(
        {
          tmdb_id: title.id,
          media_type: title.media_type,
          score: args.score,
          review: args.review ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,tmdb_id,media_type' },
      )
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rating', title.id, title.media_type] })
      qc.invalidateQueries({ queryKey: ['ratings', 'all'] })
    },
  })

  return { rating: query.data ?? null, isLoading: query.isLoading, save, enabled }
}

// The user's score for every rated title, keyed `${media_type}-${tmdb_id}`.
// Used to sort/filter/badge the library by rating.
export function ratingKey(mediaType: MediaType, tmdbId: number): string {
  return `${mediaType}-${tmdbId}`
}

export function useAllRatings() {
  const { session } = useAuth()
  return useQuery({
    queryKey: ['ratings', 'all'],
    enabled: Boolean(supabase && session),
    queryFn: async () => {
      const rows = await fetchAllRows<{ tmdb_id: number; media_type: MediaType; score: number }>(
        (from, to) =>
          supabase!
            .from('ratings')
            .select('tmdb_id, media_type, score')
            .order('id', { ascending: true })
            .range(from, to),
      )
      const map = new Map<string, number>()
      for (const r of rows) map.set(ratingKey(r.media_type, r.tmdb_id), r.score)
      return map
    },
  })
}

// --- Favorite characters ----------------------------------------------------

// A character to favorite, sourced from a title's TMDB cast (personId is the
// TMDB person/actor id, which is the character's stable identity here).
export interface CharacterPick {
  personId: number
  characterName: string | null
  actorName: string | null
  profilePath: string | null
}

// Which slice of a title a vote belongs to. Omitted → the whole title;
// `{ season }` → one season; `{ season, episode }` → one episode.
export type CharacterVoteScope = { season: number; episode?: number }

// PostgREST filter for a scope, applied to both the read and the delete so
// the title / season / episode rows never bleed into one another.
function scopeFilter<Q extends { eq: (c: string, v: number) => Q; is: (c: string, v: null) => Q }>(
  q: Q,
  scope?: CharacterVoteScope,
): Q {
  if (!scope) return q.is('season_number', null).is('episode_number', null)
  if (scope.episode == null) return q.eq('season_number', scope.season).is('episode_number', null)
  return q.eq('season_number', scope.season).eq('episode_number', scope.episode)
}

function scopeKey(scope?: CharacterVoteScope): string {
  if (!scope) return 'title'
  return scope.episode == null ? `s${scope.season}` : `s${scope.season}e${scope.episode}`
}

// The set of TMDB person ids the user has favorited for a scope — the whole
// title when `scope` is omitted, else that season or episode.
export function useCharacterVotes(
  tmdbId: number,
  mediaType: MediaType,
  scope?: CharacterVoteScope,
) {
  const { session } = useAuth()
  return useQuery({
    queryKey: ['character-votes', mediaType, tmdbId, scopeKey(scope)],
    enabled: Boolean(supabase && session),
    queryFn: async () => {
      const q = supabase!
        .from('character_votes')
        .select('person_id')
        .eq('tmdb_id', tmdbId)
        .eq('media_type', mediaType)
      const { data, error } = await scopeFilter(q, scope)
      if (error) throw error
      return new Set((data as { person_id: number }[]).map((r) => r.person_id))
    },
  })
}

// Toggle a character as a favorite at a scope. Uses explicit insert/delete (not
// upsert) so the null-vs-set season/episode scope stays unambiguous; the
// partial unique indexes keep picks deduped.
export function useToggleCharacterVote(
  title: Pick<TitleDetail, 'id' | 'media_type'>,
  scope?: CharacterVoteScope,
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { character: CharacterPick; voted: boolean }) => {
      if (!supabase) throw new Error('Not configured')
      if (args.voted) {
        const del = supabase
          .from('character_votes')
          .delete()
          .eq('tmdb_id', title.id)
          .eq('media_type', title.media_type)
          .eq('person_id', args.character.personId)
        const { error } = await scopeFilter(del, scope)
        if (error) throw error
      } else {
        const { error } = await supabase.from('character_votes').insert({
          tmdb_id: title.id,
          media_type: title.media_type,
          season_number: scope?.season ?? null,
          episode_number: scope?.episode ?? null,
          person_id: args.character.personId,
          character_name: args.character.characterName,
          actor_name: args.character.actorName,
          profile_path: args.character.profilePath,
        })
        if (error) throw error
      }
    },
    onSuccess: () => {
      // Prefix match invalidates every scope (title, season, episode) for this title.
      qc.invalidateQueries({ queryKey: ['character-votes', title.media_type, title.id] })
    },
  })
}

// --- Stats ------------------------------------------------------------------

export interface Stats {
  episodesWatched: number
  moviesWatched: number
  showsTracked: number
  completed: number
  estimatedMinutes: number
}

export function useStats() {
  const { session } = useAuth()
  return useQuery({
    queryKey: ['stats'],
    enabled: Boolean(supabase && session),
    queryFn: async (): Promise<Stats> => {
      const count = async (table: string, filter?: (q: any) => any) => {
        let q = supabase!.from(table).select('*', { count: 'exact', head: true })
        if (filter) q = filter(q)
        const { count: c, error } = await q
        if (error) throw error
        return c ?? 0
      }
      const [episodesWatched, moviesWatched, showsTracked, completed] = await Promise.all([
        count('episode_watches'),
        count('movie_watches'),
        count('follows'),
        count('follows', (q) => q.eq('status', 'completed')),
      ])
      // Rough estimate: ~40 min per episode, ~115 min per movie.
      const estimatedMinutes = episodesWatched * 40 + moviesWatched * 115
      return { episodesWatched, moviesWatched, showsTracked, completed, estimatedMinutes }
    },
  })
}

// --- Library (follows + derived viewing state) ------------------------------

export interface FollowRow {
  tmdb_id: number
  media_type: MediaType
  status: FollowStatus
  name: string | null
  poster_path: string | null
  updated_at: string
}

// PostgREST caps a single response at 1000 rows, so anything that can exceed
// that (a large library, thousands of episode watches) must be paged. This
// walks .range() until a short page signals the end.
const PAGE_SIZE = 1000
async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const all: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const rows = data ?? []
    all.push(...rows)
    if (rows.length < PAGE_SIZE) return all
  }
}

export function useFollows() {
  const { session } = useAuth()
  return useQuery({
    queryKey: ['follows'],
    enabled: Boolean(supabase && session),
    queryFn: (): Promise<FollowRow[]> =>
      // Paginate by the unique id (updated_at has ties across the import batch,
      // which would skip/duplicate rows). Callers re-sort for display.
      fetchAllRows<FollowRow>((from, to) =>
        supabase!
          .from('follows')
          .select('tmdb_id, media_type, status, name, poster_path, updated_at')
          .order('id', { ascending: true })
          .range(from, to),
      ),
  })
}

// Every watched episode across all shows, as showId -> Set of "S{n}E{n}" keys.
export function useAllEpisodeWatches() {
  const { session } = useAuth()
  return useQuery({
    queryKey: ['episode-watches', 'all'],
    enabled: Boolean(supabase && session),
    queryFn: async () => {
      const rows = await fetchAllRows<{
        tmdb_show_id: number
        season_number: number
        episode_number: number
      }>((from, to) =>
        supabase!
          .from('episode_watches')
          .select('tmdb_show_id, season_number, episode_number')
          .order('id', { ascending: true })
          .range(from, to),
      )
      const map = new Map<number, Set<string>>()
      for (const r of rows) {
        const set = map.get(r.tmdb_show_id) ?? new Set<string>()
        set.add(`S${r.season_number}E${r.episode_number}`)
        map.set(r.tmdb_show_id, set)
      }
      return map
    },
  })
}

// The first aired episode a user hasn't watched, or null if caught up.
export function computeNextUp(
  detail: TitleDetail,
  watched: Set<string>,
): { season: number; episode: number } | null {
  const last = detail.lastEpisodeToAir
  if (!last) return null
  const counts = new Map(detail.seasons.map((s) => [s.seasonNumber, s.episodeCount]))
  for (let s = 1; s <= last.seasonNumber; s++) {
    const maxEp = s === last.seasonNumber ? last.episodeNumber : counts.get(s) ?? 0
    for (let e = 1; e <= maxEp; e++) {
      if (!watched.has(`S${s}E${e}`)) return { season: s, episode: e }
    }
  }
  return null
}

// Watched vs. total *aired* episodes for a show, for a progress bar. Mirrors
// computeNextUp's iteration (only counts episodes up to the last aired one, so
// an ongoing show can reach 100%).
export function airedProgress(
  detail: TitleDetail,
  watched: Set<string>,
): { done: number; total: number } {
  const last = detail.lastEpisodeToAir
  if (!last) return { done: 0, total: 0 }
  const counts = new Map(detail.seasons.map((s) => [s.seasonNumber, s.episodeCount]))
  let total = 0
  let done = 0
  for (let s = 1; s <= last.seasonNumber; s++) {
    const maxEp = s === last.seasonNumber ? last.episodeNumber : counts.get(s) ?? 0
    for (let e = 1; e <= maxEp; e++) {
      total++
      if (watched.has(`S${s}E${e}`)) done++
    }
  }
  return { done, total }
}

// Viewing categories used by the profile library filters.
//  - not_started: on the watchlist, nothing watched yet
//  - watching:    started, still behind on aired episodes
//  - up_to_date:  caught up on every aired episode of an ongoing show
//  - finished:    marked completed, or caught up on an ended/canceled show
//  - stopped:     dropped
export type LibraryCategory = 'watching' | 'not_started' | 'up_to_date' | 'finished' | 'stopped'

export interface LibraryItem extends FollowRow {
  category: LibraryCategory
}

function categorize(
  f: FollowRow,
  detailById: Map<number, TitleDetail>,
  epMap: Map<number, Set<string>>,
): LibraryCategory {
  if (f.status === 'dropped') return 'stopped'
  if (f.status === 'completed') return 'finished'
  if (f.status === 'watchlist') return 'not_started'
  // status === 'watching'
  if (f.media_type === 'movie') return 'watching'
  const detail = detailById.get(f.tmdb_id)
  if (!detail) return 'watching' // detail still loading — treat as watching for now
  if (computeNextUp(detail, epMap.get(f.tmdb_id) ?? new Set())) return 'watching' // still behind
  // Caught up on every aired episode: an ended show is finished, an ongoing one is up to date.
  return detail.ended ? 'finished' : 'up_to_date'
}

export function useLibrary() {
  const follows = useFollows()
  const epWatches = useAllEpisodeWatches()

  // Only actively-watching TV shows need TMDB detail to tell "watching" (behind)
  // apart from "up to date" (caught up). Everything else categorizes from status.
  const watchingTv = (follows.data ?? []).filter(
    (f) => f.media_type === 'tv' && f.status === 'watching',
  )
  const details = useQueries({
    queries: watchingTv.map((s) => ({
      queryKey: ['title', 'tv', s.tmdb_id],
      queryFn: () => getTitle('tv', s.tmdb_id),
    })),
  })

  const detailById = new Map<number, TitleDetail>()
  for (const d of details) if (d.data) detailById.set(d.data.id, d.data)

  const epMap = epWatches.data ?? new Map<number, Set<string>>()
  const items: LibraryItem[] = (follows.data ?? []).map((f) => ({
    ...f,
    category: categorize(f, detailById, epMap),
  }))

  return {
    items,
    isLoading: follows.isLoading,
    // True while watching-show details are still resolving (categories may shift).
    refining: details.some((d) => d.isLoading),
  }
}

// --- Watch history ----------------------------------------------------------

export interface HistoryItem {
  key: string
  watchedAt: string
  name: string | null
  posterPath: string | null
  tmdbId: number
  mediaType: 'movie' | 'tv'
  subtitle: string // "Movie" or "S2 · E5"
}

export function useHistory() {
  const { session } = useAuth()
  return useQuery({
    queryKey: ['history'],
    enabled: Boolean(supabase && session),
    queryFn: async (): Promise<HistoryItem[]> => {
      const [eps, movies] = await Promise.all([
        supabase!
          .from('episode_watches')
          .select('tmdb_show_id, season_number, episode_number, watched_at')
          .order('watched_at', { ascending: false })
          .limit(60),
        supabase!
          .from('movie_watches')
          .select('tmdb_movie_id, watched_at')
          .order('watched_at', { ascending: false })
          .limit(60),
      ])
      if (eps.error) throw eps.error
      if (movies.error) throw movies.error

      // Look up cached title metadata for names/posters.
      const ids = new Set<number>()
      eps.data.forEach((e) => ids.add(e.tmdb_show_id))
      movies.data.forEach((m) => ids.add(m.tmdb_movie_id))
      const titleMap = new Map<string, { name: string | null; poster_path: string | null }>()
      if (ids.size > 0) {
        const { data: titles } = await supabase!
          .from('titles')
          .select('tmdb_id, media_type, name, poster_path')
          .in('tmdb_id', [...ids])
        titles?.forEach((t) => titleMap.set(`${t.media_type}:${t.tmdb_id}`, t))
      }

      const items: HistoryItem[] = [
        ...eps.data.map((e) => {
          const t = titleMap.get(`tv:${e.tmdb_show_id}`)
          return {
            key: `ep-${e.tmdb_show_id}-${e.season_number}-${e.episode_number}-${e.watched_at}`,
            watchedAt: e.watched_at,
            name: t?.name ?? null,
            posterPath: t?.poster_path ?? null,
            tmdbId: e.tmdb_show_id,
            mediaType: 'tv' as const,
            subtitle: `S${e.season_number} · E${e.episode_number}`,
          }
        }),
        ...movies.data.map((m) => {
          const t = titleMap.get(`movie:${m.tmdb_movie_id}`)
          return {
            key: `mv-${m.tmdb_movie_id}-${m.watched_at}`,
            watchedAt: m.watched_at,
            name: t?.name ?? null,
            posterPath: t?.poster_path ?? null,
            tmdbId: m.tmdb_movie_id,
            mediaType: 'movie' as const,
            subtitle: 'Movie',
          }
        }),
      ]
      items.sort((a, b) => b.watchedAt.localeCompare(a.watchedAt))
      return items
    },
  })
}
