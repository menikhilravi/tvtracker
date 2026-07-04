import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useHistory, type HistoryItem } from '../lib/tracking'
import { Poster } from '../components/Poster'

export function History() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const { data: items, isLoading } = useHistory()

  return (
    <div className="px-5 pt-14">
      <button
        onClick={() => navigate(-1)}
        className="mb-3 text-sm text-muted active:text-ink"
      >
        ‹ Back
      </button>
      <h1 className="mb-6 text-3xl font-bold tracking-tight">History</h1>

      {!session && <p className="text-sm text-muted">Sign in to see your watch history.</p>}
      {session && isLoading && <p className="text-sm text-muted">Loading…</p>}

      {session && !isLoading && (!items || items.length === 0) && (
        <div className="mt-10 rounded-3xl border border-line bg-surface/60 p-8 text-center">
          <div className="text-4xl">🕑</div>
          <p className="mt-3 text-sm text-muted">Nothing watched yet.</p>
        </div>
      )}

      <div className="space-y-6">
        {groupByDay(items ?? []).map(([day, dayItems]) => (
          <section key={day}>
            <h2 className="mb-3 text-sm font-semibold text-brand">{day}</h2>
            <div className="space-y-2">
              {dayItems.map((it) => (
                <Link
                  key={it.key}
                  to={`/title/${it.mediaType}/${it.tmdbId}`}
                  className="flex items-center gap-3 rounded-2xl border border-line bg-surface/60 p-2.5 active:scale-[0.99]"
                >
                  <Poster path={it.posterPath} alt={it.name ?? ''} size="w200" className="h-16 w-11" rounded="rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{it.name ?? 'Unknown title'}</p>
                    <p className="truncate text-xs text-muted">{it.subtitle}</p>
                  </div>
                  <span className="shrink-0 text-xs text-faint">{formatTime(it.watchedAt)}</span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function groupByDay(items: HistoryItem[]): [string, HistoryItem[]][] {
  const groups = new Map<string, HistoryItem[]>()
  for (const it of items) {
    const label = formatDay(it.watchedAt)
    if (!groups.has(label)) groups.set(label, [])
    groups.get(label)!.push(it)
  }
  return [...groups.entries()]
}

function formatDay(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const isSameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (isSameDay(d, today)) return 'Today'
  if (isSameDay(d, yesterday)) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}
