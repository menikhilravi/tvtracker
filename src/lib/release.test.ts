import { describe, expect, it } from 'vitest'
import { isUnreleasedMovie, todayISO } from './release'

const TODAY = '2026-09-05'

describe('todayISO', () => {
  it('reports the local calendar date, not the UTC one', () => {
    // 2026-09-05 21:30 in a UTC-5 zone is already 2026-09-06 in UTC.
    const evening = new Date(2026, 8, 5, 21, 30)
    expect(todayISO(evening)).toBe('2026-09-05')
  })

  it('zero-pads month and day', () => {
    expect(todayISO(new Date(2026, 0, 7))).toBe('2026-01-07')
  })
})

describe('isUnreleasedMovie', () => {
  it('treats a released film with a past date as watchable', () => {
    expect(
      isUnreleasedMovie({ releaseDate: '2024-03-01', productionStatus: 'Released' }, TODAY),
    ).toBe(false)
  })

  it('treats a film released today as watchable', () => {
    expect(isUnreleasedMovie({ releaseDate: TODAY, productionStatus: 'Released' }, TODAY)).toBe(
      false,
    )
  })

  it('flags a released film whose date is still ahead', () => {
    expect(
      isUnreleasedMovie({ releaseDate: '2026-12-18', productionStatus: 'Released' }, TODAY),
    ).toBe(true)
  })

  it('flags an announced film with no date at all', () => {
    expect(isUnreleasedMovie({ releaseDate: null, productionStatus: 'Planned' }, TODAY)).toBe(true)
  })

  it('flags an in-production film carrying a stale past date', () => {
    expect(
      isUnreleasedMovie({ releaseDate: '2026-05-01', productionStatus: 'Post Production' }, TODAY),
    ).toBe(true)
  })

  it.each(['Rumored', 'Planned', 'In Production', 'Post Production'])(
    'treats %s as unreleased',
    (status) => {
      expect(isUnreleasedMovie({ releaseDate: null, productionStatus: status }, TODAY)).toBe(true)
    },
  )

  it('falls back to the date when no status is known', () => {
    expect(isUnreleasedMovie({ releaseDate: '2027-01-01', productionStatus: null }, TODAY)).toBe(
      true,
    )
    expect(isUnreleasedMovie({ releaseDate: '2020-01-01', productionStatus: null }, TODAY)).toBe(
      false,
    )
  })

  it('leaves an undated, statusless movie in the watchlist rather than hiding it', () => {
    expect(isUnreleasedMovie({ releaseDate: null, productionStatus: null }, TODAY)).toBe(false)
  })
})
