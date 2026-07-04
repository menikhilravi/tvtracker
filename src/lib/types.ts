export type MediaType = 'movie' | 'tv'

export interface SearchResult {
  id: number
  media_type: MediaType
  title: string
  posterPath: string | null
  year: string | null
  overview: string
  genreIds: number[]
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

// A movie franchise (TMDB "belongs_to_collection") and its member movies.
export interface Collection {
  id: number
  name: string
  parts: SearchResult[]
}

// A single streaming/rent/buy provider for a title in one region (from TMDB's
// watch-provider data, sourced from JustWatch).
export interface WatchProvider {
  id: number
  name: string
  logoPath: string | null
}

export interface RegionProviders {
  link: string | null // JustWatch deep link for this title + region
  flatrate: WatchProvider[] // included with a subscription
  free: WatchProvider[]
  ads: WatchProvider[] // free with ads
  rent: WatchProvider[]
  buy: WatchProvider[]
}

export interface TitleDetail {
  id: number
  media_type: MediaType
  title: string
  overview: string
  posterPath: string | null
  backdropPath: string | null
  year: string | null
  releaseDate: string | null // full ISO date; used for upcoming-movie calendar
  genres: string[]
  voteAverage: number
  runtime: number | null // minutes (movies)
  seasons: Season[] // tv only
  cast: { name: string; character: string; profilePath: string | null }[]
  // tv only: the most recently aired and next scheduled episodes (from TMDB).
  lastEpisodeToAir: EpisodeRef | null
  nextEpisodeToAir: EpisodeRef | null
  // tv only: TMDB production status ('Ended' / 'Canceled' / 'Returning Series').
  showStatus: string | null
  // True for a TV show TMDB reports as Ended or Canceled.
  ended: boolean
  // Streaming/rent/buy availability, keyed by region code (e.g. 'US', 'GB').
  watchProviders: Record<string, RegionProviders>
  // movie only: the franchise this belongs to, if any (id/name for a lookup).
  collection: { id: number; name: string; posterPath: string | null } | null
}
