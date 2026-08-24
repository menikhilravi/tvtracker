import { useNavigate, Link } from 'react-router-dom'
import { useQueries } from '@tanstack/react-query'
import { useAuth } from '../lib/auth'
import { useFollows } from '../lib/tracking'
import { getTitle, streamingIn, IMG } from '../lib/tmdb'
import { useWatchRegion, REGION_NAME } from '../lib/region'
import { usePersistedState } from '../lib/uiState'
import { Poster } from '../components/Poster'
import type { TitleDetail as TitleDetailType, WatchProvider } from '../lib/types'

// TMDB has no batch availability endpoint, and availability is per-region and
// changes often enough that caching it in `titles` would go stale — so this is
// one request per title, deliberately bounded:
//
//  * only the watchlist (things you haven't started). Shows you're part-way
//    through are what "Up next" on Home is for, so including them here would
//    duplicate that and multiply the fetches.
//  * capped at MAX_CHECKED, most recently added first, and the page says so
//    when it has to skip some.
//
// Requests share the ['title', type, id] cache with the detail page and the
// search-result badges, so anything you've looked at recently is already warm.
const MAX_CHECKED = 200

// Rent/buy is deliberately excluded: the question this screen answers is "what
// can I put on right now at no extra cost". See streamingIn for the rule.
const streamingProviders = (detail: TitleDetailType, region: string) =>
  streamingIn(detail.watchProviders[region])

export function Tonight() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [region, setRegion] = useWatchRegion()
  const [provider, setProvider] = usePersistedState<number | null>('tonight:provider', null)
  const { data: follows, isLoading } = useFollows()

  const watchlist = (follows ?? [])
    .filter((f) => f.status === 'watchlist')
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  const checked = watchlist.slice(0, MAX_CHECKED)
  const skipped = watchlist.length - checked.length

  const details = useQueries({
    queries: checked.map((f) => ({
      queryKey: ['title', f.media_type, f.tmdb_id],
      queryFn: () => getTitle(f.media_type, f.tmdb_id),
      staleTime: 60 * 60 * 1000,
      // Back off and retry so transient proxy rate-limits recover instead of
      // silently dropping titles out of the results.
      retry: 3,
      retryDelay: (n: number) => Math.min(1000 * 2 ** n, 8000),
    })),
  })

  const resolved = details
    .map((d) => d.data)
    .filter((d): d is TitleDetailType => Boolean(d))
  const stillLoading = details.filter((d) => d.isLoading).length
  const failed = details.filter((d) => d.isError).length

  // Index the resolved titles by streaming provider for the current region.
  const providerCounts = new Map<number, { provider: WatchProvider; titles: TitleDetailType[] }>()
  const regionsWithData = new Set<string>()
  const streamable: TitleDetailType[] = []
  for (const d of resolved) {
    for (const code of Object.keys(d.watchProviders)) regionsWithData.add(code)
    const providers = streamingProviders(d, region)
    if (providers.length === 0) continue
    streamable.push(d)
    for (const p of providers) {
      const entry = providerCounts.get(p.id)
      if (entry) entry.titles.push(d)
      else providerCounts.set(p.id, { provider: p, titles: [d] })
    }
  }

  const chips = [...providerCounts.values()].sort(
    (a, b) => b.titles.length - a.titles.length || a.provider.name.localeCompare(b.provider.name),
  )
  // A provider you've deselected from, or that dropped out after a region
  // change, falls back to "everything streamable".
  const activeProvider = providerCounts.has(provider ?? -1) ? provider : null
  const shown = (activeProvider ? providerCounts.get(activeProvider)!.titles : streamable)
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title))

  const regionOptions = [...new Set([region, ...regionsWithData])].sort((a, b) =>
    REGION_NAME(a).localeCompare(REGION_NAME(b)),
  )

  return (
    <div className="px-5 pt-14 pb-6">
      <button onClick={() => navigate(-1)} className="mb-3 text-sm text-muted active:text-ink">
        ‹ Back
      </button>

      <div className="mb-1 flex items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Tonight</h1>
        <select
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          aria-label="Region"
          className="shrink-0 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-muted outline-none focus:border-brand/60"
        >
          {regionOptions.map((code) => (
            <option key={code} value={code}>
              {REGION_NAME(code)}
            </option>
          ))}
        </select>
      </div>
      <p className="mb-5 text-sm text-muted">
        Watchlist titles you can stream in {REGION_NAME(region)} right now.
      </p>

      {!session && <p className="text-sm text-muted">Sign in to see your watchlist.</p>}

      {session && !isLoading && watchlist.length === 0 && (
        <div className="mt-10 rounded-3xl border border-line bg-surface/60 p-8 text-center">
          <div className="text-4xl">🍿</div>
          <p className="mt-3 text-sm text-muted">
            Nothing on your watchlist yet. Track something and it'll show up here.
          </p>
        </div>
      )}

      {session && watchlist.length > 0 && (
        <>
          {stillLoading > 0 && (
            <p className="mb-4 rounded-2xl border border-line bg-surface/60 p-3 text-xs text-muted">
              Checking availability… {checked.length - stillLoading} of {checked.length}
            </p>
          )}

          {chips.length > 0 && (
            <div className="no-scrollbar -mx-5 mb-5 flex gap-2 overflow-x-auto px-5 pb-1">
              <button
                onClick={() => setProvider(null)}
                className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition active:scale-95 ${
                  activeProvider === null
                    ? 'border-transparent bg-brand-gradient text-white'
                    : 'border-line bg-surface/60 text-muted'
                }`}
              >
                All <span className="opacity-70">{streamable.length}</span>
              </button>
              {chips.map(({ provider: p, titles }) => {
                const logo = IMG(p.logoPath, 'w200')
                const isActive = activeProvider === p.id
                return (
                  <button
                    key={p.id}
                    onClick={() => setProvider(isActive ? null : p.id)}
                    className={`flex shrink-0 items-center gap-1.5 rounded-full border py-1.5 pl-1.5 pr-3 text-xs font-semibold transition active:scale-95 ${
                      isActive
                        ? 'border-transparent bg-brand-gradient text-white'
                        : 'border-line bg-surface/60 text-muted'
                    }`}
                  >
                    {logo && (
                      <img src={logo} alt="" className="h-5 w-5 rounded ring-1 ring-line" />
                    )}
                    {p.name} <span className="opacity-70">{titles.length}</span>
                  </button>
                )
              })}
            </div>
          )}

          {shown.length === 0 && stillLoading === 0 ? (
            <div className="rounded-3xl border border-line bg-surface/60 p-8 text-center">
              <div className="text-4xl">📭</div>
              <p className="mt-3 text-sm text-muted">
                None of your {checked.length} watchlist titles are streaming in{' '}
                {REGION_NAME(region)}. Try another region.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {shown.map((d) => (
                <Link
                  key={`${d.media_type}-${d.id}`}
                  to={`/title/${d.media_type}/${d.id}`}
                  className="active:scale-[0.97]"
                >
                  <div className="relative">
                    <Poster
                      path={d.posterPath}
                      alt={d.title}
                      size="w342"
                      className="aspect-[2/3] w-full shadow-lg shadow-black/40"
                    />
                    {/* Where it's streaming, when not already filtered to one. */}
                    {activeProvider === null && (
                      <div className="absolute bottom-1.5 left-1.5 flex gap-1">
                        {streamingProviders(d, region)
                          .slice(0, 3)
                          .map((p) => {
                            const logo = IMG(p.logoPath, 'w200')
                            return logo ? (
                              <img
                                key={p.id}
                                src={logo}
                                alt={p.name}
                                title={p.name}
                                className="h-5 w-5 rounded ring-1 ring-black/40"
                              />
                            ) : null
                          })}
                      </div>
                    )}
                  </div>
                  <p className="mt-1.5 truncate text-xs font-medium text-ink/90">{d.title}</p>
                </Link>
              ))}
            </div>
          )}

          {/* No silent limits: say what wasn't checked and why. */}
          <div className="mt-5 space-y-1 text-[11px] text-faint">
            {skipped > 0 && (
              <p>
                Checked the {MAX_CHECKED} most recently added — {skipped} older watchlist{' '}
                {skipped === 1 ? 'title' : 'titles'} not included.
              </p>
            )}
            {failed > 0 && (
              <p>
                {failed} {failed === 1 ? "title couldn't" : "titles couldn't"} be checked. Reopen
                this screen to retry.
              </p>
            )}
            <p>Availability data powered by JustWatch. Rent and buy options aren't counted.</p>
          </div>
        </>
      )}
    </div>
  )
}
