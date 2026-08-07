import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import {
  useHistory,
  useUpdateWatchDate,
  useDeleteWatch,
  type HistoryItem,
} from '../lib/tracking'
import { Poster } from '../components/Poster'

export function History() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const { data: items, isLoading } = useHistory()
  // Same pattern as the library: a mode switch, so a stray tap while browsing
  // can't delete a watch.
  const [editing, setEditing] = useState(false)

  const isEmpty = !items || items.length === 0

  return (
    <div className="px-5 pt-14 pb-6">
      <button onClick={() => navigate(-1)} className="mb-3 text-sm text-muted active:text-ink">
        ‹ Back
      </button>

      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">History</h1>
        {session && !isEmpty && (
          <button
            onClick={() => setEditing((v) => !v)}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold active:scale-95 ${
              editing ? 'border-transparent bg-brand-gradient text-white' : 'border-line bg-surface'
            }`}
          >
            {editing ? 'Done' : 'Edit'}
          </button>
        )}
      </div>

      {!session && <p className="text-sm text-muted">Sign in to see your watch history.</p>}
      {session && isLoading && <p className="text-sm text-muted">Loading…</p>}

      {session && !isLoading && isEmpty && (
        <div className="mt-10 rounded-3xl border border-line bg-surface/60 p-8 text-center">
          <div className="text-4xl">🕑</div>
          <p className="mt-3 text-sm text-muted">Nothing watched yet.</p>
        </div>
      )}

      {editing && !isEmpty && (
        <p className="mb-4 rounded-2xl border border-line bg-surface/60 p-3 text-xs text-muted">
          Change a date to move a watch to the day you actually saw it — streaks and the activity
          heatmap follow. Only the most recent {HISTORY_LIMIT} watches are listed.
        </p>
      )}

      <div className="space-y-6">
        {groupByDay(items ?? []).map(([day, dayItems]) => (
          <section key={day}>
            <h2 className="mb-3 text-sm font-semibold text-brand">{day}</h2>
            <div className="space-y-2">
              {dayItems.map((it) =>
                editing ? (
                  <EditableRow key={it.key} item={it} />
                ) : (
                  <Link
                    key={it.key}
                    to={`/title/${it.mediaType}/${it.tmdbId}`}
                    className="flex items-center gap-3 rounded-2xl border border-line bg-surface/60 p-2.5 active:scale-[0.99]"
                  >
                    <RowFace item={it} />
                    <span className="shrink-0 text-xs text-faint">{formatTime(it.watchedAt)}</span>
                  </Link>
                ),
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

// The history query's page size, surfaced so the edit hint can be honest about
// what you can reach from here.
const HISTORY_LIMIT = 60

function RowFace({ item }: { item: HistoryItem }) {
  return (
    <>
      <Poster
        path={item.posterPath}
        alt={item.name ?? ''}
        size="w200"
        className="h-16 w-11"
        rounded="rounded-lg"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.name ?? 'Unknown title'}</p>
        <p className="truncate text-xs text-muted">
          {item.subtitle}
          {item.plays > 1 && <span className="ml-1.5 font-semibold text-watched">×{item.plays}</span>}
        </p>
      </div>
    </>
  )
}

function EditableRow({ item }: { item: HistoryItem }) {
  const updateDate = useUpdateWatchDate()
  const remove = useDeleteWatch()
  const [confirming, setConfirming] = useState(false)

  const busy = updateDate.isPending || remove.isPending
  const error = (updateDate.error ?? remove.error) as Error | null

  // An episode row carries its rewatches, so deleting it removes more than the
  // one viewing the list appears to show. Say how many before doing it.
  const needsConfirm = item.plays > 1

  return (
    <div className="rounded-2xl border border-line bg-surface/60 p-2.5">
      <div className="flex items-center gap-3">
        <RowFace item={item} />
        <button
          onClick={() => (needsConfirm && !confirming ? setConfirming(true) : remove.mutate(item))}
          disabled={busy}
          aria-label={`Remove ${item.name ?? 'watch'}`}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-red-500 text-sm font-bold text-white active:scale-90 disabled:opacity-50"
        >
          ✕
        </button>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <label className="text-[11px] text-faint">Watched</label>
        <input
          type="date"
          value={item.watchedAt.slice(0, 10)}
          max={new Date().toISOString().slice(0, 10)}
          disabled={busy}
          onChange={(e) =>
            e.target.value &&
            updateDate.mutate({ source: item.source, id: item.id, day: e.target.value })
          }
          className="rounded-lg border border-line bg-surface px-2 py-1 text-xs text-ink outline-none focus:border-brand/60 disabled:opacity-50"
        />
        {busy && <span className="text-[11px] text-faint">saving…</span>}
      </div>

      {confirming && (
        <div className="mt-2 rounded-xl border border-red-500/40 bg-red-500/10 p-2.5">
          <p className="text-[11px] text-muted">
            This removes all {item.plays} watches of this episode.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => remove.mutate(item)}
              disabled={busy}
              className="rounded-lg bg-red-500 px-3 py-1 text-xs font-semibold text-white active:scale-95 disabled:opacity-50"
            >
              Remove all
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="rounded-lg border border-line bg-surface px-3 py-1 text-xs font-semibold text-muted active:scale-95"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-1.5 text-[11px] text-red-400">{error.message}</p>}
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
