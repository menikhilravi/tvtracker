import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getTitle, getSeason, IMG } from '../lib/tmdb'
import type { MediaType, TitleDetail as TitleDetailType } from '../lib/types'
import { Poster } from '../components/Poster'
import { RatingStars } from '../components/RatingStars'
import { useAuth } from '../lib/auth'
import {
  useFollow,
  useMarkMovieWatched,
  useEpisodeWatches,
  useToggleEpisode,
  useRating,
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
  const tmdbId = Number(id)

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

      <div className="-mt-24 px-5">
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

        {title.media_type === 'tv' && <Seasons show={title} />}

        {title.cast.length > 0 && (
          <section className="mt-7">
            <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted">Cast</h2>
            <div className="no-scrollbar -mx-5 flex gap-4 overflow-x-auto px-5 pb-1">
              {title.cast.map((c) => (
                <div key={c.name} className="w-16 shrink-0 text-center">
                  <Poster
                    path={c.profilePath}
                    alt={c.name}
                    size="w200"
                    rounded="rounded-full"
                    className="mx-auto h-16 w-16"
                  />
                  <p className="mt-1.5 truncate text-[11px] font-medium">{c.name}</p>
                  <p className="truncate text-[10px] text-faint">{c.character}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function Dot({ text }: { text: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-1 w-1 rounded-full bg-faint" />
      {text}
    </span>
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
  const [review, setReview] = useState('')
  const [editingReview, setEditingReview] = useState(false)

  if (!enabled) return null

  const startReview = () => {
    setReview(rating?.review ?? '')
    setEditingReview(true)
  }

  return (
    <div className="mt-4 rounded-2xl border border-line bg-surface/60 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted">Your rating</span>
        <RatingStars
          score={rating?.score ?? null}
          onChange={(score) => save.mutate({ score, review: rating?.review })}
        />
      </div>

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
    </div>
  )
}

function Seasons({ show }: { show: TitleDetailType }) {
  const [open, setOpen] = useState<number | null>(null)
  return (
    <section className="mt-7">
      <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted">Seasons</h2>
      <div className="space-y-2.5">
        {show.seasons.map((s) => (
          <div
            key={s.seasonNumber}
            className="overflow-hidden rounded-2xl border border-line bg-surface/60"
          >
            <button
              onClick={() => setOpen(open === s.seasonNumber ? null : s.seasonNumber)}
              className="flex w-full items-center gap-3 p-3 text-left transition-colors active:bg-surface-2"
            >
              <Poster path={s.posterPath} alt={s.name} size="w200" className="h-16 w-11" rounded="rounded-lg" />
              <div className="flex-1">
                <div className="font-medium">{s.name}</div>
                <div className="text-xs text-faint">
                  {s.episodeCount} episodes{s.airDate ? ` · ${s.airDate.slice(0, 4)}` : ''}
                </div>
              </div>
              <span
                className={`text-faint transition-transform ${open === s.seasonNumber ? 'rotate-90' : ''}`}
              >
                ›
              </span>
            </button>
            {open === s.seasonNumber && <SeasonEpisodes show={show} seasonNumber={s.seasonNumber} />}
          </div>
        ))}
      </div>
    </section>
  )
}

function SeasonEpisodes({ show, seasonNumber }: { show: TitleDetailType; seasonNumber: number }) {
  const { session } = useAuth()
  const { data: episodes, isLoading } = useQuery({
    queryKey: ['season', show.id, seasonNumber],
    queryFn: () => getSeason(show.id, seasonNumber),
  })
  const watches = useEpisodeWatches(show.id)
  const toggle = useToggleEpisode(show)
  const watchedSet = watches.data ?? new Set<string>()

  if (isLoading) return <p className="p-3 text-xs text-muted">Loading episodes…</p>

  return (
    <ul className="divide-y divide-line border-t border-line">
      {episodes?.map((e) => {
        const key = `S${e.seasonNumber}E${e.episodeNumber}`
        const watched = watchedSet.has(key)
        return (
          <li key={key} className="flex items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">
                <span className="text-faint">{e.episodeNumber}.</span> {e.name}
              </div>
              {e.airDate && <div className="text-[11px] text-faint">{e.airDate}</div>}
            </div>
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
  )
}
