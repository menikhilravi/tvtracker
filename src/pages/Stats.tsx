import { Link } from 'react-router-dom'
import { useQueries } from '@tanstack/react-query'
import { useAuth } from '../lib/auth'
import {
  useStats,
  useWatchActivity,
  useFollows,
  useAllEpisodeWatches,
  useWatchedMovieIds,
} from '../lib/tracking'
import { getTitle } from '../lib/tmdb'
import type { TitleDetail } from '../lib/types'

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
          <TvStats />
          <MovieStats />
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

function TimeTile({ value, unit }: { value: string; unit: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface/60 px-3 py-4 text-center">
      <div className="text-lg">⏱️</div>
      <div className="mt-1 text-2xl font-bold tracking-tight">{value}</div>
      <div className="mt-0.5 text-[11px] uppercase tracking-wide text-faint">{unit} watched</div>
    </div>
  )
}

// --- TV & Movies breakdowns -------------------------------------------------
// These need per-title TMDB detail (genres, networks, runtimes, episode
// counts), so they fetch getTitle for every tracked title — cached and shared
// with the detail pages. On a large library the first load takes a moment.

function formatWatchTime(minutes: number): { value: string; unit: string } {
  const hours = Math.round(minutes / 60)
  if (hours >= 48) return { value: (minutes / 60 / 24).toFixed(1), unit: 'days' }
  return { value: String(hours), unit: 'hours' }
}

const topN = (tally: Map<string, number>, n: number): [string, number][] =>
  [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)

const todayISO = () => new Date().toISOString().slice(0, 10)

function TvStats() {
  const { data: follows } = useFollows()
  const epWatches = useAllEpisodeWatches()
  const tvFollows = (follows ?? []).filter((f) => f.media_type === 'tv')

  const details = useQueries({
    queries: tvFollows.map((f) => ({
      queryKey: ['title', 'tv', f.tmdb_id],
      queryFn: () => getTitle('tv', f.tmdb_id),
    })),
  })

  if (tvFollows.length === 0) return null

  const statusById = new Map(tvFollows.map((f) => [f.tmdb_id, f.status]))
  const epMap = epWatches.data ?? new Map<number, Set<string>>()
  const watchedIn = (id: number) => epMap.get(id)?.size ?? 0
  const resolved = details.map((d) => d.data).filter((d): d is TitleDetail => Boolean(d))
  const loading = details.some((d) => d.isLoading)

  let minutes = 0
  let remaining = 0
  let episodesWatched = 0
  const genres = new Map<string, number>()
  const networks = new Map<string, number>()
  for (const d of resolved) {
    const w = watchedIn(d.id)
    episodesWatched += w
    minutes += w * (d.episodeRunTime || 40)
    if (statusById.get(d.id) === 'watching') {
      remaining += Math.max(0, (d.numberOfEpisodes ?? 0) - w)
    }
    for (const g of d.genres) genres.set(g, (genres.get(g) ?? 0) + 1)
    for (const n of d.networks) networks.set(n, (networks.get(n) ?? 0) + 1)
  }
  const upcoming = resolved
    .map((d) => d.nextEpisodeToAir?.airDate)
    .filter((x): x is string => typeof x === 'string' && x >= todayISO())
  const time = formatWatchTime(minutes)

  return (
    <section className="mt-8">
      <SectionHeading icon="📺" label="TV Shows" loading={loading} />
      <div className="grid grid-cols-2 gap-3">
        <StatTile icon="📺" value={tvFollows.length} label="shows" />
        <TimeTile value={time.value} unit={time.unit} />
        <StatTile icon="✓" value={episodesWatched} label="episodes" />
        <StatTile icon="⏳" value={remaining} label="remaining" />
      </div>
      <BarList title="Top genres" items={topN(genres, 5)} />
      <BarList title="Top networks" items={topN(networks, 5)} />
      <MonthChart title="Upcoming episodes" dates={upcoming} />
    </section>
  )
}

function MovieStats() {
  const { data: follows } = useFollows()
  const watchedIds = useWatchedMovieIds()
  const movieFollows = (follows ?? []).filter((f) => f.media_type === 'movie')

  const details = useQueries({
    queries: movieFollows.map((f) => ({
      queryKey: ['title', 'movie', f.tmdb_id],
      queryFn: () => getTitle('movie', f.tmdb_id),
    })),
  })

  if (movieFollows.length === 0) return null

  const resolved = details.map((d) => d.data).filter((d): d is TitleDetail => Boolean(d))
  const loading = details.some((d) => d.isLoading)
  const watched = watchedIds.data ?? new Set<number>()

  let minutes = 0
  let watchedCount = 0
  const genres = new Map<string, number>()
  for (const d of resolved) {
    if (watched.has(d.id)) {
      watchedCount++
      minutes += d.runtime ?? 115
    }
    for (const g of d.genres) genres.set(g, (genres.get(g) ?? 0) + 1)
  }
  const upcoming = resolved
    .map((d) => d.releaseDate)
    .filter((x): x is string => typeof x === 'string' && x >= todayISO())
  const time = formatWatchTime(minutes)

  return (
    <section className="mt-8">
      <SectionHeading icon="🎬" label="Movies" loading={loading} />
      <div className="grid grid-cols-2 gap-3">
        <StatTile icon="🎬" value={movieFollows.length} label="movies" />
        <TimeTile value={time.value} unit={time.unit} />
        <StatTile icon="✓" value={watchedCount} label="watched" />
        <StatTile icon="🍿" value={Math.max(0, movieFollows.length - watchedCount)} label="to watch" />
      </div>
      <BarList title="Top genres" items={topN(genres, 5)} />
      <MonthChart title="Upcoming releases" dates={upcoming} />
    </section>
  )
}

function SectionHeading({ icon, label, loading }: { icon: string; label: string; loading: boolean }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-wide text-muted">
      <span>
        {icon} {label}
      </span>
      {loading && <span className="text-[11px] font-normal text-faint">crunching…</span>}
    </h2>
  )
}

// A ranked horizontal bar list (genres / networks). Single hue — identity is
// carried by the labels, so no legend or per-series color is needed.
function BarList({ title, items }: { title: string; items: [string, number][] }) {
  if (items.length === 0) return null
  const max = Math.max(...items.map(([, v]) => v))
  return (
    <div className="mt-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">{title}</h3>
      <div className="space-y-1.5">
        {items.map(([name, count]) => (
          <div key={name} className="flex items-center gap-2">
            <span className="w-28 shrink-0 truncate text-xs text-ink/90">{name}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-brand-gradient"
                style={{ width: `${Math.max(4, (count / max) * 100)}%` }}
              />
            </div>
            <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted">{count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// A vertical bar chart of counts across the next 6 months. One series, so bars
// are a single brand hue, anchored to a common baseline with direct labels.
function MonthChart({ title, dates }: { title: string; dates: string[] }) {
  const now = new Date()
  const buckets = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    return {
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString(undefined, { month: 'short' }),
      count: 0,
    }
  })
  const idx = new Map(buckets.map((b, i) => [b.key, i]))
  for (const iso of dates) {
    const i = idx.get(iso.slice(0, 7))
    if (i !== undefined) buckets[i].count++
  }

  const total = buckets.reduce((a, b) => a + b.count, 0)
  const max = Math.max(1, ...buckets.map((b) => b.count))
  return (
    <div className="mt-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">{title}</h3>
      {total === 0 ? (
        <p className="text-xs text-muted">Nothing scheduled in the next 6 months.</p>
      ) : (
        <div className="flex items-end justify-between gap-2">
          {buckets.map((b) => {
            const height = b.count ? Math.max(4, Math.round((b.count / max) * 88)) : 0
            return (
              <div key={b.key} className="flex flex-1 flex-col items-center gap-1">
                <span className="h-3 text-[10px] tabular-nums text-faint">{b.count || ''}</span>
                <div
                  className="w-full max-w-8 rounded-t-[4px] bg-brand-gradient"
                  style={{ height }}
                  title={`${b.label}: ${b.count}`}
                />
                <span className="text-[10px] text-muted">{b.label}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
