import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { addDays, computeStreaks, heatmapCells, HEATMAP_WEEKS } from './activity'

// All of this reads "today", so pin it. Chosen mid-week and mid-month so the
// tests exercise ordinary arithmetic rather than accidentally sitting on a
// boundary that hides an off-by-one.
const TODAY = '2026-08-07' // a Friday
const days = (n: number) => addDays(TODAY, n)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(`${TODAY}T09:00:00Z`))
})
afterEach(() => vi.useRealTimers())

const activity = (...entries: [string, number][]) => new Map(entries)

describe('addDays', () => {
  it('moves forward and backward', () => {
    expect(addDays('2026-08-07', 1)).toBe('2026-08-08')
    expect(addDays('2026-08-07', -1)).toBe('2026-08-06')
    expect(addDays('2026-08-07', 0)).toBe('2026-08-07')
  })

  it('crosses month and year boundaries', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01')
    expect(addDays('2026-09-01', -1)).toBe('2026-08-31')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('handles a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29')
  })
})

describe('computeStreaks', () => {
  it('is zero for no activity', () => {
    expect(computeStreaks(activity())).toEqual({ current: 0, longest: 0 })
  })

  it('treats a day with a zero count as inactive', () => {
    expect(computeStreaks(activity([TODAY, 0]))).toEqual({ current: 0, longest: 0 })
  })

  it('counts a run ending today', () => {
    const byDay = activity([days(-2), 1], [days(-1), 3], [TODAY, 1])
    expect(computeStreaks(byDay)).toEqual({ current: 3, longest: 3 })
  })

  // The grace day: you haven't logged anything yet today, but you watched
  // yesterday — the streak shouldn't be reported as broken.
  it('keeps the streak alive when today is not yet logged', () => {
    const byDay = activity([days(-2), 1], [days(-1), 1])
    expect(computeStreaks(byDay).current).toBe(2)
  })

  it('breaks once a full day is missed', () => {
    const byDay = activity([days(-3), 1], [days(-2), 1])
    expect(computeStreaks(byDay).current).toBe(0)
  })

  it('reports the longest run even when it is not the current one', () => {
    const byDay = activity(
      [days(-20), 1],
      [days(-19), 1],
      [days(-18), 1],
      [days(-17), 1],
      [days(-1), 1],
      [TODAY, 1],
    )
    expect(computeStreaks(byDay)).toEqual({ current: 2, longest: 4 })
  })

  it('measures the whole run regardless of which day seeds the scan', () => {
    // The run-start guard in computeStreaks is an optimization, not a
    // correctness device — Math.max makes rescanning from an interior day
    // harmless. This pins the result the guard is optimizing, so a rewrite of
    // that loop still has to produce the full length.
    const byDay = activity([days(-4), 1], [days(-3), 1], [days(-2), 1])
    expect(computeStreaks(byDay).longest).toBe(3)
  })

  it('handles a run spanning a month boundary', () => {
    const byDay = activity(['2026-07-30', 1], ['2026-07-31', 1], ['2026-08-01', 1])
    expect(computeStreaks(byDay).longest).toBe(3)
  })
})

describe('heatmapCells', () => {
  it('ends on today and starts on a Sunday', () => {
    const cells = heatmapCells(activity())
    expect(cells.at(-1)?.key).toBe(TODAY)
    expect(new Date(cells[0].key + 'T00:00:00Z').getUTCDay()).toBe(0)
  })

  it('covers the full window without gaps or repeats', () => {
    const cells = heatmapCells(activity())
    const keys = cells.map((c) => c.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i]).toBe(addDays(keys[i - 1], 1))
    }
  })

  it('spans at least the requested number of weeks', () => {
    const cells = heatmapCells(activity())
    expect(cells.length).toBeGreaterThanOrEqual(HEATMAP_WEEKS * 7)
    // Sunday alignment can only ever pad the start by up to six days.
    expect(cells.length).toBeLessThan(HEATMAP_WEEKS * 7 + 7)
  })

  it('carries counts through and defaults missing days to zero', () => {
    const cells = heatmapCells(activity([TODAY, 4], [days(-3), 2]))
    expect(cells.at(-1)).toEqual({ key: TODAY, count: 4 })
    expect(cells.find((c) => c.key === days(-3))?.count).toBe(2)
    expect(cells.find((c) => c.key === days(-1))?.count).toBe(0)
  })

  it('ignores activity outside the window', () => {
    const old = addDays(TODAY, -(HEATMAP_WEEKS * 7 + 30))
    const cells = heatmapCells(activity([old, 9]))
    expect(cells.some((c) => c.key === old)).toBe(false)
  })

  // The loop advances a Date by whole days and stops at `today`; a late-evening
  // "now" must not drop the final column.
  it('still ends on today late in the UTC day', () => {
    vi.setSystemTime(new Date(`${TODAY}T23:59:00Z`))
    expect(heatmapCells(activity()).at(-1)?.key).toBe(TODAY)
  })
})
