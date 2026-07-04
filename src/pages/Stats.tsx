import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useStats, useWatchActivity } from '../lib/tracking'

// Stats + activity, split out of Profile onto their own page.
export function Stats() {
  const { session } = useAuth()
  return (
    <div className="px-5 pt-14 pb-6">
      <Link to="/profile" className="inline-flex items-center gap-1 text-sm text-muted active:opacity-70">
        ‹ Profile
      </Link>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Stats</h1>

      {!session ? (
        <p className="mt-6 rounded-2xl border border-line bg-surface/60 p-4 text-sm text-muted">
          Sign in to see your stats.
        </p>
      ) : (
        <>
          <StatsSection />
          <ActivitySection />
        </>
      )}
    </div>
  )
}

function StatsSection() {
  const { data: stats } = useStats()
  if (!stats) return null

  const hours = Math.round(stats.estimatedMinutes / 60)
  const days = stats.estimatedMinutes / 60 / 24
  const timeValue = hours >= 48 ? days.toFixed(1) : String(hours)
  const timeUnit = hours >= 48 ? 'days' : 'hours'

  const tiles = [
    { icon: '📺', label: 'Episodes', value: stats.episodesWatched },
    { icon: '🎬', label: 'Movies', value: stats.moviesWatched },
    { icon: '✓', label: 'Finished', value: stats.completed },
  ]

  return (
    <div className="mt-6">
      <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted">Your stats</h2>

      {/* Hero: estimated watch time. */}
      <div className="relative overflow-hidden rounded-3xl border border-line bg-brand-gradient p-5 shadow-lg shadow-brand/20">
        <div className="absolute -right-6 -top-8 text-[7rem] leading-none opacity-15 select-none">⏱️</div>
        <p className="text-xs font-medium uppercase tracking-wider text-white/70">Time watched</p>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-4xl font-extrabold tracking-tight text-white">{timeValue}</span>
          <span className="text-lg font-semibold text-white/80">{timeUnit}</span>
        </div>
        <p className="mt-1 text-[11px] text-white/60">Estimated across everything you’ve watched</p>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl border border-line bg-surface/60 px-3 py-4 text-center">
            <div className="text-lg">{t.icon}</div>
            <div className="mt-1 text-2xl font-bold tracking-tight">{t.value}</div>
            <div className="mt-0.5 text-[11px] uppercase tracking-wide text-faint">{t.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// --- Activity (heatmap + streaks) -------------------------------------------

const HEATMAP_WEEKS = 26

// Shift a 'YYYY-MM-DD' day by n days (UTC), matching how watched_at is bucketed.
function addDays(day: string, n: number): string {
  const d = new Date(day + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function computeStreaks(byDay: Map<string, number>): { current: number; longest: number } {
  const active = new Set([...byDay.keys()].filter((k) => (byDay.get(k) ?? 0) > 0))
  if (active.size === 0) return { current: 0, longest: 0 }

  let longest = 0
  for (const day of active) {
    if (active.has(addDays(day, -1))) continue // not the start of a run
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

// Cells for a Sunday-aligned heatmap grid ending today (fills column by column).
function heatmapCells(byDay: Map<string, number>): { key: string; count: number }[] {
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

function cellClass(count: number): string {
  if (count === 0) return 'bg-surface-2'
  if (count <= 2) return 'bg-brand/30'
  if (count <= 5) return 'bg-brand/60'
  return 'bg-brand'
}

function ActivitySection() {
  const { data: byDay } = useWatchActivity()
  if (!byDay) return null

  const { current, longest } = computeStreaks(byDay)
  const cells = heatmapCells(byDay)
  const activeDays = [...byDay.values()].filter((c) => c > 0).length

  return (
    <div className="mt-6">
      <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted">Activity</h2>

      <div className="grid grid-cols-3 gap-3">
        <StatTile icon="🔥" value={current} label="day streak" />
        <StatTile icon="🏆" value={longest} label="longest" />
        <StatTile icon="📅" value={activeDays} label="active days" />
      </div>

      <div className="mt-3 rounded-2xl border border-line bg-surface/60 p-4">
        <div className="no-scrollbar overflow-x-auto pb-1">
          <div className="grid grid-flow-col grid-rows-[repeat(7,auto)] gap-[3px]">
            {cells.map((c) => (
              <div
                key={c.key}
                title={`${c.key}: ${c.count} watched`}
                className={`h-3 w-3 rounded-[3px] ${cellClass(c.count)}`}
              />
            ))}
          </div>
        </div>
        <p className="mt-3 text-[11px] text-faint">
          Last {HEATMAP_WEEKS} weeks. Reflects watches logged in the app — imported history
          isn’t dated, so it appears on your import day.
        </p>
      </div>
    </div>
  )
}

function StatTile({ icon, value, label }: { icon: string; value: number; label: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface/60 px-3 py-4 text-center">
      <div className="text-lg">{icon}</div>
      <div className="mt-1 text-2xl font-bold tracking-tight">{value}</div>
      <div className="mt-0.5 text-[11px] uppercase tracking-wide text-faint">{label}</div>
    </div>
  )
}
