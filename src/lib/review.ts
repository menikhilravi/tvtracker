// Year- and month-in-review: what you watched inside a window of time.
//
// The rest of the stats page reports lifetime totals, which only need a count
// per title. Scoping to a period needs each watch's *date* alongside its title,
// so the aggregation here works over dated rows rather than the collapsed
// per-show maps the library uses.
//
// One deliberate rule, because it's the honest one: an episode counts once, on
// the day it was first watched. Rewatches increment a counter rather than
// adding a dated row (see migration 0007), so there is no date to attribute
// them to — booking them all against the first watch would inflate whichever
// period that fell in. Movies have no such limit; every viewing is its own
// dated row and counts individually.

import { FALLBACK_EPISODE_MINUTES, FALLBACK_MOVIE_MINUTES } from './tracking'
import { addDays } from './activity'

export type Period = { kind: 'year'; year: number } | { kind: 'month'; year: number; month: number }

/** A single dated viewing. `tmdbId` is the show id for episodes, movie id for movies. */
export interface DatedWatch {
  kind: WatchKind
  tmdbId: number
  /** ISO timestamp; only the UTC day is used, matching the activity heatmap. */
  watchedAt: string
}

/** What the aggregation needs to know about a title, however the caller sourced
 *  it — the cached `titles` row for runtime and genres, the follow row for the
 *  display fields when a title hasn't been synced yet. */
export interface ReviewTitleMeta {
  name: string | null
  posterPath: string | null
  /** Minutes per viewing: episode run time for a show, runtime for a movie. */
  minutes: number | null
  genres: string[]
}

/** Key for the meta map. Distinct from titleKey so a movie and show sharing a
 *  numeric id can't collide. */
export const reviewKey = (kind: WatchKind, tmdbId: number) => `${kind}:${tmdbId}`

export type WatchKind = 'episode' | 'movie'

/** Watch kinds map onto media types: an episode watch belongs to a tv title.
 *  Ratings and character votes are stored by media type, so they come through
 *  here before looking anything up in the meta map. */
export const kindForMedia = (mediaType: 'movie' | 'tv'): WatchKind =>
  mediaType === 'tv' ? 'episode' : 'movie'

/** Minutes one viewing is worth, falling back to a flat average when the title
 *  has no cached runtime. Shared so every figure on the review — the total, the
 *  per-title ranking, the monthly chart — is derived the same way. */
export function minutesFor(kind: WatchKind, m: ReviewTitleMeta | undefined): number {
  return m?.minutes || (kind === 'episode' ? FALLBACK_EPISODE_MINUTES : FALLBACK_MOVIE_MINUTES)
}

export interface ReviewTitle {
  tmdbId: number
  kind: WatchKind
  name: string | null
  posterPath: string | null
  count: number
  minutes: number
}

export interface ReviewSummary {
  minutes: number
  episodes: number
  movies: number
  /** Distinct shows + movies watched in the period. */
  titles: number
  activeDays: number
  busiestDay: { day: string; count: number } | null
  longestStreak: number
  topTitles: ReviewTitle[]
  topGenres: [string, number][]
  /** Watches whose title has no cached runtime, so minutes fell back to an average. */
  unsynced: number
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Days in a month, 1-indexed month. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Inclusive 'YYYY-MM-DD' bounds for a period. */
export function periodRange(period: Period): { start: string; end: string } {
  if (period.kind === 'year') {
    return { start: `${period.year}-01-01`, end: `${period.year}-12-31` }
  }
  const m = pad(period.month)
  return {
    start: `${period.year}-${m}-01`,
    end: `${period.year}-${m}-${pad(daysInMonth(period.year, period.month))}`,
  }
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export function periodLabel(period: Period): string {
  return period.kind === 'year' ? String(period.year) : `${MONTHS[period.month - 1]} ${period.year}`
}

/** Step a period forward or backward by one unit. */
export function shiftPeriod(period: Period, by: number): Period {
  if (period.kind === 'year') return { kind: 'year', year: period.year + by }
  const zero = period.year * 12 + (period.month - 1) + by
  return { kind: 'month', year: Math.floor(zero / 12), month: (zero % 12) + 1 }
}

/** True when the period contains today — used to label it "so far". */
export function isCurrentPeriod(period: Period, today = new Date()): boolean {
  const y = today.getUTCFullYear()
  if (period.kind === 'year') return period.year === y
  return period.year === y && period.month === today.getUTCMonth() + 1
}

/** The longest run of consecutive active days. */
export function longestRun(days: Set<string>): number {
  let longest = 0
  for (const day of days) {
    if (days.has(addDays(day, -1))) continue // only measure from a run's first day
    let len = 1
    let cur = day
    while (days.has(addDays(cur, 1))) {
      cur = addDays(cur, 1)
      len++
    }
    longest = Math.max(longest, len)
  }
  return longest
}

const TOP_TITLES = 8
const TOP_GENRES = 6

export function aggregateReview(
  watches: DatedWatch[],
  meta: Map<string, ReviewTitleMeta>,
  period: Period,
): ReviewSummary {
  const { start, end } = periodRange(period)

  let minutes = 0
  let episodes = 0
  let movies = 0
  let unsynced = 0
  const byDay = new Map<string, number>()
  const genreMinutes = new Map<string, number>()
  const titles = new Map<string, ReviewTitle>()

  for (const w of watches) {
    const day = w.watchedAt.slice(0, 10)
    if (day < start || day > end) continue

    const isEpisode = w.kind === 'episode'
    const key = reviewKey(w.kind, w.tmdbId)
    const m = meta.get(key)
    if (!m?.minutes) unsynced++
    const mins = minutesFor(w.kind, m)

    minutes += mins
    if (isEpisode) episodes++
    else movies++
    byDay.set(day, (byDay.get(day) ?? 0) + 1)

    for (const g of m?.genres ?? []) genreMinutes.set(g, (genreMinutes.get(g) ?? 0) + mins)

    const entry = titles.get(key)
    if (entry) {
      entry.count++
      entry.minutes += mins
    } else {
      titles.set(key, {
        tmdbId: w.tmdbId,
        kind: w.kind,
        name: m?.name ?? null,
        posterPath: m?.posterPath ?? null,
        count: 1,
        minutes: mins,
      })
    }
  }

  let busiestDay: { day: string; count: number } | null = null
  for (const [day, count] of byDay) {
    // Ties resolve to the earlier day, so the result doesn't depend on Map order.
    if (!busiestDay || count > busiestDay.count || (count === busiestDay.count && day < busiestDay.day)) {
      busiestDay = { day, count }
    }
  }

  return {
    minutes,
    episodes,
    movies,
    titles: titles.size,
    activeDays: byDay.size,
    busiestDay,
    longestStreak: longestRun(new Set(byDay.keys())),
    topTitles: [...titles.values()]
      .sort((a, b) => b.minutes - a.minutes || (a.name ?? '').localeCompare(b.name ?? ''))
      .slice(0, TOP_TITLES),
    topGenres: [...genreMinutes.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, TOP_GENRES),
    unsynced,
  }
}

// --- Favorite characters ----------------------------------------------------

export interface DatedVote {
  personId: number
  characterName: string | null
  actorName: string | null
  profilePath: string | null
  createdAt: string
}

export interface ReviewCharacter {
  personId: number
  characterName: string | null
  actorName: string | null
  profilePath: string | null
  /** Votes cast for this person in the period, across every scope. */
  votes: number
}

const TOP_CHARACTERS = 6

/** Characters you voted for inside the period, most-voted first.
 *
 *  A character can be picked at title, season and episode level, so the same
 *  person shows up several times; they're collapsed into one entry with a count
 *  rather than filling the list with duplicates. Display fields come from the
 *  earliest vote in the period, since later rows may have been written from a
 *  screen with less complete data. */
export function charactersInPeriod(votes: DatedVote[], period: Period): ReviewCharacter[] {
  const { start, end } = periodRange(period)
  const byPerson = new Map<number, ReviewCharacter & { first: string }>()

  for (const v of votes) {
    const day = v.createdAt.slice(0, 10)
    if (day < start || day > end) continue
    const existing = byPerson.get(v.personId)
    if (!existing) {
      byPerson.set(v.personId, {
        personId: v.personId,
        characterName: v.characterName,
        actorName: v.actorName,
        profilePath: v.profilePath,
        votes: 1,
        first: v.createdAt,
      })
      continue
    }
    existing.votes++
    if (v.createdAt < existing.first) {
      existing.first = v.createdAt
      existing.characterName = v.characterName
      existing.actorName = v.actorName
      existing.profilePath = v.profilePath
    }
  }

  return [...byPerson.values()]
    .sort((a, b) => b.votes - a.votes || (a.actorName ?? '').localeCompare(b.actorName ?? ''))
    .slice(0, TOP_CHARACTERS)
    .map(({ first: _first, ...rest }) => rest)
}

// --- Ratings ----------------------------------------------------------------

export interface DatedRating {
  tmdbId: number
  mediaType: 'movie' | 'tv'
  score: number
  createdAt: string
}

export interface ReviewRating {
  tmdbId: number
  kind: WatchKind
  name: string | null
  posterPath: string | null
  score: number
}

const TOP_RATED = 6

/** What you scored highest inside the period. Ties break by title so the order
 *  doesn't depend on which row was read first. */
export function topRatedInPeriod(
  ratings: DatedRating[],
  meta: Map<string, ReviewTitleMeta>,
  period: Period,
): ReviewRating[] {
  const { start, end } = periodRange(period)
  const out: ReviewRating[] = []

  for (const r of ratings) {
    const day = r.createdAt.slice(0, 10)
    if (day < start || day > end) continue
    const kind = kindForMedia(r.mediaType)
    const m = meta.get(reviewKey(kind, r.tmdbId))
    out.push({
      tmdbId: r.tmdbId,
      kind,
      name: m?.name ?? null,
      posterPath: m?.posterPath ?? null,
      score: r.score,
    })
  }

  return out
    .sort((a, b) => b.score - a.score || (a.name ?? '').localeCompare(b.name ?? ''))
    .slice(0, TOP_RATED)
}

// --- Monthly shape ----------------------------------------------------------

export interface MonthlyBucket {
  month: number // 1-12
  minutes: number
}

/** Minutes watched per calendar month of a year — the shape of a year, rather
 *  than one number for it. Always twelve buckets, so quiet months read as
 *  genuinely quiet instead of being dropped from the chart. */
export function monthlyMinutes(
  watches: DatedWatch[],
  meta: Map<string, ReviewTitleMeta>,
  year: number,
): MonthlyBucket[] {
  const buckets: MonthlyBucket[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    minutes: 0,
  }))
  const prefix = `${year}-`
  for (const w of watches) {
    if (!w.watchedAt.startsWith(prefix)) continue
    const month = Number(w.watchedAt.slice(5, 7))
    if (month < 1 || month > 12) continue
    buckets[month - 1].minutes += minutesFor(w.kind, meta.get(reviewKey(w.kind, w.tmdbId)))
  }
  return buckets
}

export const MONTH_SHORT = MONTHS.map((m) => m.slice(0, 3))
