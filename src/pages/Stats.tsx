import { Link } from 'react-router-dom'
import { useQueries } from '@tanstack/react-query'
import { useAuth } from '../lib/auth'
import {
  useStats,
  useWatchActivity,
  useFollows,
  useAllEpisodeWatches,
  useWatchedMovieIds,
  useCachedTitles,
  useDetailCoverage,
  watchedMovieIds,
  statsFollows,
  airedProgress,
  titleKey,
  FALLBACK_EPISODE_MINUTES,
  FALLBACK_MOVIE_MINUTES,
  type CachedTitle,
} from '../lib/tracking'
import { getTitle } from '../lib/tmdb'
import type { TitleDetail } from '../lib/types'
import { usePersistedState } from '../lib/uiState'
import { HEATMAP_WEEKS, computeStreaks, heatmapCells } from '../lib/activity'
import { todayISO } from '../lib/release'

// Stats + activity, split out of Profile onto their own page.
export function Stats() {
  const { session } = useAuth()
  const [tab, setTab] = usePersistedState<'tv' | 'movie'>('stats:tab', 'tv')
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
          <Link
            to="/review"
            className="mt-3 flex items-center justify-between rounded-2xl border border-line bg-surface/60 px-5 py-3.5 font-medium active:scale-[0.98]"
          >
            <span>🗓️ Year & month in review</span>
            <span className="text-faint">›</span>
          </Link>
          <SyncHint />
          <ActivitySection />

          <div className="mt-8 flex gap-1 rounded-2xl border border-line bg-surface/60 p-1">
            {(
              [
                { key: 'tv', label: '📺 TV Shows' },
                { key: 'movie', label: '🎬 Movies' },
              ] as { key: 'tv' | 'movie'; label: string }[]
            ).map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition active:scale-[0.98] ${
                  tab === t.key ? 'bg-brand-gradient text-white shadow-lg shadow-brand/25' : 'text-muted'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'tv' ? <TvStats /> : <MovieStats />}
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

  // All three are "how much have I watched" counts over the same population as
  // the per-media tabs below, so the two sections can't contradict each other.
  // "Finished" used to add shows and movies together, which made it larger than
  // the movie count sitting next to it.
  const tiles = [
    { icon: '📺', label: 'Episodes', value: stats.episodesWatched },
    { icon: '🎬', label: 'Movies', value: stats.moviesWatched },
    { icon: '✓', label: 'Shows done', value: stats.showsFinished },
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
        <p className="mt-1 text-[11px] text-white/60">
          {stats.unsyncedWatched === 0
            ? 'Actual runtimes across everything you’ve watched'
            : `Actual runtimes, averaged for ${stats.unsyncedWatched} title${
                stats.unsyncedWatched === 1 ? '' : 's'
              } not yet synced`}
        </p>
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

// Nudge toward the one-off sync when part of the library has no cached detail:
// those titles fall back to flat averages and drop out of the breakdowns below.
function SyncHint() {
  const { data: coverage } = useDetailCoverage()
  if (!coverage || coverage.missing.length === 0) return null
  return (
    <Link
      to="/settings"
      className="mt-3 flex items-center gap-3 rounded-2xl border border-line bg-surface/60 p-4 active:scale-[0.99]"
    >
      <span className="text-lg">🧩</span>
      <span className="min-w-0 flex-1 text-xs text-muted">
        {coverage.missing.length} of {coverage.total} titles have no runtime or genre data yet.
        Sync them in Settings for exact numbers.
      </span>
      <span className="shrink-0 text-sm text-muted">›</span>
    </Link>
  )
}

// --- Activity (heatmap + streaks) -------------------------------------------

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
          Last {HEATMAP_WEEKS} weeks. Imported history keeps the dates TV Time recorded; watches
          it couldn’t date fall on your import day. Any of them can be corrected in History.
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
// Runtimes, genres and networks come from the `titles` cache in a single read
// (see useCachedTitles). Only figures that depend on genuinely live data — how
// many aired episodes you have left, when the next one airs — still need a
// per-title TMDB fetch, and only for shows you're actively watching.

function formatWatchTime(minutes: number): { value: string; unit: string } {
  const hours = Math.round(minutes / 60)
  if (hours >= 48) return { value: (minutes / 60 / 24).toFixed(1), unit: 'days' }
  return { value: String(hours), unit: 'hours' }
}

const topN = (tally: Map<string, number>, n: number): [string, number][] =>
  [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)

function TvStats() {
  const follows = useFollows()
  const epWatches = useAllEpisodeWatches()
  const watchIds = useWatchedMovieIds()
  const cached = useCachedTitles()
  // statsFollows, not the raw library — see its comment. The summary tiles count
  // the same population, so the two sections always agree.
  const tvFollows = statsFollows(
    follows.data ?? [],
    epWatches.data?.byShow ?? new Map(),
    watchIds.data ?? new Set(),
  ).filter((f) => f.media_type === 'tv')

  // Only shows you're actively watching still need a live fetch — "episodes
  // left" counts against *aired* episodes and the upcoming chart needs the next
  // air date, neither of which can be cached without going stale. This used to
  // run over every tracked show, which on a large library meant hundreds of
  // proxy requests each time the page mounted.
  const watchingTv = tvFollows.filter((f) => f.status === 'watching')
  const details = useQueries({
    queries: watchingTv.map((f) => ({
      queryKey: ['title', 'tv', f.tmdb_id],
      queryFn: () => getTitle('tv', f.tmdb_id),
      // Back off and retry so transient proxy rate-limits recover instead of
      // dropping titles (which made the breakdowns fluctuate between loads).
      retry: 3,
      retryDelay: (n: number) => Math.min(1000 * 2 ** n, 8000),
    })),
  })

  // Wait for the DB rows *and* the details to settle. Watch data loading a beat
  // behind a warm TMDB cache used to render tiles from an empty watch map,
  // which showed 0 watched and every episode as "remaining".
  const loading =
    follows.isLoading ||
    epWatches.isLoading ||
    watchIds.isLoading ||
    cached.isLoading ||
    details.some((d) => d.isLoading)
  if (loading) return <StatsSectionSkeleton icon="📺" label="TV Shows" tiles={4} />
  if (tvFollows.length === 0) return null

  const epMap = epWatches.data?.byShow ?? new Map<number, Set<string>>()
  const meta = cached.data ?? new Map<string, CachedTitle>()
  const resolved = details.map((d) => d.data).filter((d): d is TitleDetail => Boolean(d))
  const detailById = new Map(resolved.map((d) => [d.id, d]))

  // Hard counts come straight from the paginated DB data (epMap), so they stay
  // exact and stable even if a TMDB fetch fails. Cached detail refines the
  // runtime estimate and the genre/network breakdowns; live detail refines
  // "episodes left".
  let minutes = 0
  let remaining = 0
  let episodesWatched = 0
  const genres = new Map<string, number>()
  const networks = new Map<string, number>()
  for (const f of tvFollows) {
    const w = epMap.get(f.tmdb_id)?.size ?? 0
    episodesWatched += w
    const m = meta.get(titleKey('tv', f.tmdb_id))
    // Distinct episodes for the count, total plays for the time — see useStats.
    const plays = epWatches.data?.playsByShow.get(f.tmdb_id) ?? w
    minutes += plays * (m?.episode_run_time || FALLBACK_EPISODE_MINUTES)
    for (const g of m?.genres ?? []) genres.set(g, (genres.get(g) ?? 0) + 1)
    for (const n of m?.networks ?? []) networks.set(n, (networks.get(n) ?? 0) + 1)

    // Episodes left on shows you're mid-way through. Counted against *aired*
    // episodes via the same helper the detail page's progress bar uses —
    // numberOfEpisodes includes unaired episodes and excludes specials, so
    // subtracting the raw watch count double-counted both ways and inflated
    // this badly on a large library.
    const d = detailById.get(f.tmdb_id)
    if (d) {
      const p = airedProgress(d, epMap.get(f.tmdb_id) ?? new Set())
      remaining += Math.max(0, p.total - p.done)
    }
  }
  const upcoming = resolved
    .map((d) => d.nextEpisodeToAir?.airDate)
    .filter((x): x is string => typeof x === 'string' && x >= todayISO())
  const time = formatWatchTime(minutes)

  return (
    <section className="mt-6">
      <SectionHeading icon="📺" label="TV Shows" loading={loading} />
      <div className="grid grid-cols-2 gap-3">
        <StatTile icon="📺" value={tvFollows.length} label="shows" />
        <TimeTile value={time.value} unit={time.unit} />
        <StatTile icon="✓" value={episodesWatched} label="episodes" />
        <StatTile icon="⏳" value={remaining} label="episodes left" />
      </div>
      <BarList title="Top genres" items={topN(genres, 5)} />
      <BarList title="Top networks" items={topN(networks, 5)} />
      <MonthChart title="Upcoming episodes" dates={upcoming} />
    </section>
  )
}

function MovieStats() {
  const follows = useFollows()
  const watchIds = useWatchedMovieIds()
  const epWatches = useAllEpisodeWatches()
  const cached = useCachedTitles()
  // See TvStats — same population as the summary tiles.
  const movieFollows = statsFollows(
    follows.data ?? [],
    epWatches.data?.byShow ?? new Map(),
    watchIds.data ?? new Set(),
  ).filter((f) => f.media_type === 'movie')

  // Everything here — runtime, genres, release date — is stable, so once the
  // library is synced this section makes no TMDB requests at all.
  // See TvStats: wait for the watch set too, or a warm cache renders the tiles
  // against an empty set and reports every movie as unwatched.
  const loading =
    follows.isLoading || watchIds.isLoading || epWatches.isLoading || cached.isLoading
  if (loading) return <StatsSectionSkeleton icon="🎬" label="Movies" tiles={4} />
  if (movieFollows.length === 0) return null

  const meta = cached.data ?? new Map<string, CachedTitle>()
  const watched = watchedMovieIds(movieFollows, watchIds.data ?? new Set<number>())

  // Both counts are DB-derived (follow status + logged watches) so they stay
  // exact regardless of how much detail is cached; the cache only refines the
  // runtime-based time estimate and the genre breakdown.
  let minutes = 0
  let watchedCount = 0
  let toWatch = 0
  const genres = new Map<string, number>()
  const upcoming: string[] = []
  for (const f of movieFollows) {
    const m = meta.get(titleKey('movie', f.tmdb_id))
    for (const g of m?.genres ?? []) genres.set(g, (genres.get(g) ?? 0) + 1)
    if (m?.release_date && m.release_date >= todayISO()) upcoming.push(m.release_date)
    if (watched.has(f.tmdb_id)) {
      watchedCount++
      minutes += m?.runtime || FALLBACK_MOVIE_MINUTES
    } else if (f.status !== 'dropped') {
      // A movie you gave up on isn't waiting to be watched.
      toWatch++
    }
  }
  const time = formatWatchTime(minutes)

  return (
    <section className="mt-6">
      <SectionHeading icon="🎬" label="Movies" loading={loading} />
      <div className="grid grid-cols-2 gap-3">
        <StatTile icon="🎬" value={movieFollows.length} label="movies" />
        <TimeTile value={time.value} unit={time.unit} />
        <StatTile icon="✓" value={watchedCount} label="watched" />
        <StatTile icon="🍿" value={toWatch} label="to watch" />
      </div>
      <BarList title="Top genres" items={topN(genres, 5)} />
      <MonthChart title="Upcoming releases" dates={upcoming} />
    </section>
  )
}

// While the per-title details load (cold cache), show a skeleton instead of
// numbers computed from partial data — otherwise the tiles visibly climb.
function StatsSectionSkeleton({ icon, label, tiles }: { icon: string; label: string; tiles: number }) {
  return (
    <section className="mt-6">
      <SectionHeading icon={icon} label={label} loading />
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: tiles }).map((_, i) => (
          <div key={i} className="h-[92px] animate-pulse rounded-2xl border border-line bg-surface/60" />
        ))}
      </div>
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
