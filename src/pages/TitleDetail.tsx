import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getTitle, getSeason, getSimilarTitles, getCollection, IMG } from '../lib/tmdb'
import type { Episode, MediaType, TitleDetail as TitleDetailType } from '../lib/types'
import { Poster } from '../components/Poster'
import { PosterRail, trackedKey } from '../components/PosterRail'
import { RatingStars } from '../components/RatingStars'
import { useAuth } from '../lib/auth'
import { useWatchRegion } from '../lib/region'
import type { WatchProvider } from '../lib/types'
import {
  useFollow,
  useFollows,
  useWatchedMovieIds,
  useMarkMovieWatched,
  useEpisodeWatches,
  useEpisodeRatings,
  useRateEpisode,
  useToggleEpisode,
  useToggleSeason,
  useRating,
  useCharacterVotes,
  useToggleCharacterVote,
  type FollowStatus,
} from '../lib/tracking'

// The user-facing status options, in the order shown in the picker.
const STATUS_OPTIONS: { value: FollowStatus; label: string }[] = [
  { value: 'watchlist', label: 'Watchlist' },
  { value: 'watching', label: 'Watching' },
  { value: 'completed', label: 'Finished' },
  { value: 'dropped', label: 'Stopped' },
]

export function TitleDetail() {
  const { mediaType, id } = useParams<{ mediaType: MediaType; id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const tmdbId = Number(id)

  // Optional deep link to a specific episode (?s=&e=), e.g. from the Up Next
  // rail — opens that season and the episode on arrival.
  const deepSeason = Number(searchParams.get('s'))
  const deepEpisode = Number(searchParams.get('e'))
  const deepLink =
    deepSeason > 0 && deepEpisode > 0 ? { season: deepSeason, episode: deepEpisode } : null

  const { data: title, isLoading, error } = useQuery({
    queryKey: ['title', mediaType, tmdbId],
    queryFn: () => getTitle(mediaType as MediaType, tmdbId),
    enabled: Boolean(mediaType && tmdbId),
  })

  if (isLoading) return <p className="p-6 text-sm text-muted">Loading…</p>
  if (error) return <p className="p-6 text-sm text-red-400">{(error as Error).message}</p>
  if (!title) return null

  return (
    <div className="pb-4">
      {/* Full-bleed backdrop with a scrim that fades into the page. */}
      <div className="relative h-72 w-full overflow-hidden">
        {title.backdropPath ? (
          <img
            src={IMG(title.backdropPath, 'w500') ?? undefined}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-surface-2 to-surface" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/60 to-bg/10" />

        <button
          onClick={() => navigate(-1)}
          className="glass absolute left-4 top-12 grid h-9 w-9 place-items-center rounded-full border text-lg active:scale-90"
          aria-label="Back"
        >
          ‹
        </button>
      </div>

      <div className="relative z-10 -mt-24 px-5">
        <div className="flex gap-4">
          <Poster
            path={title.posterPath}
            alt={title.title}
            size="w342"
            className="aspect-[2/3] w-28 shrink-0 shadow-2xl shadow-black/60"
          />
          <div className="mt-20 min-w-0 flex-1">
            <h1 className="text-xl font-bold leading-tight tracking-tight text-balance">
              {title.title}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
              {title.year && <span>{title.year}</span>}
              {title.runtime ? <Dot text={`${title.runtime}m`} /> : null}
              {title.voteAverage ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-xs font-medium text-amber-300">
                  ★ {title.voteAverage.toFixed(1)}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {title.genres.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {title.genres.map((g) => (
              <span
                key={g}
                className="rounded-full border border-line bg-surface/60 px-3 py-1 text-xs text-muted"
              >
                {g}
              </span>
            ))}
          </div>
        )}

        <TrackingBar title={title} />

        <RatingSection title={title} />

        {title.overview && (
          <p className="mt-5 text-sm leading-relaxed text-ink/80">{title.overview}</p>
        )}

        <WhereToWatch title={title} />

        {title.media_type === 'movie' && <CollectionSection title={title} />}

        {title.media_type === 'tv' && <Seasons show={title} deepLink={deepLink} />}

        {title.cast.length > 0 && (
          <section className="mt-7">
            <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted">Cast</h2>
            <div className="no-scrollbar -mx-5 flex gap-4 overflow-x-auto px-5 pb-1">
              {title.cast.map((c) => (
                <Link
                  key={c.id}
                  to={`/person/${c.id}`}
                  className="w-16 shrink-0 text-center active:scale-[0.97]"
                >
                  <Poster
                    path={c.profilePath}
                    alt={c.name}
                    size="w200"
                    rounded="rounded-full"
                    className="mx-auto h-16 w-16"
                  />
                  <p className="mt-1.5 truncate text-[11px] font-medium">{c.name}</p>
                  <p className="truncate text-[10px] text-faint">{c.character}</p>
                </Link>
              ))}
            </div>
          </section>
        )}

        <div className="mt-7">
          <MoreLikeThis title={title} />
        </div>
      </div>
    </div>
  )
}

// Franchise progress for a movie that belongs to a TMDB collection — how many
// of the saga you've watched, and every entry (watched ones checked, the
// current one ringed).
function CollectionSection({ title }: { title: TitleDetailType }) {
  const col = title.collection
  const { data } = useQuery({
    queryKey: ['collection', col?.id],
    queryFn: () => getCollection(col!.id),
    enabled: Boolean(col),
  })
  const { data: watched } = useWatchedMovieIds()

  // A "collection" of one is just this movie — not worth a section.
  if (!col || !data || data.parts.length < 2) return null

  const seen = data.parts.filter((p) => watched?.has(p.id)).length
  const total = data.parts.length
  const pct = Math.round((seen / total) * 100)

  return (
    <section className="mt-7">
      <h2 className="text-sm font-semibold tracking-wide text-muted">{data.name}</h2>
      <p className="mt-1 text-xs text-faint">
        Seen {seen}/{total} in this franchise
      </p>
      <div className="mt-2 mb-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-brand-gradient" style={{ width: `${pct}%` }} />
      </div>
      <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 pb-1">
        {data.parts.map((p) => {
          const isSeen = watched?.has(p.id)
          const isCurrent = p.id === title.id
          return (
            <Link
              key={p.id}
              to={`/title/movie/${p.id}`}
              className="w-24 shrink-0 active:scale-[0.97]"
            >
              <div className="relative">
                <Poster
                  path={p.posterPath}
                  alt={p.title}
                  size="w342"
                  className={`aspect-[2/3] w-24 shadow-lg shadow-black/40 ${
                    isCurrent ? 'ring-2 ring-brand' : ''
                  }`}
                />
                {isSeen && (
                  <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-watched text-[11px] font-bold text-bg shadow">
                    ✓
                  </span>
                )}
              </div>
              <p className="mt-1.5 truncate text-[11px] font-medium text-ink/90">{p.title}</p>
              <p className="truncate text-[10px] text-faint">{p.year ?? ''}</p>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

// Recommendations for the current title. Titles already in the user's library
// are dimmed/badged (shares the rail behavior used on Home and Discover).
function MoreLikeThis({ title }: { title: TitleDetailType }) {
  const { data } = useQuery({
    queryKey: ['similar', title.media_type, title.id],
    queryFn: () =>
      getSimilarTitles(title.media_type, title.id, {
        originalLanguage: title.originalLanguage,
        genreIds: title.genreIds,
      }),
  })
  const { data: follows } = useFollows()
  const tracked = useMemo(
    () => new Set((follows ?? []).map((f) => trackedKey(f.media_type, f.tmdb_id))),
    [follows],
  )
  return <PosterRail title="More like this" items={data ?? []} trackedIds={tracked} />
}

function Dot({ text }: { text: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-1 w-1 rounded-full bg-faint" />
      {text}
    </span>
  )
}

const REGION_NAME = (() => {
  try {
    const dn = new Intl.DisplayNames(['en'], { type: 'region' })
    return (code: string) => dn.of(code) ?? code
  } catch {
    return (code: string) => code
  }
})()

// "Where to watch" — TMDB/JustWatch streaming availability for the selected
// region. Region defaults to the browser locale and is switchable + persisted,
// since availability is region-specific.
function WhereToWatch({ title }: { title: TitleDetailType }) {
  const [region, setRegion] = useWatchRegion()

  // Regions TMDB actually has data for, plus the current one so it's selectable
  // even when this title isn't available there.
  const regions = Object.keys(title.watchProviders)
  if (regions.length === 0) return null // no provider data for this title at all

  const options = [...new Set([region, ...regions])].sort((a, b) =>
    REGION_NAME(a).localeCompare(REGION_NAME(b)),
  )
  const data = title.watchProviders[region]

  // Ways to watch without paying per-title, deduped by provider id.
  const streamMap = new Map<number, WatchProvider>()
  for (const p of [...(data?.flatrate ?? []), ...(data?.free ?? []), ...(data?.ads ?? [])]) {
    if (!streamMap.has(p.id)) streamMap.set(p.id, p)
  }
  const stream = [...streamMap.values()]

  const rentBuyMap = new Map<number, WatchProvider>()
  for (const p of [...(data?.rent ?? []), ...(data?.buy ?? [])]) {
    if (!rentBuyMap.has(p.id)) rentBuyMap.set(p.id, p)
  }
  const rentBuy = [...rentBuyMap.values()]

  return (
    <section className="mt-7">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-muted">Where to watch</h2>
        <select
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-muted outline-none focus:border-brand/60"
          aria-label="Region"
        >
          {options.map((code) => (
            <option key={code} value={code}>
              {REGION_NAME(code)}
            </option>
          ))}
        </select>
      </div>

      {stream.length === 0 && rentBuy.length === 0 ? (
        <p className="rounded-2xl border border-line bg-surface/60 p-4 text-sm text-muted">
          Not available to stream in {REGION_NAME(region)}.
        </p>
      ) : (
        <div className="space-y-4">
          {stream.length > 0 && (
            <ProviderRow label="Stream" providers={stream} link={data?.link ?? null} />
          )}
          {rentBuy.length > 0 && (
            <ProviderRow label="Rent or buy" providers={rentBuy} link={data?.link ?? null} />
          )}
        </div>
      )}

      <p className="mt-3 text-[11px] text-faint">Availability data powered by JustWatch</p>
    </section>
  )
}

function ProviderRow({
  label,
  providers,
  link,
}: {
  label: string
  providers: WatchProvider[]
  link: string | null
}) {
  return (
    <div>
      <div className="mb-2 text-xs font-medium text-faint">{label}</div>
      <div className="flex flex-wrap gap-2.5">
        {providers.map((p) => {
          const logo = IMG(p.logoPath, 'w200')
          const inner = logo ? (
            <img src={logo} alt={p.name} title={p.name} className="h-11 w-11 rounded-xl ring-1 ring-line" />
          ) : (
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-surface-2 px-1 text-center text-[9px] font-medium ring-1 ring-line">
              {p.name}
            </span>
          )
          return link ? (
            <a key={p.id} href={link} target="_blank" rel="noopener noreferrer" className="active:scale-95">
              {inner}
            </a>
          ) : (
            <div key={p.id}>{inner}</div>
          )
        })}
      </div>
    </div>
  )
}

function TrackingBar({ title }: { title: TitleDetailType }) {
  const { session } = useAuth()
  const { status, setStatus, enabled } = useFollow(title)
  const markMovie = useMarkMovieWatched(title)
  const [justLogged, setJustLogged] = useState(false)

  if (!enabled || !session) {
    return (
      <p className="mt-5 rounded-2xl border border-line bg-surface/60 p-3.5 text-center text-xs text-muted">
        Sign in on the Profile tab to track this.
      </p>
    )
  }

  if (!status) {
    return (
      <div className="mt-5 flex gap-2.5">
        <button
          onClick={() => setStatus.mutate('watchlist')}
          className="flex-1 rounded-2xl border border-line bg-surface py-3 text-sm font-semibold text-ink transition active:scale-[0.98]"
        >
          + Track
        </button>
        {title.media_type === 'movie' && <MovieLogButton onLog={logMovie} justLogged={justLogged} />}
      </div>
    )
  }

  return (
    <div className="mt-5">
      <div className="flex gap-2.5">
        <div className="flex flex-1 flex-wrap gap-1.5 rounded-2xl border border-line bg-surface/60 p-1.5">
          {STATUS_OPTIONS.map((o) => {
            const isActive = status === o.value
            return (
              <button
                key={o.value}
                onClick={() => setStatus.mutate(o.value)}
                className={`flex-1 rounded-xl px-2 py-2 text-xs font-semibold transition active:scale-[0.97] ${
                  isActive ? 'bg-brand-gradient text-white shadow-md shadow-brand/25' : 'text-muted'
                }`}
              >
                {o.label}
              </button>
            )
          })}
        </div>
        {title.media_type === 'movie' && <MovieLogButton onLog={logMovie} justLogged={justLogged} />}
      </div>

      <button
        onClick={() => setStatus.mutate(null)}
        className="mt-2.5 text-xs text-faint active:text-muted"
      >
        Remove from library
      </button>
    </div>
  )

  function logMovie() {
    markMovie.mutate(undefined, {
      onSuccess: () => {
        setJustLogged(true)
        setTimeout(() => setJustLogged(false), 1500)
      },
    })
  }
}

function MovieLogButton({ onLog, justLogged }: { onLog: () => void; justLogged: boolean }) {
  return (
    <button
      onClick={onLog}
      className={`shrink-0 self-start rounded-2xl px-4 py-3 text-sm font-semibold transition active:scale-95 ${
        justLogged ? 'bg-watched text-bg' : 'border border-line bg-surface'
      }`}
      title="Log a watch"
      aria-label="Log a watch"
    >
      {justLogged ? '✓ Logged' : '👁'}
    </button>
  )
}

function RatingSection({ title }: { title: TitleDetailType }) {
  const { rating, save, enabled } = useRating(title)
  const epRatings = useEpisodeRatings(title.id)
  const [review, setReview] = useState('')
  const [editingReview, setEditingReview] = useState(false)

  if (!enabled) return null

  const startReview = () => {
    setReview(rating?.review ?? '')
    setEditingReview(true)
  }

  // For TV, offer to derive the overall score from your episode ratings.
  const epScores = title.media_type === 'tv' ? [...(epRatings.data?.values() ?? [])] : []
  const epAvg = epScores.length
    ? epScores.reduce((a, b) => a + b, 0) / epScores.length
    : null

  return (
    <div className="mt-4 rounded-2xl border border-line bg-surface/60 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted">Your rating</span>
        <RatingStars
          score={rating?.score ?? null}
          onChange={(score) => save.mutate({ score, review: rating?.review })}
        />
      </div>

      {epAvg !== null && (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-bg/40 px-3 py-2">
          <span className="text-xs text-muted">
            Avg of {epScores.length} episode {epScores.length === 1 ? 'rating' : 'ratings'}:{' '}
            <span className="font-semibold text-ink">{epAvg.toFixed(1)}</span>
          </span>
          {Math.round(epAvg) !== (rating?.score ?? -1) && (
            <button
              onClick={() => save.mutate({ score: Math.round(epAvg), review: rating?.review })}
              className="shrink-0 rounded-lg bg-brand-gradient px-2.5 py-1 text-xs font-semibold text-white active:scale-95"
            >
              Use as show rating
            </button>
          )}
        </div>
      )}

      {editingReview ? (
        <div className="mt-3">
          <textarea
            value={review}
            onChange={(e) => setReview(e.target.value)}
            rows={3}
            placeholder="Write a note or review…"
            className="w-full rounded-xl border border-line bg-bg/60 px-3 py-2 text-sm outline-none focus:border-brand/60"
          />
          <div className="mt-2 flex gap-2">
            <button
              onClick={() =>
                save.mutate(
                  { score: rating?.score ?? null, review },
                  { onSuccess: () => setEditingReview(false) },
                )
              }
              className="rounded-lg bg-brand-gradient px-3 py-1.5 text-xs font-semibold"
            >
              Save
            </button>
            <button
              onClick={() => setEditingReview(false)}
              className="rounded-lg border border-line px-3 py-1.5 text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : rating?.review ? (
        <button onClick={startReview} className="mt-3 block w-full text-left text-sm text-ink/80">
          <span className="text-faint">“</span>
          {rating.review}
          <span className="text-faint">”</span>
        </button>
      ) : (
        <button onClick={startReview} className="mt-3 text-xs text-brand">
          + Add a review
        </button>
      )}

      <FavoriteCharacters cast={title.cast} tmdbId={title.id} mediaType={title.media_type} />
    </div>
  )
}

// A compact cast rail where you tap a character to favorite it. Scoped to the
// whole title, or to a single episode when `episode` is passed. Sign-in is
// assumed by callers (both the review card and the episode modal gate on it).
function FavoriteCharacters({
  cast,
  tmdbId,
  mediaType,
  episode,
}: {
  cast: TitleDetailType['cast']
  tmdbId: number
  mediaType: MediaType
  episode?: { season: number; episode: number }
}) {
  const votes = useCharacterVotes(tmdbId, mediaType, episode)
  const toggle = useToggleCharacterVote({ id: tmdbId, media_type: mediaType }, episode)
  const voted = votes.data ?? new Set<number>()

  if (cast.length === 0) return null

  return (
    <div className="mt-4 border-t border-line pt-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-muted">Favorite characters</span>
        {voted.size > 0 && <span className="text-[11px] text-faint">{voted.size} picked</span>}
      </div>
      <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
        {cast.map((c) => {
          const isVoted = voted.has(c.id)
          const label = c.character || c.name
          return (
            <button
              key={c.id}
              onClick={() =>
                toggle.mutate({
                  character: {
                    personId: c.id,
                    characterName: c.character || null,
                    actorName: c.name || null,
                    profilePath: c.profilePath,
                  },
                  voted: isVoted,
                })
              }
              disabled={toggle.isPending}
              aria-pressed={isVoted}
              aria-label={`${isVoted ? 'Unfavorite' : 'Favorite'} ${label}`}
              className="w-16 shrink-0 text-center active:scale-[0.97] disabled:opacity-60"
            >
              <div className="relative mx-auto h-16 w-16">
                <Poster
                  path={c.profilePath}
                  alt={c.name}
                  size="w200"
                  rounded="rounded-full"
                  className={`h-16 w-16 ${isVoted ? 'ring-2 ring-brand' : ''}`}
                />
                <span
                  className={`absolute -bottom-0.5 -right-0.5 grid h-6 w-6 place-items-center rounded-full text-xs shadow ${
                    isVoted
                      ? 'bg-brand-gradient text-white'
                      : 'bg-surface-2 text-muted ring-1 ring-line'
                  }`}
                >
                  {isVoted ? '♥' : '♡'}
                </span>
              </div>
              <p className="mt-1.5 truncate text-[11px] font-medium">{label}</p>
              {c.character && <p className="truncate text-[10px] text-faint">{c.name}</p>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Seasons({
  show,
  deepLink,
}: {
  show: TitleDetailType
  deepLink: { season: number; episode: number } | null
}) {
  const [open, setOpen] = useState<number | null>(deepLink?.season ?? null)
  const watches = useEpisodeWatches(show.id)
  const watchedSet = watches.data ?? new Set<string>()
  const ratings = useEpisodeRatings(show.id)
  const ratingMap = ratings.data ?? new Map<string, number>()

  return (
    <section className="mt-7">
      <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted">Seasons</h2>
      <div className="space-y-2.5">
        {show.seasons.map((s) => {
          const watchedInSeason = [...watchedSet].filter((k) =>
            k.startsWith(`S${s.seasonNumber}E`),
          ).length
          const complete = s.episodeCount > 0 && watchedInSeason >= s.episodeCount
          const started = watchedInSeason > 0
          return (
            <div
              key={s.seasonNumber}
              className="overflow-hidden rounded-2xl border border-line bg-surface/60"
            >
              <button
                onClick={() => setOpen(open === s.seasonNumber ? null : s.seasonNumber)}
                className="flex w-full items-center gap-3 p-3 text-left transition-colors active:bg-surface-2"
              >
                <Poster path={s.posterPath} alt={s.name} size="w200" className="h-16 w-11" rounded="rounded-lg" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-faint">
                    {s.episodeCount} episodes{s.airDate ? ` · ${s.airDate.slice(0, 4)}` : ''}
                  </div>
                  <SeasonStatus complete={complete} started={started} watched={watchedInSeason} total={s.episodeCount} />
                </div>
                <span
                  className={`text-faint transition-transform ${open === s.seasonNumber ? 'rotate-90' : ''}`}
                >
                  ›
                </span>
              </button>
              {open === s.seasonNumber && (
                <SeasonEpisodes
                  show={show}
                  seasonNumber={s.seasonNumber}
                  watchedSet={watchedSet}
                  ratingMap={ratingMap}
                  autoOpenEpisode={deepLink?.season === s.seasonNumber ? deepLink.episode : undefined}
                />
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function SeasonStatus({
  complete,
  started,
  watched,
  total,
}: {
  complete: boolean
  started: boolean
  watched: number
  total: number
}) {
  if (complete) {
    return (
      <span className="mt-1 inline-flex items-center gap-1 rounded-md bg-watched/15 px-1.5 py-0.5 text-[11px] font-medium text-watched">
        ✓ Watched
      </span>
    )
  }
  if (started) {
    return (
      <span className="mt-1 inline-flex items-center gap-1 rounded-md bg-brand/15 px-1.5 py-0.5 text-[11px] font-medium text-brand-2">
        In progress · {watched}/{total}
      </span>
    )
  }
  return <span className="mt-1 inline-block text-[11px] text-faint">Not started</span>
}

function SeasonEpisodes({
  show,
  seasonNumber,
  watchedSet,
  ratingMap,
  autoOpenEpisode,
}: {
  show: TitleDetailType
  seasonNumber: number
  watchedSet: Set<string>
  ratingMap: Map<string, number>
  autoOpenEpisode?: number
}) {
  const { session } = useAuth()
  const { data: episodes, isLoading } = useQuery({
    queryKey: ['season', show.id, seasonNumber],
    queryFn: () => getSeason(show.id, seasonNumber),
  })
  const toggle = useToggleEpisode(show)
  const toggleSeason = useToggleSeason(show)
  const [openEp, setOpenEp] = useState<Episode | null>(null)

  // When deep-linked to an episode, open it once the season's episodes load.
  // A ref guards against re-opening after the user closes the modal.
  const autoOpened = useRef(false)
  useEffect(() => {
    if (autoOpened.current || autoOpenEpisode === undefined || !episodes) return
    const target = episodes.find((e) => e.episodeNumber === autoOpenEpisode)
    if (target) {
      autoOpened.current = true
      setOpenEp(target)
    }
  }, [episodes, autoOpenEpisode])

  if (isLoading) return <p className="p-3 text-xs text-muted">Loading episodes…</p>
  if (!episodes || episodes.length === 0)
    return <p className="p-3 text-xs text-muted">No episodes listed.</p>

  const epNumbers = episodes.map((e) => e.episodeNumber)
  const allWatched = episodes.every((e) => watchedSet.has(`S${e.seasonNumber}E${e.episodeNumber}`))

  return (
    <div className="border-t border-line">
      {session && (
        <div className="flex justify-end p-2.5">
          <button
            onClick={() =>
              toggleSeason.mutate({ season: seasonNumber, episodes: epNumbers, watched: allWatched })
            }
            disabled={toggleSeason.isPending}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition active:scale-[0.97] disabled:opacity-60 ${
              allWatched ? 'border border-line bg-surface text-muted' : 'bg-brand-gradient text-white'
            }`}
          >
            {toggleSeason.isPending ? '…' : allWatched ? 'Mark season unwatched' : '✓ Mark season watched'}
          </button>
        </div>
      )}
      <ul className="divide-y divide-line border-t border-line">
        {episodes.map((e) => {
          const key = `S${e.seasonNumber}E${e.episodeNumber}`
          const watched = watchedSet.has(key)
          const score = ratingMap.get(key)
          return (
            <li key={key} className="flex items-center gap-3 p-3">
              {/* Tap the text to open episode details + rating. */}
              <button
                onClick={() => setOpenEp(e)}
                className="min-w-0 flex-1 text-left active:opacity-70"
              >
                <div className="truncate text-sm">
                  <span className="text-faint">{e.episodeNumber}.</span> {e.name}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-faint">
                  {e.airDate && <span>{e.airDate}</span>}
                  {score !== undefined && (
                    <span className="font-semibold text-amber-400">★ {score}</span>
                  )}
                </div>
              </button>
              <button
                disabled={!session}
                onClick={() => toggle.mutate({ season: e.seasonNumber, episode: e.episodeNumber, watched })}
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-semibold transition active:scale-90 disabled:opacity-40 ${
                  watched ? 'bg-watched text-bg' : 'border border-line bg-surface text-muted'
                }`}
                aria-label={watched ? 'Watched' : 'Mark watched'}
              >
                ✓
              </button>
            </li>
          )
        })}
      </ul>

      {openEp && (
        <EpisodeModal
          show={show}
          episode={openEp}
          watched={watchedSet.has(`S${openEp.seasonNumber}E${openEp.episodeNumber}`)}
          score={ratingMap.get(`S${openEp.seasonNumber}E${openEp.episodeNumber}`) ?? null}
          onClose={() => setOpenEp(null)}
        />
      )}
    </div>
  )
}

// Full-screen episode details with a per-episode rating. Rating an episode
// also marks it watched (see useRateEpisode).
function EpisodeModal({
  show,
  episode,
  watched,
  score,
  onClose,
}: {
  show: TitleDetailType
  episode: Episode
  watched: boolean
  score: number | null
  onClose: () => void
}) {
  const { session } = useAuth()
  const rate = useRateEpisode(show)
  const toggle = useToggleEpisode(show)
  const still = IMG(episode.stillPath, 'w500')

  // Close on Escape; lock background scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg">
      <div className="relative shrink-0">
        {still ? (
          <img src={still} alt="" className="h-52 w-full object-cover" />
        ) : (
          <div className="h-52 w-full bg-gradient-to-br from-surface-2 to-surface" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/40 to-transparent" />
        <button
          onClick={onClose}
          className="glass absolute right-4 top-12 grid h-9 w-9 place-items-center rounded-full border text-lg active:scale-90"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div className="relative -mt-8 flex-1 overflow-y-auto px-5 pb-8">
        <p className="text-xs font-semibold text-brand">
          S{episode.seasonNumber} · E{episode.episodeNumber}
        </p>
        <h2 className="mt-1 text-xl font-bold tracking-tight text-balance">{episode.name}</h2>
        {episode.airDate && <p className="mt-1 text-xs text-faint">{episode.airDate}</p>}
        {episode.overview && (
          <p className="mt-4 text-sm leading-relaxed text-ink/80">{episode.overview}</p>
        )}

        {session && (
          <div className="mt-6 rounded-2xl border border-line bg-surface/60 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted">Your rating</span>
              <RatingStars
                score={score}
                onChange={(s) =>
                  rate.mutate({ season: episode.seasonNumber, episode: episode.episodeNumber, score: s })
                }
              />
            </div>
            <button
              onClick={() =>
                toggle.mutate({
                  season: episode.seasonNumber,
                  episode: episode.episodeNumber,
                  watched,
                })
              }
              className={`mt-3 w-full rounded-xl py-2.5 text-sm font-semibold transition active:scale-[0.98] ${
                watched ? 'border border-line bg-surface text-muted' : 'bg-brand-gradient text-white'
              }`}
            >
              {watched ? '✓ Watched — tap to unmark' : 'Mark watched'}
            </button>

            <FavoriteCharacters
              cast={show.cast}
              tmdbId={show.id}
              mediaType={show.media_type}
              episode={{ season: episode.seasonNumber, episode: episode.episodeNumber }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
