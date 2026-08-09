import { describe, it, expect } from 'vitest'
import {
  computeNextUp,
  airedProgress,
  watchedMovieIds,
  statsFollows,
  watchedAtForDay,
  hasDetail,
  titleKey,
  trackedKey,
  type FollowRow,
  type FollowStatus,
} from './tracking'
import type { TitleDetail } from './types'

// --- fixtures ---------------------------------------------------------------

// Only the fields these pure functions actually read; the rest of TitleDetail is
// irrelevant here and spelling it out would obscure what each case is about.
function show(opts: {
  seasons: { seasonNumber: number; episodeCount: number }[]
  lastAired: { season: number; episode: number } | null
}): TitleDetail {
  return {
    id: 1,
    media_type: 'tv',
    seasons: opts.seasons.map((s) => ({
      seasonNumber: s.seasonNumber,
      name: `Season ${s.seasonNumber}`,
      episodeCount: s.episodeCount,
      posterPath: null,
      airDate: null,
    })),
    lastEpisodeToAir: opts.lastAired
      ? {
          seasonNumber: opts.lastAired.season,
          episodeNumber: opts.lastAired.episode,
          name: null,
          airDate: null,
        }
      : null,
  } as unknown as TitleDetail
}

const watchedSet = (...keys: string[]) => new Set(keys)

function follow(
  tmdb_id: number,
  media_type: 'tv' | 'movie',
  status: FollowStatus = 'watchlist',
): FollowRow {
  return { tmdb_id, media_type, status, name: null, poster_path: null, updated_at: '' }
}

// --- keys -------------------------------------------------------------------

describe('key helpers', () => {
  // These two produce the same string but index different things; a test pins
  // that so a future change to one doesn't silently desync lookups.
  it('are stable and distinguish media type', () => {
    expect(titleKey('tv', 1396)).toBe('tv:1396')
    expect(trackedKey('movie', 1396)).toBe('movie-1396')
    expect(titleKey('tv', 1)).not.toBe(titleKey('movie', 1))
  })
})

// --- computeNextUp ----------------------------------------------------------

describe('computeNextUp', () => {
  const threeSeasons = () =>
    show({
      seasons: [
        { seasonNumber: 1, episodeCount: 3 },
        { seasonNumber: 2, episodeCount: 3 },
        { seasonNumber: 3, episodeCount: 10 },
      ],
      lastAired: { season: 3, episode: 2 },
    })

  it('returns null for a show that has never aired', () => {
    expect(computeNextUp(show({ seasons: [], lastAired: null }), watchedSet())).toBeNull()
  })

  it('starts at the first episode when nothing is watched', () => {
    expect(computeNextUp(threeSeasons(), watchedSet())).toEqual({ season: 1, episode: 1 })
  })

  it('returns the next unwatched episode in order', () => {
    const watched = watchedSet('S1E1', 'S1E2')
    expect(computeNextUp(threeSeasons(), watched)).toEqual({ season: 1, episode: 3 })
  })

  it('crosses into the next season once one is finished', () => {
    const watched = watchedSet('S1E1', 'S1E2', 'S1E3')
    expect(computeNextUp(threeSeasons(), watched)).toEqual({ season: 2, episode: 1 })
  })

  // Watching out of order is normal; the earliest gap is what you're missing.
  it('finds an earlier gap ahead of later watched episodes', () => {
    const watched = watchedSet('S1E1', 'S1E3', 'S2E1', 'S2E2', 'S2E3')
    expect(computeNextUp(threeSeasons(), watched)).toEqual({ season: 1, episode: 2 })
  })

  it('is null once caught up on everything aired', () => {
    const watched = watchedSet('S1E1', 'S1E2', 'S1E3', 'S2E1', 'S2E2', 'S2E3', 'S3E1', 'S3E2')
    expect(computeNextUp(threeSeasons(), watched)).toBeNull()
  })

  // The season has 10 episodes but only 2 have aired — "next up" must not point
  // at an episode that doesn't exist yet.
  it('never returns an unaired episode', () => {
    const watched = watchedSet('S1E1', 'S1E2', 'S1E3', 'S2E1', 'S2E2', 'S2E3', 'S3E1')
    expect(computeNextUp(threeSeasons(), watched)).toEqual({ season: 3, episode: 2 })
  })
})

// --- airedProgress ----------------------------------------------------------

describe('airedProgress', () => {
  const ongoing = () =>
    show({
      seasons: [
        { seasonNumber: 1, episodeCount: 10 },
        { seasonNumber: 2, episodeCount: 10 },
      ],
      lastAired: { season: 2, episode: 3 },
    })

  it('is empty for a show that has never aired', () => {
    expect(airedProgress(show({ seasons: [], lastAired: null }), watchedSet())).toEqual({
      done: 0,
      total: 0,
    })
  })

  // The bug this guards: counting against every episode ordered rather than
  // every episode aired, which makes an up-to-date viewer look permanently behind.
  it('counts against aired episodes, not the full season order', () => {
    expect(airedProgress(ongoing(), watchedSet()).total).toBe(13)
  })

  it('can reach 100% on an ongoing show', () => {
    const watched = watchedSet(
      ...Array.from({ length: 10 }, (_, i) => `S1E${i + 1}`),
      'S2E1',
      'S2E2',
      'S2E3',
    )
    expect(airedProgress(ongoing(), watched)).toEqual({ done: 13, total: 13 })
  })

  it('ignores watched episodes that have not aired', () => {
    // S2E9 can't have aired; it must not inflate `done` past `total`.
    const p = airedProgress(ongoing(), watchedSet('S1E1', 'S2E9'))
    expect(p.done).toBe(1)
    expect(p.done).toBeLessThanOrEqual(p.total)
  })

  it('agrees with computeNextUp about being caught up', () => {
    const detail = ongoing()
    const watched = watchedSet(
      ...Array.from({ length: 10 }, (_, i) => `S1E${i + 1}`),
      'S2E1',
      'S2E2',
      'S2E3',
    )
    const p = airedProgress(detail, watched)
    expect(p.done === p.total).toBe(computeNextUp(detail, watched) === null)
  })
})

// --- watchedMovieIds --------------------------------------------------------

describe('watchedMovieIds', () => {
  // Logging a watch and marking a movie completed are separate actions, and an
  // import can set one without the other. Counting only one source made large
  // imported libraries look almost entirely unwatched.
  it('unions logged watches with movies marked completed', () => {
    const follows = [follow(1, 'movie', 'completed'), follow(2, 'movie', 'watchlist')]
    expect(watchedMovieIds(follows, new Set([2, 3]))).toEqual(new Set([1, 2, 3]))
  })

  it('does not count completed TV shows as watched movies', () => {
    expect(watchedMovieIds([follow(7, 'tv', 'completed')], new Set())).toEqual(new Set())
  })

  it('counts a movie once when both sources agree', () => {
    expect(watchedMovieIds([follow(1, 'movie', 'completed')], new Set([1])).size).toBe(1)
  })

  it('ignores movies that are merely on the watchlist', () => {
    expect(watchedMovieIds([follow(5, 'movie', 'watchlist')], new Set())).toEqual(new Set())
  })

  it('does not mutate the set it is given', () => {
    const logged = new Set([9])
    watchedMovieIds([follow(1, 'movie', 'completed')], logged)
    expect(logged).toEqual(new Set([9]))
  })
})

// --- statsFollows -----------------------------------------------------------

describe('statsFollows', () => {
  // Watch history without a follow row used to be invisible to the library-side
  // breakdowns while still counting in the summary tiles, so the two disagreed.
  it('adds shows that have watches but no follow row', () => {
    const rows = statsFollows([], new Map([[42, new Set(['S1E1'])]]), new Set())
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ tmdb_id: 42, media_type: 'tv', status: 'watching' })
  })

  it('adds movies that have watches but no follow row', () => {
    const rows = statsFollows([], new Map(), new Set([7]))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ tmdb_id: 7, media_type: 'movie', status: 'completed' })
  })

  it('keeps the real follow row rather than synthesising a duplicate', () => {
    const existing = follow(42, 'tv', 'completed')
    const rows = statsFollows([existing], new Map([[42, new Set(['S1E1'])]]), new Set())
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('completed')
  })

  // Same numeric id as a movie and a show — they must not collapse into one row.
  it('separates a movie and a show that share an id', () => {
    const rows = statsFollows([], new Map([[5, new Set(['S1E1'])]]), new Set([5]))
    expect(rows).toHaveLength(2)
    expect(new Set(rows.map((r) => r.media_type))).toEqual(new Set(['tv', 'movie']))
  })

  it('leaves the caller’s array untouched', () => {
    const follows = [follow(1, 'tv')]
    statsFollows(follows, new Map([[2, new Set(['S1E1'])]]), new Set())
    expect(follows).toHaveLength(1)
  })
})

// --- watchedAtForDay --------------------------------------------------------

describe('watchedAtForDay', () => {
  // The heatmap buckets by `watched_at.slice(0, 10)`, so the day you pick has to
  // be the day it lands on — midday UTC is the anchor no offset can shift.
  it('round-trips the chosen day through UTC-day bucketing', () => {
    for (const day of ['2026-01-01', '2026-06-15', '2026-12-31']) {
      expect(watchedAtForDay(day).slice(0, 10)).toBe(day)
    }
  })

  it('anchors at midday, the point furthest from a day boundary', () => {
    expect(new Date(watchedAtForDay('2026-08-07')).getUTCHours()).toBe(12)
  })

  // Rendering an instant at UTC offset `o` means adding `o` and reading the UTC
  // fields. Midday buys 11h59m of slack in each direction, which covers every
  // offset except the extremes.
  it('reads as the chosen day for offsets within ±11h', () => {
    const t = new Date(watchedAtForDay('2026-08-07')).getTime()
    for (const offsetHours of [-11, -8, -5.5, 0, 5.5, 9, 11]) {
      const local = new Date(t + offsetHours * 3_600_000).toISOString().slice(0, 10)
      expect(local).toBe('2026-08-07')
    }
  })

  // Documenting the limit rather than pretending it isn't there: at UTC+12 and
  // beyond (NZ, Samoa, Kiribati) midday UTC is already the next calendar day
  // locally, so History's local-time grouping shows it a day later than the
  // heatmap's UTC bucketing. Both readings are self-consistent; they just differ.
  it('is a day ahead locally at UTC+12 and beyond', () => {
    const t = new Date(watchedAtForDay('2026-08-07')).getTime()
    const local = new Date(t + 12 * 3_600_000).toISOString().slice(0, 10)
    expect(local).toBe('2026-08-08')
  })

  it('produces a value Date can parse', () => {
    expect(Number.isNaN(new Date(watchedAtForDay('2026-08-07')).getTime())).toBe(false)
  })
})

// --- hasDetail --------------------------------------------------------------

describe('hasDetail', () => {
  const stub = { id: 1, media_type: 'tv' as const, title: 'X', posterPath: null, year: null }

  // This guards the cached-metadata write path: a stub must never be mistaken
  // for a real detail, or it blanks out runtimes and genres already stored.
  it('rejects a list-shaped stub', () => {
    expect(hasDetail(stub)).toBe(false)
  })

  it('accepts a parsed detail even when it has no genres', () => {
    expect(hasDetail({ ...stub, genres: [] })).toBe(true)
  })

  it('accepts a detail with genres', () => {
    expect(hasDetail({ ...stub, genres: ['Drama'] })).toBe(true)
  })
})
