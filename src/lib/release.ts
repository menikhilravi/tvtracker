// Deciding whether a movie is out yet — shared by the watchlist split, the
// upcoming calendar and the stats charts so they can't drift apart.

export interface ReleaseInfo {
  releaseDate: string | null
  productionStatus: string | null
}

// Today's *local* calendar date as `YYYY-MM-DD`. Deliberately not
// `toISOString().slice(0, 10)`: that reports the UTC date, so for anyone west
// of Greenwich the evening already counts as tomorrow and a film releasing
// today drops out of the upcoming lists a few hours early.
export function todayISO(now: Date = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${m}-${d}`
}

// TMDB's movie production statuses that mean "not out yet". The date alone
// isn't enough: an announced sequel often has no date at all (TMDB sends an
// empty string), and a film that slipped can still carry a stale estimate in
// the past — both used to look "released" and sat in the watchlist.
const UNRELEASED_STATUSES = new Set(['Rumored', 'Planned', 'In Production', 'Post Production'])

// True when a movie can't be watched yet. Status wins where TMDB has one,
// since it's maintained more carefully than the primary release date; the date
// only decides for a film TMDB already considers released or cancelled.
export function isUnreleasedMovie(m: ReleaseInfo, today: string = todayISO()): boolean {
  if (m.productionStatus && UNRELEASED_STATUSES.has(m.productionStatus)) return true
  // No status to go on (an older cached row) falls back to the date, and an
  // undated movie there stays in the watchlist rather than being hidden.
  return Boolean(m.releaseDate && m.releaseDate > today)
}
