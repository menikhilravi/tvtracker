import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import {
  useCachedTitles,
  useDatedCharacterVotes,
  useDatedRatings,
  useDatedWatches,
  useFollows,
} from '../lib/tracking'
import {
  aggregateReview,
  charactersInPeriod,
  isCurrentPeriod,
  monthlyMinutes,
  periodLabel,
  reviewKey,
  shiftPeriod,
  topRatedInPeriod,
  MONTH_SHORT,
  type MonthlyBucket,
  type Period,
  type ReviewTitleMeta,
} from '../lib/review'
import { Poster } from '../components/Poster'
import { usePersistedState } from '../lib/uiState'

function formatWatchTime(minutes: number): { value: string; unit: string } {
  const hours = Math.round(minutes / 60)
  if (hours >= 48) return { value: (minutes / 60 / 24).toFixed(1), unit: 'days' }
  return { value: String(hours), unit: 'hours' }
}

const formatDay = (day: string) =>
  new Date(day + 'T12:00:00Z').toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

export function Review() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const now = new Date()
  const [period, setPeriod] = usePersistedState<Period>('review:period', {
    kind: 'year',
    year: now.getUTCFullYear(),
  })

  const watches = useDatedWatches()
  const cached = useCachedTitles()
  const follows = useFollows()
  const datedRatings = useDatedRatings()
  const votes = useDatedCharacterVotes()

  // Runtime and genres come from the cached `titles` rows; names and posters
  // fall back to the follow row, so a title that hasn't been synced yet still
  // shows up with something readable instead of a blank card.
  const meta = new Map<string, ReviewTitleMeta>()
  for (const f of follows.data ?? []) {
    const kind = f.media_type === 'tv' ? 'episode' : 'movie'
    meta.set(reviewKey(kind, f.tmdb_id), {
      name: f.name,
      posterPath: f.poster_path,
      minutes: null,
      genres: [],
    })
  }
  for (const t of (cached.data ?? new Map()).values()) {
    const kind = t.media_type === 'tv' ? 'episode' : 'movie'
    const k = reviewKey(kind, t.tmdb_id)
    const existing = meta.get(k)
    meta.set(k, {
      name: existing?.name ?? null,
      posterPath: existing?.posterPath ?? null,
      minutes: kind === 'episode' ? t.episode_run_time : t.runtime,
      genres: t.genres ?? [],
    })
  }
  const isLoading = watches.isLoading || cached.isLoading || follows.isLoading
  const summary = aggregateReview(watches.data ?? [], meta, period)
  const characters = charactersInPeriod(votes.data ?? [], period)
  const topRated = topRatedInPeriod(datedRatings.data ?? [], meta, period)
  const monthly =
    period.kind === 'year' ? monthlyMinutes(watches.data ?? [], meta, period.year) : null
  const time = formatWatchTime(summary.minutes)
  const label = periodLabel(period)
  const current = isCurrentPeriod(period, now)

  return (
    <div className="px-5 pt-14 pb-6">
      <button onClick={() => navigate(-1)} className="mb-3 text-sm text-muted active:text-ink">
        ‹ Back
      </button>
      <h1 className="text-3xl font-bold tracking-tight">Review</h1>

      {!session ? (
        <p className="mt-6 rounded-2xl border border-line bg-surface/60 p-4 text-sm text-muted">
          Sign in to see your review.
        </p>
      ) : (
        <>
          {/* Year / month switch. Changing kind keeps you in the same moment. */}
          <div className="mt-4 flex gap-1 rounded-2xl border border-line bg-surface/60 p-1">
            {(['year', 'month'] as const).map((kind) => (
              <button
                key={kind}
                onClick={() =>
                  setPeriod(
                    kind === 'year'
                      ? { kind: 'year', year: period.year }
                      : {
                          kind: 'month',
                          year: period.year,
                          month: period.kind === 'month' ? period.month : now.getUTCMonth() + 1,
                        },
                  )
                }
                className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition active:scale-[0.98] ${
                  period.kind === kind
                    ? 'bg-brand-gradient text-white shadow-lg shadow-brand/25'
                    : 'text-muted'
                }`}
              >
                {kind === 'year' ? 'Year' : 'Month'}
              </button>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <button
              onClick={() => setPeriod(shiftPeriod(period, -1))}
              aria-label="Previous period"
              className="grid h-9 w-9 place-items-center rounded-full border border-line bg-surface text-lg active:scale-90"
            >
              ‹
            </button>
            <span className="text-base font-semibold">
              {label}
              {current && <span className="ml-1.5 text-xs font-normal text-faint">so far</span>}
            </span>
            <button
              onClick={() => setPeriod(shiftPeriod(period, 1))}
              disabled={current}
              aria-label="Next period"
              className="grid h-9 w-9 place-items-center rounded-full border border-line bg-surface text-lg active:scale-90 disabled:opacity-30"
            >
              ›
            </button>
          </div>

          {isLoading ? (
            <div className="mt-6 h-40 animate-pulse rounded-3xl border border-line bg-surface/60" />
          ) : summary.episodes + summary.movies === 0 ? (
            <div className="mt-6 rounded-3xl border border-line bg-surface/60 p-8 text-center">
              <div className="text-4xl">🗓️</div>
              <p className="mt-3 text-sm text-muted">Nothing logged in {label}.</p>
            </div>
          ) : (
            <>
              <div className="relative mt-6 overflow-hidden rounded-3xl border border-line bg-brand-gradient p-5 shadow-lg shadow-brand/20">
                <div className="absolute -right-6 -top-8 text-[7rem] leading-none opacity-15 select-none">
                  🍿
                </div>
                <p className="text-xs font-medium uppercase tracking-wider text-white/70">
                  Watched in {label}
                </p>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-4xl font-extrabold tracking-tight text-white">
                    {time.value}
                  </span>
                  <span className="text-lg font-semibold text-white/80">{time.unit}</span>
                </div>
                <p className="mt-1 text-[11px] text-white/60">
                  {summary.unsynced === 0
                    ? 'Actual runtimes'
                    : `Averaged for ${summary.unsynced} watch${
                        summary.unsynced === 1 ? '' : 'es'
                      } with no runtime yet`}
                </p>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-3">
                <Tile icon="📺" value={summary.episodes} label="episodes" />
                <Tile icon="🎬" value={summary.movies} label="movies" />
                <Tile icon="🎞️" value={summary.titles} label="titles" />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3">
                <Tile icon="📅" value={summary.activeDays} label="active days" />
                <Tile icon="🔥" value={summary.longestStreak} label="best streak" />
                <Tile
                  icon="⚡"
                  value={summary.busiestDay?.count ?? 0}
                  label="busiest day"
                />
              </div>

              {summary.busiestDay && (
                <p className="mt-2 text-center text-[11px] text-faint">
                  Busiest: {formatDay(summary.busiestDay.day)}
                </p>
              )}

              {monthly && (
                <section className="mt-7">
                  <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted">
                    Across the year
                  </h2>
                  <MonthlyChart buckets={monthly} />
                </section>
              )}

              {summary.topTitles.length > 0 && (
                <section className="mt-7">
                  <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted">
                    Most watched
                  </h2>
                  <div className="grid grid-cols-3 gap-3">
                    {summary.topTitles.map((t) => (
                      <Link
                        key={`${t.kind}-${t.tmdbId}`}
                        to={`/title/${t.kind === 'episode' ? 'tv' : 'movie'}/${t.tmdbId}`}
                        className="active:scale-[0.97]"
                      >
                        <Poster
                          path={t.posterPath}
                          alt={t.name ?? ''}
                          size="w342"
                          className="aspect-[2/3] w-full shadow-lg shadow-black/40"
                        />
                        <p className="mt-1.5 truncate text-xs font-medium text-ink/90">
                          {t.name ?? 'Unknown title'}
                        </p>
                        <p className="truncate text-[11px] text-faint">
                          {t.kind === 'episode'
                            ? `${t.count} ${t.count === 1 ? 'episode' : 'episodes'}`
                            : `${t.count}×`}{' '}
                          · {Math.round(t.minutes / 60)}h
                        </p>
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              {summary.topGenres.length > 0 && (
                <section className="mt-7">
                  <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted">
                    Top genres
                  </h2>
                  <GenreBars items={summary.topGenres} />
                </section>
              )}

              {topRated.length > 0 && (
                <section className="mt-7">
                  <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted">
                    Rated highest
                  </h2>
                  <div className="grid grid-cols-3 gap-3">
                    {topRated.map((r) => (
                      <Link
                        key={`${r.kind}-${r.tmdbId}`}
                        to={`/title/${r.kind === 'episode' ? 'tv' : 'movie'}/${r.tmdbId}`}
                        className="active:scale-[0.97]"
                      >
                        <div className="relative">
                          <Poster
                            path={r.posterPath}
                            alt={r.name ?? ''}
                            size="w342"
                            className="aspect-[2/3] w-full shadow-lg shadow-black/40"
                          />
                          <span className="absolute left-1.5 top-1.5 rounded-md bg-amber-400 px-1.5 py-0.5 text-[11px] font-bold text-black shadow">
                            ★ {r.score}
                          </span>
                        </div>
                        <p className="mt-1.5 truncate text-xs font-medium text-ink/90">
                          {r.name ?? 'Unknown title'}
                        </p>
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              {characters.length > 0 && (
                <section className="mt-7">
                  <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted">
                    Favorite characters
                  </h2>
                  <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 pb-1">
                    {characters.map((c) => (
                      <Link
                        key={c.personId}
                        to={`/person/${c.personId}`}
                        className="w-20 shrink-0 text-center active:scale-[0.97]"
                      >
                        <Poster
                          path={c.profilePath}
                          alt={c.actorName ?? ''}
                          size="w200"
                          rounded="rounded-full"
                          className="h-20 w-20"
                        />
                        <p className="mt-1.5 truncate text-xs font-medium text-ink/90">
                          {c.characterName || c.actorName || 'Unknown'}
                        </p>
                        <p className="truncate text-[11px] text-faint">
                          {c.votes > 1 ? `${c.votes} picks` : (c.actorName ?? '')}
                        </p>
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              {/* The one thing a period view can't see; better said than hidden. */}
              <p className="mt-7 text-[11px] leading-relaxed text-faint">
                Episodes count once, on the day you first watched them — rewatches increment a
                counter without a date of their own, so they can't be placed in a period. Movie
                rewatches are dated individually and do count. “Rated highest” covers scores you
                gave a whole show or film; per-episode scores aren't dated, so they're left out.
              </p>
            </>
          )}
        </>
      )}
    </div>
  )
}

function Tile({ icon, value, label }: { icon: string; value: number; label: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface/60 px-3 py-4 text-center">
      <div className="text-lg">{icon}</div>
      <div className="mt-1 text-2xl font-bold tracking-tight">{value}</div>
      <div className="mt-0.5 text-[11px] uppercase tracking-wide text-faint">{label}</div>
    </div>
  )
}

// Minutes per month across a year. One series, common baseline, direct labels —
// empty months keep their slot so a quiet stretch reads as quiet.
function MonthlyChart({ buckets }: { buckets: MonthlyBucket[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.minutes))
  return (
    <div className="flex items-end justify-between gap-1">
      {buckets.map((b) => {
        const hours = Math.round(b.minutes / 60)
        return (
          <div key={b.month} className="flex flex-1 flex-col items-center gap-1">
            <span className="h-3 text-[9px] tabular-nums text-faint">{hours || ''}</span>
            <div
              className="w-full max-w-7 rounded-t-[3px] bg-brand-gradient"
              style={{ height: b.minutes ? Math.max(3, Math.round((b.minutes / max) * 88)) : 0 }}
              title={`${MONTH_SHORT[b.month - 1]}: ${hours}h`}
            />
            <span className="text-[9px] text-muted">{MONTH_SHORT[b.month - 1]}</span>
          </div>
        )
      })}
    </div>
  )
}

// Minutes per genre. Single hue — the labels carry identity, so no legend.
function GenreBars({ items }: { items: [string, number][] }) {
  const max = Math.max(...items.map(([, v]) => v))
  return (
    <div className="space-y-1.5">
      {items.map(([name, mins]) => (
        <div key={name} className="flex items-center gap-2">
          <span className="w-28 shrink-0 truncate text-xs text-ink/90">{name}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-brand-gradient"
              style={{ width: `${Math.max(4, (mins / max) * 100)}%` }}
            />
          </div>
          <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted">
            {Math.round(mins / 60)}h
          </span>
        </div>
      ))}
    </div>
  )
}
