export type MediaType = 'movie' | 'tv'

export interface SearchResult {
  id: number
  media_type: MediaType
  title: string
  posterPath: string | null
  year: string | null
  overview: string
}

export interface Season {
  seasonNumber: number
  name: string
  episodeCount: number
  posterPath: string | null
  airDate: string | null
}

export interface Episode {
  episodeNumber: number
  seasonNumber: number
  name: string
  overview: string
  airDate: string | null
  stillPath: string | null
}

// A minimal episode reference used for "up next" and the upcoming calendar.
export interface EpisodeRef {
  seasonNumber: number
  episodeNumber: number
  name: string | null
  airDate: string | null
}

export interface TitleDetail {
  id: number
  media_type: MediaType
  title: string
  overview: string
  posterPath: string | null
  backdropPath: string | null
  year: string | null
  genres: string[]
  voteAverage: number
  runtime: number | null // minutes (movies)
  seasons: Season[] // tv only
  cast: { name: string; character: string; profilePath: string | null }[]
  // tv only: the most recently aired and next scheduled episodes (from TMDB).
  lastEpisodeToAir: EpisodeRef | null
  nextEpisodeToAir: EpisodeRef | null
}
