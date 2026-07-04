// Tracking hooks: follows, episode/movie watches, and ratings.
// These read/write the user's private rows in Supabase (guarded by RLS).
// When Supabase is not configured they no-op so the browse experience keeps
// working.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import { useAuth } from './auth'
import type { TitleDetail } from './types'

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

export function useMarkMovieWatched(title: TitleDetail) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      if (!supabase) throw new Error('Not configured')
      await cacheTitle(title)
      await supabase.from('movie_watches').insert({ tmdb_movie_id: title.id })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['history'] }),
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
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['episode-watches', show.id] })
      qc.invalidateQueries({ queryKey: ['history'] })
      qc.invalidateQueries({ queryKey: ['up-next'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rating', title.id, title.media_type] }),
  })

  return { rating: query.data ?? null, isLoading: query.isLoading, save, enabled }
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
