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
    },
  })
}
