import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getTitle, getSeason, IMG } from '../lib/tmdb'
import type { MediaType, TitleDetail as TitleDetailType } from '../lib/types'
import { Poster } from '../components/Poster'
import { useAuth } from '../lib/auth'
import {
  useFollow,
  useMarkMovieWatched,
  useEpisodeWatches,
  useToggleEpisode,
  type FollowStatus,
} from '../lib/tracking'

const FOLLOW_LABELS: Record<FollowStatus, string> = {
  watchlist: 'Watchlist',
  watching: 'Watching',
  completed: 'Completed',
  dropped: 'Dropped',
}

export function TitleDetail() {
  const { mediaType, id } = useParams<{ mediaType: MediaType; id: string }>()
  const navigate = useNavigate()
  const tmdbId = Number(id)

  const { data: title, isLoading, error } = useQuery({
    queryKey: ['title', mediaType, tmdbId],
    queryFn: () => getTitle(mediaType as MediaType, tmdbId),
    enabled: Boolean(mediaType && tmdbId),
  })

  if (isLoading) return <p className="p-4 text-slate-400">Loading…</p>
  if (error) return <p className="p-4 text-red-400">{(error as Error).message}</p>
  if (!title) return null

  return (
    <div>
      {/* Backdrop header */}
      <div className="relative h-44 w-full bg-slate-800">
        {title.backdropPath && (
          <img
            src={IMG(title.backdropPath, 'w500') ?? undefined}
            alt=""
            className="h-full w-full object-cover opacity-40"
          />
        )}
        <button
          onClick={() => navigate(-1)}
          className="absolute left-3 top-3 rounded-full bg-black/50 px-3 py-1 text-sm"
        >
          ← Back
        </button>
      </div>

      <div className="-mt-16 px-4">
        <div className="flex gap-3">
          <Poster path={title.posterPath} alt={title.title} className="h-40 w-28 shrink-0 rounded-xl shadow-lg" />
          <div className="mt-16 min-w-0">
            <h1 className="text-lg font-bold leading-tight">{title.title}</h1>
            <p className="text-sm text-slate-400">
              {title.year ?? '—'}
              {title.runtime ? ` · ${title.runtime}m` : ''}
              {title.voteAverage ? ` · ★ ${title.voteAverage.toFixed(1)}` : ''}
            </p>
            <p className="mt-1 text-xs text-slate-400">{title.genres.join(' · ')}</p>
          </div>
        </div>

        <TrackingBar title={title} />

        {title.overview && <p className="mt-4 text-sm leading-relaxed text-slate-300">{title.overview}</p>}

        {title.media_type === 'tv' && <Seasons show={title} />}

        {title.cast.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 font-semibold">Cast</h2>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {title.cast.map((c) => (
                <div key={c.name} className="w-16 shrink-0 text-center">
                  <Poster path={c.profilePath} alt={c.name} size="w200" className="h-20 w-16 rounded-lg" />
                  <p className="mt-1 truncate text-[11px] font-medium">{c.name}</p>
                  <p className="truncate text-[10px] text-slate-500">{c.character}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function TrackingBar({ title }: { title: TitleDetailType }) {
  const { session } = useAuth()
  const { status, setStatus, enabled } = useFollow(title.id, title.media_type)
  const markMovie = useMarkMovieWatched(title)
  const [justLogged, setJustLogged] = useState(false)

  if (!enabled || !session) {
    return (
      <p className="mt-4 rounded-xl bg-slate-800 p-3 text-center text-xs text-slate-400">
        Sign in on the Profile tab to track this.
      </p>
    )
  }

  const cycle: FollowStatus[] = ['watchlist', 'watching', 'completed']
  const nextStatus = () => {
    const idx = status ? cycle.indexOf(status) : -1
    return cycle[(idx + 1) % cycle.length]
  }

  return (
    <div className="mt-4 flex gap-2">
      <button
        onClick={() => setStatus.mutate(status ? null : 'watchlist')}
        className={`flex-1 rounded-xl py-2.5 text-sm font-semibold ${
          status ? 'bg-indigo-600' : 'bg-slate-700'
        }`}
      >
        {status ? FOLLOW_LABELS[status] : '+ Track'}
      </button>

      {status && (
        <button
          onClick={() => setStatus.mutate(nextStatus())}
          className="rounded-xl bg-slate-700 px-3 py-2.5 text-sm"
          title="Change status"
        >
          ⟳
        </button>
      )}

      {title.media_type === 'movie' && (
        <button
          onClick={() => markMovie.mutate(undefined, { onSuccess: () => {
            setJustLogged(true)
            setTimeout(() => setJustLogged(false), 1500)
          } })}
          className="rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-semibold"
        >
          {justLogged ? '✓ Logged' : '👁 Watched'}
        </button>
      )}
    </div>
  )
}

function Seasons({ show }: { show: TitleDetailType }) {
  const [open, setOpen] = useState<number | null>(null)
  return (
    <section className="mt-6">
      <h2 className="mb-2 font-semibold">Seasons</h2>
      <div className="space-y-2">
        {show.seasons.map((s) => (
          <div key={s.seasonNumber} className="overflow-hidden rounded-xl bg-slate-800">
            <button
              onClick={() => setOpen(open === s.seasonNumber ? null : s.seasonNumber)}
              className="flex w-full items-center gap-3 p-3 text-left active:bg-slate-700"
            >
              <Poster path={s.posterPath} alt={s.name} size="w200" className="h-16 w-11 rounded-md" />
              <div className="flex-1">
                <div className="font-medium">{s.name}</div>
                <div className="text-xs text-slate-400">
                  {s.episodeCount} episodes{s.airDate ? ` · ${s.airDate.slice(0, 4)}` : ''}
                </div>
              </div>
              <span className="text-slate-500">{open === s.seasonNumber ? '▾' : '▸'}</span>
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

  if (isLoading) return <p className="p-3 text-xs text-slate-400">Loading episodes…</p>

  return (
    <ul className="divide-y divide-slate-700 border-t border-slate-700">
      {episodes?.map((e) => {
        const key = `S${e.seasonNumber}E${e.episodeNumber}`
        const watched = watchedSet.has(key)
        return (
          <li key={key} className="flex items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">
                <span className="text-slate-500">{e.episodeNumber}.</span> {e.name}
              </div>
              {e.airDate && <div className="text-[11px] text-slate-500">{e.airDate}</div>}
            </div>
            <button
              disabled={!session}
              onClick={() => toggle.mutate({ season: e.seasonNumber, episode: e.episodeNumber, watched })}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold disabled:opacity-40 ${
                watched ? 'bg-emerald-600' : 'bg-slate-700'
              }`}
            >
              {watched ? '✓' : 'Watch'}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
