import { describe, it, expect } from 'vitest'
import {
  aggregateReview,
  charactersInPeriod,
  daysInMonth,
  isCurrentPeriod,
  kindForMedia,
  longestRun,
  minutesFor,
  monthlyMinutes,
  periodLabel,
  periodRange,
  reviewKey,
  shiftPeriod,
  topRatedInPeriod,
  MONTH_SHORT,
  type DatedRating,
  type DatedVote,
  type DatedWatch,
  type Period,
  type ReviewTitleMeta,
} from './review'

const YEAR: Period = { kind: 'year', year: 2026 }
const AUG: Period = { kind: 'month', year: 2026, month: 8 }

const watch = (
  kind: 'episode' | 'movie',
  tmdbId: number,
  day: string,
  time = 'T12:00:00.000Z',
): DatedWatch => ({ kind, tmdbId, watchedAt: `${day}${time}` })

const meta = (
  entries: [string, Partial<ReviewTitleMeta>][],
): Map<string, ReviewTitleMeta> =>
  new Map(
    entries.map(([k, v]) => [
      k,
      { name: null, posterPath: null, minutes: null, genres: [], ...v },
    ]),
  )

// --- period arithmetic ------------------------------------------------------

describe('daysInMonth', () => {
  it('knows month lengths', () => {
    expect(daysInMonth(2026, 1)).toBe(31)
    expect(daysInMonth(2026, 4)).toBe(30)
    expect(daysInMonth(2026, 12)).toBe(31)
  })

  it('handles February in common and leap years', () => {
    expect(daysInMonth(2026, 2)).toBe(28)
    expect(daysInMonth(2028, 2)).toBe(29)
    expect(daysInMonth(2100, 2)).toBe(28) // divisible by 100, not 400
    expect(daysInMonth(2000, 2)).toBe(29)
  })
})

describe('periodRange', () => {
  it('spans a whole year', () => {
    expect(periodRange(YEAR)).toEqual({ start: '2026-01-01', end: '2026-12-31' })
  })

  it('spans a whole month, zero-padded', () => {
    expect(periodRange({ kind: 'month', year: 2026, month: 2 })).toEqual({
      start: '2026-02-01',
      end: '2026-02-28',
    })
    expect(periodRange({ kind: 'month', year: 2026, month: 9 })).toEqual({
      start: '2026-09-01',
      end: '2026-09-30',
    })
  })

  // Bounds are compared as strings against 'YYYY-MM-DD' days, so padding is
  // load-bearing: '2026-9-01' would sort wrong.
  it('produces sortable bounds for single-digit months', () => {
    const { start, end } = periodRange({ kind: 'month', year: 2026, month: 3 })
    expect(start < '2026-03-15').toBe(true)
    expect(end > '2026-03-15').toBe(true)
  })
})

describe('shiftPeriod', () => {
  it('steps years', () => {
    expect(shiftPeriod(YEAR, -1)).toEqual({ kind: 'year', year: 2025 })
    expect(shiftPeriod(YEAR, 1)).toEqual({ kind: 'year', year: 2027 })
  })

  it('steps months within a year', () => {
    expect(shiftPeriod(AUG, 1)).toEqual({ kind: 'month', year: 2026, month: 9 })
    expect(shiftPeriod(AUG, -1)).toEqual({ kind: 'month', year: 2026, month: 7 })
  })

  it('rolls across year boundaries in both directions', () => {
    const jan: Period = { kind: 'month', year: 2026, month: 1 }
    expect(shiftPeriod(jan, -1)).toEqual({ kind: 'month', year: 2025, month: 12 })
    const dec: Period = { kind: 'month', year: 2026, month: 12 }
    expect(shiftPeriod(dec, 1)).toEqual({ kind: 'month', year: 2027, month: 1 })
  })

  it('round-trips over a long span', () => {
    let p: Period = AUG
    for (let i = 0; i < 30; i++) p = shiftPeriod(p, -1)
    for (let i = 0; i < 30; i++) p = shiftPeriod(p, 1)
    expect(p).toEqual(AUG)
  })
})

describe('periodLabel', () => {
  it('names years and months', () => {
    expect(periodLabel(YEAR)).toBe('2026')
    expect(periodLabel(AUG)).toBe('August 2026')
    expect(periodLabel({ kind: 'month', year: 2026, month: 1 })).toBe('January 2026')
    expect(periodLabel({ kind: 'month', year: 2026, month: 12 })).toBe('December 2026')
  })
})

describe('isCurrentPeriod', () => {
  const today = new Date('2026-08-07T00:00:00Z')

  it('recognises the containing year and month', () => {
    expect(isCurrentPeriod(YEAR, today)).toBe(true)
    expect(isCurrentPeriod(AUG, today)).toBe(true)
  })

  it('rejects other periods', () => {
    expect(isCurrentPeriod({ kind: 'year', year: 2025 }, today)).toBe(false)
    expect(isCurrentPeriod({ kind: 'month', year: 2026, month: 7 }, today)).toBe(false)
    expect(isCurrentPeriod({ kind: 'month', year: 2025, month: 8 }, today)).toBe(false)
  })
})

// --- longestRun -------------------------------------------------------------

describe('longestRun', () => {
  it('is zero for no days', () => {
    expect(longestRun(new Set())).toBe(0)
  })

  it('counts a single day', () => {
    expect(longestRun(new Set(['2026-08-07']))).toBe(1)
  })

  it('finds the longest of several runs', () => {
    const days = new Set(['2026-08-01', '2026-08-02', '2026-08-05', '2026-08-06', '2026-08-07'])
    expect(longestRun(days)).toBe(3)
  })

  it('spans a month boundary', () => {
    expect(longestRun(new Set(['2026-07-31', '2026-08-01', '2026-08-02']))).toBe(3)
  })
})

// --- aggregateReview --------------------------------------------------------

describe('aggregateReview', () => {
  it('is empty for no watches', () => {
    const r = aggregateReview([], meta([]), YEAR)
    expect(r).toMatchObject({ minutes: 0, episodes: 0, movies: 0, titles: 0, activeDays: 0 })
    expect(r.busiestDay).toBeNull()
    expect(r.topTitles).toEqual([])
  })

  it('excludes watches outside the period', () => {
    const watches = [
      watch('movie', 1, '2025-12-31'),
      watch('movie', 1, '2026-01-01'),
      watch('movie', 1, '2026-12-31'),
      watch('movie', 1, '2027-01-01'),
    ]
    expect(aggregateReview(watches, meta([]), YEAR).movies).toBe(2)
  })

  it('includes both edges of a month', () => {
    const watches = [
      watch('movie', 1, '2026-07-31'),
      watch('movie', 1, '2026-08-01'),
      watch('movie', 1, '2026-08-31'),
      watch('movie', 1, '2026-09-01'),
    ]
    expect(aggregateReview(watches, meta([]), AUG).movies).toBe(2)
  })

  // The window is compared on the UTC day, matching the heatmap's bucketing.
  it('buckets by UTC day, not local time', () => {
    const lateOnLastDay = watch('movie', 1, '2026-08-31', 'T23:30:00.000Z')
    expect(aggregateReview([lateOnLastDay], meta([]), AUG).movies).toBe(1)
  })

  it('uses real runtimes when known and averages when not', () => {
    const m = meta([
      [reviewKey('episode', 10), { minutes: 22 }],
      [reviewKey('movie', 20), { minutes: 150 }],
    ])
    const watches = [
      watch('episode', 10, '2026-08-02'),
      watch('movie', 20, '2026-08-03'),
      watch('episode', 99, '2026-08-04'), // unknown -> 40
      watch('movie', 98, '2026-08-05'), // unknown -> 115
    ]
    const r = aggregateReview(watches, m, AUG)
    expect(r.minutes).toBe(22 + 150 + 40 + 115)
    expect(r.unsynced).toBe(2)
  })

  it('counts a show and a movie sharing an id as separate titles', () => {
    const watches = [watch('episode', 5, '2026-08-01'), watch('movie', 5, '2026-08-01')]
    const r = aggregateReview(watches, meta([]), AUG)
    expect(r.titles).toBe(2)
    expect(r.episodes).toBe(1)
    expect(r.movies).toBe(1)
  })

  it('groups repeat watches of one title', () => {
    const watches = [
      watch('episode', 7, '2026-08-01'),
      watch('episode', 7, '2026-08-02'),
      watch('episode', 7, '2026-08-03'),
    ]
    const r = aggregateReview(watches, meta([[reviewKey('episode', 7), { minutes: 30 }]]), AUG)
    expect(r.titles).toBe(1)
    expect(r.topTitles[0]).toMatchObject({ tmdbId: 7, count: 3, minutes: 90 })
  })

  it('ranks top titles by minutes, not raw count', () => {
    const m = meta([
      [reviewKey('episode', 1), { minutes: 20, name: 'Shorts' }],
      [reviewKey('movie', 2), { minutes: 180, name: 'Epic' }],
    ])
    const watches = [
      ...Array.from({ length: 4 }, () => watch('episode', 1, '2026-08-01')), // 80 min
      watch('movie', 2, '2026-08-02'), // 180 min
    ]
    const r = aggregateReview(watches, m, AUG)
    expect(r.topTitles.map((t) => t.name)).toEqual(['Epic', 'Shorts'])
  })

  it('attributes minutes to every genre of a title', () => {
    const m = meta([[reviewKey('movie', 1), { minutes: 100, genres: ['Drama', 'Sci-Fi'] }]])
    const r = aggregateReview([watch('movie', 1, '2026-08-01')], m, AUG)
    expect(r.topGenres).toEqual([
      ['Drama', 100],
      ['Sci-Fi', 100],
    ])
  })

  it('counts active days and the busiest one', () => {
    const watches = [
      watch('movie', 1, '2026-08-01'),
      watch('movie', 2, '2026-08-03'),
      watch('movie', 3, '2026-08-03'),
      watch('movie', 4, '2026-08-03'),
    ]
    const r = aggregateReview(watches, meta([]), AUG)
    expect(r.activeDays).toBe(2)
    expect(r.busiestDay).toEqual({ day: '2026-08-03', count: 3 })
  })

  // Map iteration follows insertion order, so without an explicit tiebreak the
  // "busiest day" would depend on which watch happened to be read first.
  it('breaks a busiest-day tie deterministically', () => {
    const forward = [watch('movie', 1, '2026-08-05'), watch('movie', 2, '2026-08-02')]
    const backward = [...forward].reverse()
    expect(aggregateReview(forward, meta([]), AUG).busiestDay).toEqual(
      aggregateReview(backward, meta([]), AUG).busiestDay,
    )
    expect(aggregateReview(forward, meta([]), AUG).busiestDay?.day).toBe('2026-08-02')
  })

  it('measures the longest streak inside the period only', () => {
    const watches = [
      // A four-day run that straddles the start of the month; only the part
      // inside August can count.
      watch('movie', 1, '2026-07-30'),
      watch('movie', 1, '2026-07-31'),
      watch('movie', 1, '2026-08-01'),
      watch('movie', 1, '2026-08-02'),
    ]
    expect(aggregateReview(watches, meta([]), AUG).longestStreak).toBe(2)
  })

  it('carries display fields onto top titles', () => {
    const m = meta([[reviewKey('movie', 3), { name: 'Arrival', posterPath: '/p.jpg' }]])
    const r = aggregateReview([watch('movie', 3, '2026-08-01')], m, AUG)
    expect(r.topTitles[0]).toMatchObject({ name: 'Arrival', posterPath: '/p.jpg' })
  })

  it('is not affected by the order watches arrive in', () => {
    const watches = [
      watch('episode', 1, '2026-08-03'),
      watch('movie', 2, '2026-08-01'),
      watch('episode', 1, '2026-08-02'),
    ]
    const a = aggregateReview(watches, meta([]), AUG)
    const b = aggregateReview([...watches].reverse(), meta([]), AUG)
    expect(a).toEqual(b)
  })
})

// --- charactersInPeriod -----------------------------------------------------

const vote = (personId: number, day: string, over: Partial<DatedVote> = {}): DatedVote => ({
  personId,
  characterName: `Character ${personId}`,
  actorName: `Actor ${personId}`,
  profilePath: null,
  createdAt: `${day}T12:00:00.000Z`,
  ...over,
})

describe('kindForMedia', () => {
  it('maps media types onto watch kinds', () => {
    expect(kindForMedia('tv')).toBe('episode')
    expect(kindForMedia('movie')).toBe('movie')
  })
})

describe('minutesFor', () => {
  it('uses the cached runtime when present', () => {
    expect(minutesFor('episode', { name: null, posterPath: null, minutes: 22, genres: [] })).toBe(22)
  })

  it('falls back per kind when runtime is missing or zero', () => {
    expect(minutesFor('episode', undefined)).toBe(40)
    expect(minutesFor('movie', undefined)).toBe(115)
    // A zero runtime is bad data, not "no time at all".
    expect(minutesFor('movie', { name: null, posterPath: null, minutes: 0, genres: [] })).toBe(115)
  })
})

describe('charactersInPeriod', () => {
  it('is empty with no votes', () => {
    expect(charactersInPeriod([], AUG)).toEqual([])
  })

  it('excludes votes outside the period', () => {
    expect(charactersInPeriod([vote(1, '2026-07-31'), vote(2, '2026-09-01')], AUG)).toEqual([])
  })

  // The same person can be picked at title, season and episode scope; the
  // review should show them once, not three times.
  it('collapses repeat votes for one person into a count', () => {
    const votes = [vote(1, '2026-08-01'), vote(1, '2026-08-02'), vote(1, '2026-08-03')]
    const out = charactersInPeriod(votes, AUG)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ personId: 1, votes: 3 })
  })

  it('ranks by vote count', () => {
    const votes = [vote(1, '2026-08-01'), vote(2, '2026-08-01'), vote(2, '2026-08-02')]
    expect(charactersInPeriod(votes, AUG).map((c) => c.personId)).toEqual([2, 1])
  })

  it('takes display fields from the earliest vote regardless of input order', () => {
    const early = vote(1, '2026-08-01', { characterName: 'Early', actorName: 'A' })
    const late = vote(1, '2026-08-20', { characterName: 'Late', actorName: 'A' })
    expect(charactersInPeriod([late, early], AUG)[0].characterName).toBe('Early')
    expect(charactersInPeriod([early, late], AUG)[0].characterName).toBe('Early')
  })

  it('does not leak its internal ordering field', () => {
    expect(Object.keys(charactersInPeriod([vote(1, '2026-08-01')], AUG)[0])).not.toContain('first')
  })
})

// --- topRatedInPeriod -------------------------------------------------------

const rating = (
  tmdbId: number,
  score: number,
  day: string,
  mediaType: 'movie' | 'tv' = 'movie',
): DatedRating => ({ tmdbId, mediaType, score, createdAt: `${day}T12:00:00.000Z` })

describe('topRatedInPeriod', () => {
  it('excludes ratings outside the period', () => {
    expect(topRatedInPeriod([rating(1, 10, '2025-12-31')], meta([]), YEAR)).toEqual([])
  })

  it('sorts by score, highest first', () => {
    const rows = [rating(1, 6, '2026-08-01'), rating(2, 10, '2026-08-02'), rating(3, 8, '2026-08-03')]
    expect(topRatedInPeriod(rows, meta([]), AUG).map((r) => r.tmdbId)).toEqual([2, 3, 1])
  })

  it('resolves tv ratings against the episode-keyed meta map', () => {
    const m = meta([[reviewKey('episode', 9), { name: 'Severance' }]])
    const out = topRatedInPeriod([rating(9, 9, '2026-08-01', 'tv')], m, AUG)
    expect(out[0]).toMatchObject({ name: 'Severance', kind: 'episode' })
  })

  it('keeps a show and a movie with the same id distinct', () => {
    const m = meta([
      [reviewKey('episode', 4), { name: 'Show' }],
      [reviewKey('movie', 4), { name: 'Film' }],
    ])
    const out = topRatedInPeriod(
      [rating(4, 9, '2026-08-01', 'tv'), rating(4, 8, '2026-08-01', 'movie')],
      m,
      AUG,
    )
    expect(out.map((r) => r.name)).toEqual(['Show', 'Film'])
  })

  it('breaks score ties deterministically', () => {
    const m = meta([
      [reviewKey('movie', 1), { name: 'Zodiac' }],
      [reviewKey('movie', 2), { name: 'Arrival' }],
    ])
    const rows = [rating(1, 9, '2026-08-01'), rating(2, 9, '2026-08-02')]
    const forward = topRatedInPeriod(rows, m, AUG).map((r) => r.name)
    const backward = topRatedInPeriod([...rows].reverse(), m, AUG).map((r) => r.name)
    expect(forward).toEqual(['Arrival', 'Zodiac'])
    expect(forward).toEqual(backward)
  })
})

// --- monthlyMinutes ---------------------------------------------------------

describe('monthlyMinutes', () => {
  it('always returns twelve buckets, in order', () => {
    const out = monthlyMinutes([], meta([]), 2026)
    expect(out).toHaveLength(12)
    expect(out.map((b) => b.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(out.every((b) => b.minutes === 0)).toBe(true)
  })

  it('places watches in the right month', () => {
    const m = meta([[reviewKey('movie', 1), { minutes: 100 }]])
    const out = monthlyMinutes(
      [watch('movie', 1, '2026-01-15'), watch('movie', 1, '2026-12-31')],
      m,
      2026,
    )
    expect(out[0].minutes).toBe(100)
    expect(out[11].minutes).toBe(100)
    expect(out[5].minutes).toBe(0)
  })

  it('ignores other years', () => {
    const out = monthlyMinutes([watch('movie', 1, '2025-06-01')], meta([]), 2026)
    expect(out.every((b) => b.minutes === 0)).toBe(true)
  })

  // The year filter is a string prefix; '2026' must not swallow '20260' style
  // corruption or match a year that merely starts with the same digits.
  it('does not match a different year sharing a prefix', () => {
    const out = monthlyMinutes([watch('movie', 1, '2026-06-01')], meta([]), 202)
    expect(out.every((b) => b.minutes === 0)).toBe(true)
  })

  it('agrees with the period total for the same year', () => {
    const m = meta([
      [reviewKey('episode', 1), { minutes: 25 }],
      [reviewKey('movie', 2), { minutes: 130 }],
    ])
    const watches = [
      watch('episode', 1, '2026-03-02'),
      watch('episode', 1, '2026-03-03'),
      watch('movie', 2, '2026-11-20'),
    ]
    const monthly = monthlyMinutes(watches, m, 2026).reduce((a, b) => a + b.minutes, 0)
    expect(monthly).toBe(aggregateReview(watches, m, YEAR).minutes)
  })
})

describe('MONTH_SHORT', () => {
  it('has twelve three-letter labels', () => {
    expect(MONTH_SHORT).toHaveLength(12)
    expect(MONTH_SHORT[0]).toBe('Jan')
    expect(MONTH_SHORT[11]).toBe('Dec')
  })
})
