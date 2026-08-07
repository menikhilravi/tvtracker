import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getPerson } from '../lib/tmdb'
import { Poster } from '../components/Poster'
import { PosterStatusBadge, isSettled } from '../components/StatusBadge'
import { trackedKey, useFollowStatusMap } from '../lib/tracking'

// A person page: an actor's photo + name, then their combined movie/TV
// filmography as a poster grid. Reached by tapping a cast member on a title.
export function Person() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const personId = Number(id)

  const { data: person, isLoading, error } = useQuery({
    queryKey: ['person', personId],
    queryFn: () => getPerson(personId),
    enabled: Boolean(personId),
  })

  // Badge titles already in the user's library, matching the discovery rails.
  const statusByKey = useFollowStatusMap()

  if (isLoading) return <p className="p-6 text-sm text-muted">Loading…</p>
  if (error) return <p className="p-6 text-sm text-red-400">{(error as Error).message}</p>
  if (!person) return null

  return (
    <div className="min-h-dvh pb-4">
      <div className="glass sticky top-0 z-10 flex items-center gap-3 border-b px-5 pb-3 pt-12">
        <button
          onClick={() => navigate(-1)}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line text-lg active:scale-90"
          aria-label="Back"
        >
          ‹
        </button>
        <Poster
          path={person.profilePath}
          alt={person.name}
          size="w200"
          rounded="rounded-full"
          className="h-11 w-11 shrink-0"
        />
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold tracking-tight">{person.name}</h1>
          <p className="text-xs text-faint">
            {person.knownFor ?? 'Filmography'} · {person.credits.length} titles
          </p>
        </div>
      </div>

      <div className="px-5 py-4">
        {person.credits.length === 0 ? (
          <p className="mt-8 text-center text-sm text-muted">No titles found.</p>
        ) : (
          <div className="grid grid-cols-3 gap-x-3 gap-y-4 sm:grid-cols-4">
            {person.credits.map((r) => {
              const status = statusByKey.get(trackedKey(r.media_type, r.id))
              return (
                <Link
                  key={`${r.media_type}-${r.id}`}
                  to={`/title/${r.media_type}/${r.id}`}
                  className="active:scale-[0.97]"
                >
                  <div className="relative">
                    <Poster
                      path={r.posterPath}
                      alt={r.title}
                      size="w342"
                      className={`aspect-[2/3] w-full shadow-lg shadow-black/40 ${
                        isSettled(status) ? 'opacity-55' : ''
                      }`}
                    />
                    <PosterStatusBadge status={status} mediaType={r.media_type} />
                  </div>
                  <p className="mt-1.5 truncate text-xs font-medium text-ink/90">{r.title}</p>
                  <p className="truncate text-[10px] text-faint">{r.year ?? '—'}</p>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
