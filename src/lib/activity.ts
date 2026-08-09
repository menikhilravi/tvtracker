// Date math behind the activity heatmap and streaks on the Stats page.
//
// Lives here rather than in the page because it's the fiddliest logic in the
// app — day bucketing, timezone edges, run detection — and it's pure, so it can
// be tested without rendering anything.
//
// Everything works in UTC days, matching how watch counts are bucketed
// (`watched_at.slice(0, 10)`).

export const HEATMAP_WEEKS = 26

/** Shift a 'YYYY-MM-DD' day by n days (UTC). */
export function addDays(day: string, n: number): string {
  const d = new Date(day + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function computeStreaks(byDay: Map<string, number>): { current: number; longest: number } {
  const active = new Set([...byDay.keys()].filter((k) => (byDay.get(k) ?? 0) > 0))
  if (active.size === 0) return { current: 0, longest: 0 }

  let longest = 0
  for (const day of active) {
    // Skip interior days: scanning from one gives the same answer via Math.max
    // below, just after redundant work.
    if (active.has(addDays(day, -1))) continue
    let len = 1
    let cur = day
    while (active.has(addDays(cur, 1))) {
      cur = addDays(cur, 1)
      len++
    }
    longest = Math.max(longest, len)
  }

  // Current streak counts back from today; today not yet logged is fine if
  // yesterday was, so the streak doesn't "break" until you miss a full day.
  const today = new Date().toISOString().slice(0, 10)
  let start: string | null = active.has(today)
    ? today
    : active.has(addDays(today, -1))
      ? addDays(today, -1)
      : null
  let current = 0
  while (start && active.has(start)) {
    current++
    start = addDays(start, -1)
  }
  return { current, longest }
}

/** Cells for a Sunday-aligned heatmap grid ending today (fills column by column). */
export function heatmapCells(byDay: Map<string, number>): { key: string; count: number }[] {
  const today = new Date()
  const start = new Date(today)
  start.setUTCDate(start.getUTCDate() - (HEATMAP_WEEKS * 7 - 1))
  start.setUTCDate(start.getUTCDate() - start.getUTCDay()) // back to Sunday
  const cells: { key: string; count: number }[] = []
  for (let d = new Date(start); d <= today; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().slice(0, 10)
    cells.push({ key, count: byDay.get(key) ?? 0 })
  }
  return cells
}
