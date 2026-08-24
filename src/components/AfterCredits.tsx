// "After the credits" — a post-watch feed that unlocks once you've seen a title
// (a logged movie watch / any watched episode / marked completed). Everything
// here is spoiler-adjacent by design, which is exactly why it's gated: bloopers
// and BTS videos, fan reviews, the episode-ratings curve, stills, and fact
// cards computed from TMDB + your own watch history.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueries } from '@tanstack/react-query'
import { getPerson, getSeason, IMG } from '../lib/tmdb'
import type { Episode, Review, SearchResult, TitleDetail, Video } from '../lib/types'
import { Poster } from './Poster'
import { useAuth } from '../lib/auth'
import {
  trackedKey,
  useFollow,
  useFollowStatusMap,
  useEpisodeWatches,
  useMovieWatchCounts,
  useRating,
  FALLBACK_EPISODE_MINUTES,
  FALLBACK_MOVIE_MINUTES,
  type FollowStatus,
} from '../lib/tracking'

export function AfterCredits({ title }: { title: TitleDetail }) {
  const { session } = useAuth()
  if (!session) return null
  return title.media_type === 'movie' ? <MovieGate title={title} /> : <TvGate title={title} />
}

// --- Unlock gates (movie: a logged watch; tv: any watched episode) ----------

function MovieGate({ title }: { title: TitleDetail }) {
  const { status } = useFollow(title)
  const { data: counts } = useMovieWatchCounts()
  const plays = counts?.get(title.id) ?? 0
  const unlocked = plays > 0 || status === 'completed'

  if (!unlocked) return status ? <LockedTeaser hint="Log a watch" /> : null

  const runtime = title.runtime ?? FALLBACK_MOVIE_MINUTES
  return (
    <Feed
      title={title}
      minutesSpent={Math.max(plays, 1) * runtime}
      timeCaption={plays > 1 ? `watched ${plays} times` : 'spent in this world'}
      watchedSet={null}
      spoilersOk
    />
  )
}

function TvGate({ title }: { title: TitleDetail }) {
  const { status } = useFollow(title)
  const watches = useEpisodeWatches(title.id)
  const watched = watches.data?.watched ?? new Set<string>()
  const unlocked = watched.size > 0 || status === 'completed'

  if (!unlocked) return status ? <LockedTeaser hint="Watch an episode" /> : null

  // Rewatches count toward time spent — that's the fun of the number.
  let totalPlays = 0
  for (const p of watches.data?.plays.values() ?? []) totalPlays += p
  const runtime = title.episodeRunTime ?? FALLBACK_EPISODE_MINUTES

  return (
    <Feed
      title={title}
      minutesSpent={Math.max(totalPlays, watched.size) * runtime}
      timeCaption={`across ${watched.size} episode${watched.size === 1 ? '' : 's'}`}
      watchedSet={watched}
      // Reviews can spoil episodes you haven't reached; keep them blurred until
      // the show is marked finished.
      spoilersOk={status === 'completed'}
    />
  )
}

function LockedTeaser({ hint }: { hint: string }) {
  return (
    <section className="mt-7 rounded-2xl border border-dashed border-line bg-surface/40 p-4 text-center">
      <p className="text-sm font-semibold">🔒 After the credits</p>
      <p className="mt-1 text-xs text-muted">
        {hint} to unlock bloopers, fan reviews, the ratings curve and behind-the-scenes facts.
      </p>
    </section>
  )
}

// --- The feed ---------------------------------------------------------------

function Feed({
  title,
  minutesSpent,
  timeCaption,
  watchedSet,
  spoilersOk,
}: {
  title: TitleDetail
  minutesSpent: number
  timeCaption: string
  watchedSet: Set<string> | null
  spoilersOk: boolean
}) {
  const leadVideos = title.videos.slice(0, 2)
  const moreVideos = title.videos.slice(2, 4)
  const reviews = title.reviews.slice(0, 4)

  return (
    <section className="mt-7">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-sm font-semibold tracking-wide text-muted">After the credits</h2>
        <span className="rounded-full bg-watched/15 px-2 py-0.5 text-[10px] font-semibold text-watched">
          ✓ Unlocked
        </span>
      </div>

      <div className="space-y-4">
        <FactStrip title={title} minutesSpent={minutesSpent} timeCaption={timeCaption} />

        {title.media_type === 'tv' && (
          <RatingCurveCard show={title} watchedSet={watchedSet ?? new Set()} />
        )}

        <CastConnections title={title} />

        {leadVideos.map((v) => (
          <VideoCard key={v.key} video={v} />
        ))}

        {title.backdrops.length > 1 && <StillsStrip title={title} />}

        {reviews.map((r) => (
          <ReviewCard key={r.id} review={r} blur={!spoilersOk} />
        ))}

        {moreVideos.map((v) => (
          <VideoCard key={v.key} video={v} />
        ))}

        {title.keywords.length > 0 && <ThemeChips keywords={title.keywords} />}
      </div>
    </section>
  )
}

// --- Fact cards -------------------------------------------------------------

const fmtMoney = (n: number) => (n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : `$${Math.round(n / 1e6)}M`)

const fmtDuration = (mins: number) => {
  const h = Math.floor(mins / 60)
  const m = Math.round(mins % 60)
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`
}

function FactStrip({
  title,
  minutesSpent,
  timeCaption,
}: {
  title: TitleDetail
  minutesSpent: number
  timeCaption: string
}) {
  const { rating } = useRating(title)

  const facts: { big: string; caption: string }[] = []

  facts.push({ big: fmtDuration(minutesSpent), caption: timeCaption })

  if (rating?.score && title.voteAverage) {
    facts.push({
      big: `★${rating.score}`,
      caption: `you, vs ★${title.voteAverage.toFixed(1)} worldwide`,
    })
  } else if (title.voteAverage) {
    facts.push({ big: `★${title.voteAverage.toFixed(1)}`, caption: 'TMDB community score' })
  }

  if (title.budget && title.revenue && title.budget >= 1e6 && title.revenue >= 1e6) {
    facts.push({
      big: `${(title.revenue / title.budget).toFixed(1)}×`,
      caption: `made for ${fmtMoney(title.budget)}, grossed ${fmtMoney(title.revenue)}`,
    })
  } else if (title.revenue && title.revenue >= 1e6) {
    facts.push({ big: fmtMoney(title.revenue), caption: 'worldwide box office' })
  }

  if (title.media_type === 'tv' && title.numberOfEpisodes) {
    facts.push({
      big: `${title.numberOfEpisodes} eps`,
      caption: `${title.seasons.length} season${title.seasons.length === 1 ? '' : 's'}${
        title.networks[0] ? ` on ${title.networks[0]}` : ''
      }`,
    })
  }

  if (title.releaseDate) {
    const t = Date.parse(title.releaseDate)
    const years = Math.floor((Date.now() - t) / (365.25 * 24 * 3600e3))
    if (years >= 1) {
      const when = new Date(t).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
      facts.push({ big: `${years} yr${years === 1 ? '' : 's'}`, caption: `since release · ${when}` })
    }
  }

  return (
    <div className="no-scrollbar -mx-5 flex snap-x gap-3 overflow-x-auto px-5 pb-1">
      {title.tagline && (
        <div className="min-w-[200px] max-w-[260px] shrink-0 snap-start rounded-2xl border border-line bg-surface/60 p-3.5">
          <p className="text-sm italic leading-snug text-ink/90">“{title.tagline}”</p>
          <p className="mt-1.5 text-[11px] text-faint">the tagline</p>
        </div>
      )}
      {facts.map((f) => (
        <div
          key={f.caption}
          className="min-w-[130px] shrink-0 snap-start rounded-2xl border border-line bg-surface/60 p-3.5"
        >
          <p className="text-lg font-bold tracking-tight">{f.big}</p>
          <p className="mt-1 text-[11px] leading-snug text-faint">{f.caption}</p>
        </div>
      ))}
    </div>
  )
}

// --- Episode ratings curve --------------------------------------------------

function RatingCurveCard({ show, watchedSet }: { show: TitleDetail; watchedSet: Set<string> }) {
  // Shares the ['season', id, n] cache with the Seasons accordion.
  const seasons = show.seasons.slice(0, 20)
  const results = useQueries({
    queries: seasons.map((s) => ({
      queryKey: ['season', show.id, s.seasonNumber],
      queryFn: () => getSeason(show.id, s.seasonNumber),
    })),
  })

  const rated = new Map<number, Episode[]>()
  seasons.forEach((s, i) => {
    const eps = (results[i].data ?? []).filter((e) => e.voteAverage !== null)
    if (eps.length > 0) rated.set(s.seasonNumber, eps)
  })

  // Default to the latest season you've watched something in.
  const watchedSeasons = new Set(
    [...watchedSet].map((k) => Number(/^S(\d+)E/.exec(k)?.[1] ?? NaN)),
  )
  const withData = [...rated.keys()]
  const defaultSeason =
    withData.filter((n) => watchedSeasons.has(n)).at(-1) ?? withData[0] ?? null
  const [picked, setPicked] = useState<number | null>(null)
  const current = picked ?? defaultSeason

  if (current === null) return null
  const episodes = rated.get(current) ?? []
  if (episodes.length < 2) return null

  // Fans' favorite across every loaded season, not just the visible one.
  let best: Episode | null = null
  for (const eps of rated.values())
    for (const e of eps) if (!best || (e.voteAverage ?? 0) > (best.voteAverage ?? 0)) best = e

  return (
    <div className="rounded-2xl border border-line bg-surface/60 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Episode ratings</p>
        {best && (
          <p className="truncate text-[11px] text-faint">
            Fans' favorite: S{best.seasonNumber}E{best.episodeNumber} ★
            {best.voteAverage?.toFixed(1)}
          </p>
        )}
      </div>

      {withData.length > 1 && (
        <div className="no-scrollbar -mx-1 mt-2.5 flex gap-1.5 overflow-x-auto px-1">
          {withData.map((n) => (
            <button
              key={n}
              onClick={() => setPicked(n)}
              className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition active:scale-95 ${
                n === current ? 'bg-brand-gradient text-white' : 'bg-surface-2 text-muted'
              }`}
            >
              S{n}
            </button>
          ))}
        </div>
      )}

      <RatingLine key={current} episodes={episodes} watchedSet={watchedSet} />
    </div>
  )
}

function RatingLine({ episodes, watchedSet }: { episodes: Episode[]; watchedSet: Set<string> }) {
  const vals = episodes.map((e) => e.voteAverage as number)
  const maxIdx = vals.indexOf(Math.max(...vals))
  const [sel, setSel] = useState(maxIdx)

  const n = episodes.length
  const W = Math.max(300, 30 + n * 30)
  const H = 150
  const padL = 26
  const padR = 12
  const padT = 20
  const padB = 20

  // Line charts may zoom the domain (unlike bars); pad a little air around it.
  const d0 = Math.max(0, Math.min(...vals) - 0.5)
  const d1 = Math.min(10, Math.max(...vals) + 0.4)
  const x = (i: number) => (n === 1 ? W / 2 : padL + (i * (W - padL - padR)) / (n - 1))
  const y = (v: number) => padT + (H - padT - padB) * (1 - (v - d0) / (d1 - d0))

  const ticks: number[] = []
  for (let t = Math.ceil(d0); t <= Math.floor(d1); t++) ticks.push(t)
  const path = vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join(' ')
  const labelStep = Math.max(1, Math.ceil(n / 8))
  const selected = episodes[sel]
  const isWatched = (e: Episode) => watchedSet.has(`S${e.seasonNumber}E${e.episodeNumber}`)

  return (
    <div className="mt-2">
      <div className="no-scrollbar overflow-x-auto">
        <svg width={W} height={H} role="img" aria-label="Episode ratings across the season">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="currentColor" className="text-line" strokeWidth="1" opacity="0.5" />
              <text x={padL - 6} y={y(t) + 3} textAnchor="end" fontSize="9" className="fill-faint">
                {t}
              </text>
            </g>
          ))}
          <path d={path} fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinejoin="round" />
          {episodes.map((e, i) => (
            <g key={e.episodeNumber}>
              <circle
                cx={x(i)}
                cy={y(vals[i])}
                r={i === sel ? 5 : 4}
                fill={isWatched(e) ? '#fbbf24' : 'var(--color-surface)'}
                stroke={i === sel ? '#fde68a' : '#fbbf24'}
                strokeWidth="2"
              />
              {i % labelStep === 0 && (
                <text x={x(i)} y={H - 5} textAnchor="middle" fontSize="9" className="fill-faint">
                  {e.episodeNumber}
                </text>
              )}
              {/* Oversized invisible tap target per episode. */}
              <rect
                x={x(i) - (W - padL - padR) / Math.max(n - 1, 1) / 2}
                y={0}
                width={(W - padL - padR) / Math.max(n - 1, 1)}
                height={H}
                fill="transparent"
                onClick={() => setSel(i)}
              />
            </g>
          ))}
          {/* Selective direct label: the season's peak only. */}
          <text
            x={Math.min(Math.max(x(maxIdx), padL + 14), W - padR - 14)}
            y={y(vals[maxIdx]) - 9}
            textAnchor="middle"
            fontSize="10"
            fontWeight="700"
            fill="#fde68a"
          >
            ★{vals[maxIdx].toFixed(1)}
          </text>
        </svg>
      </div>
      {selected && (
        <p className="mt-1.5 truncate text-xs text-muted">
          <span className="font-semibold text-ink">E{selected.episodeNumber}</span> ·{' '}
          {selected.name} · <span className="font-semibold text-amber-300">★{selected.voteAverage?.toFixed(1)}</span>
          {isWatched(selected) && <span className="text-watched"> · seen ✓</span>}
        </p>
      )}
      <p className="mt-1 text-[10px] text-faint">Filled dots are episodes you've seen · tap a dot for details</p>
    </div>
  )
}

// --- Cast connections ("seen them before?") ---------------------------------

const CONNECTION_LABEL: Record<FollowStatus, string> = {
  watchlist: 'on your watchlist',
  watching: "you're watching it",
  completed: 'you finished it',
  dropped: 'you stopped it',
}

// Cross-reference the top-billed cast's filmographies against your library:
// "Pedro Pascal is also in The Last of Us — you're watching it." Person
// lookups share the ['person', id] cache with the actor page.
function CastConnections({ title }: { title: TitleDetail }) {
  const top = title.cast.slice(0, 6)
  const people = useQueries({
    queries: top.map((c) => ({
      queryKey: ['person', c.id],
      queryFn: () => getPerson(c.id),
    })),
  })
  const statusByKey = useFollowStatusMap()

  const connections: {
    actor: TitleDetail['cast'][number]
    credit: SearchResult
    status: FollowStatus
  }[] = []
  top.forEach((actor, i) => {
    const person = people[i].data
    if (!person) return
    // Their most popular credit that's in your library and isn't this title.
    const credit = person.credits.find(
      (cr) =>
        !(cr.id === title.id && cr.media_type === title.media_type) &&
        statusByKey.has(trackedKey(cr.media_type, cr.id)),
    )
    if (credit) connections.push({ actor, credit, status: statusByKey.get(trackedKey(credit.media_type, credit.id))! })
  })

  if (connections.length === 0) return null

  return (
    <div className="rounded-2xl border border-line bg-surface/60 p-4">
      <p className="text-sm font-semibold">Seen them before?</p>
      <div className="mt-1 divide-y divide-line">
        {connections.slice(0, 5).map(({ actor, credit, status }) => (
          <Link
            key={actor.id}
            to={`/title/${credit.media_type}/${credit.id}`}
            className="flex items-center gap-3 py-2.5 active:opacity-70"
          >
            <Poster
              path={actor.profilePath}
              alt={actor.name}
              size="w200"
              rounded="rounded-full"
              className="h-10 w-10 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">
                <span className="font-medium">{actor.name}</span>
                <span className="text-muted"> is also in </span>
                <span className="font-medium">{credit.title}</span>
              </p>
              <p className="text-[11px] text-faint">
                {CONNECTION_LABEL[status]}
                {actor.character ? ` · plays ${actor.character} here` : ''}
              </p>
            </div>
            <Poster
              path={credit.posterPath}
              alt={credit.title}
              size="w200"
              rounded="rounded-md"
              className="h-14 w-10 shrink-0"
            />
          </Link>
        ))}
      </div>
    </div>
  )
}

// --- Videos (bloopers / BTS / featurettes / trailers) -----------------------

function VideoCard({ video }: { video: Video }) {
  const [playing, setPlaying] = useState(false)
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface/60">
      <div className="relative aspect-video w-full bg-surface-2">
        {playing ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${video.key}?autoplay=1`}
            title={video.name}
            className="h-full w-full"
            allow="autoplay; encrypted-media; fullscreen"
            allowFullScreen
          />
        ) : (
          <button onClick={() => setPlaying(true)} className="block h-full w-full" aria-label={`Play ${video.name}`}>
            <img
              src={`https://i.ytimg.com/vi/${video.key}/hqdefault.jpg`}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
            <span className="absolute inset-0 grid place-items-center bg-black/25">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-black/60 pl-1 text-xl text-white shadow-lg backdrop-blur-sm">
                ▶
              </span>
            </span>
          </button>
        )}
      </div>
      <div className="flex items-center gap-2 px-3.5 py-2.5">
        {video.type && (
          <span className="shrink-0 rounded-md bg-brand/15 px-1.5 py-0.5 text-[10px] font-semibold text-brand-2">
            {video.type}
          </span>
        )}
        <p className="truncate text-xs text-muted">{video.name}</p>
      </div>
    </div>
  )
}

// --- Stills gallery ----------------------------------------------------------

function StillsStrip({ title }: { title: TitleDetail }) {
  return (
    <div className="no-scrollbar -mx-5 flex snap-x gap-2.5 overflow-x-auto px-5 pb-1">
      {title.backdrops.map((path) => (
        <img
          key={path}
          src={IMG(path, 'w500') ?? undefined}
          alt=""
          loading="lazy"
          className="h-28 shrink-0 snap-start rounded-xl object-cover ring-1 ring-line"
        />
      ))}
    </div>
  )
}

// --- Reviews -----------------------------------------------------------------

const CLAMP_AT = 350

function ReviewCard({ review, blur }: { review: Review; blur: boolean }) {
  const [revealed, setRevealed] = useState(!blur)
  const [expanded, setExpanded] = useState(false)

  // Legacy TMDB avatars can be a full gravatar URL crammed behind a slash.
  const avatar = review.avatarPath?.startsWith('/http')
    ? review.avatarPath.slice(1)
    : IMG(review.avatarPath, 'w200')
  const when = review.createdAt
    ? new Date(review.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    : null
  const long = review.content.length > CLAMP_AT

  return (
    <div className="rounded-2xl border border-line bg-surface/60 p-4">
      <div className="flex items-center gap-2.5">
        {avatar ? (
          <img src={avatar} alt="" className="h-8 w-8 rounded-full object-cover ring-1 ring-line" />
        ) : (
          <span className="grid h-8 w-8 place-items-center rounded-full bg-surface-2 text-xs font-bold text-muted ring-1 ring-line">
            {review.author.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold">{review.author}</p>
          {when && <p className="text-[10px] text-faint">{when}</p>}
        </div>
        {review.rating !== null && (
          <span className="shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 text-xs font-semibold text-amber-300">
            ★ {review.rating}
          </span>
        )}
      </div>

      <div className="relative mt-3">
        <p
          className={`whitespace-pre-line text-sm leading-relaxed text-ink/80 ${
            revealed ? (expanded ? '' : 'line-clamp-6') : 'select-none blur-sm'
          }`}
        >
          {review.content}
        </p>
        {!revealed && (
          <button
            onClick={() => setRevealed(true)}
            className="absolute inset-0 grid place-items-center rounded-xl text-xs font-semibold text-muted"
          >
            Tap to read — may contain spoilers
          </button>
        )}
      </div>

      {revealed && long && (
        <button onClick={() => setExpanded(!expanded)} className="mt-2 text-xs font-semibold text-brand-2">
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}
    </div>
  )
}

// --- Themes -------------------------------------------------------------------

function ThemeChips({ keywords }: { keywords: string[] }) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-faint">Themes</p>
      <div className="flex flex-wrap gap-2">
        {keywords.slice(0, 12).map((k) => (
          <span key={k} className="rounded-full border border-line bg-surface/60 px-3 py-1 text-xs text-muted">
            {k}
          </span>
        ))}
      </div>
    </div>
  )
}
