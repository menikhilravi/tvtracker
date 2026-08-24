// The Lists rail on Profile: your custom lists with counts and a few poster
// previews, plus the entry point for creating one.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAllListItems, useLists, type ListItemRow } from '../lib/lists'
import { ListModal } from './ListModal'
import { Poster } from './Poster'

export function ListsSection() {
  const lists = useLists()
  const items = useAllListItems()
  const [creating, setCreating] = useState(false)

  // Newest additions lead the preview stack.
  const byList = new Map<number, ListItemRow[]>()
  for (const r of items.data ?? []) {
    const arr = byList.get(r.list_id) ?? []
    arr.push(r)
    byList.set(r.list_id, arr)
  }
  for (const arr of byList.values()) arr.sort((a, b) => b.added_at.localeCompare(a.added_at))

  return (
    <div className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wide text-muted">Lists</h2>
        <button
          onClick={() => setCreating(true)}
          className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-muted active:scale-95"
        >
          ＋ New
        </button>
      </div>

      {(lists.data ?? []).length === 0 ? (
        <button
          onClick={() => setCreating(true)}
          className="w-full rounded-2xl border border-dashed border-line bg-surface/40 px-4 py-5 text-center active:scale-[0.99]"
        >
          <p className="text-sm font-medium">🗂 Group titles your way</p>
          <p className="mt-1 text-xs text-muted">
            Comfort shows, movie night, watch with Dad — tap to make your first list.
          </p>
        </button>
      ) : (
        <div className="space-y-3">
          {(lists.data ?? []).map((l) => {
            const rows = byList.get(l.id) ?? []
            return (
              <Link
                key={l.id}
                to={`/list/${l.id}`}
                className="flex w-full items-center gap-4 rounded-2xl border border-line bg-surface/60 px-4 py-3.5 transition active:scale-[0.99]"
              >
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface-2 text-xl">
                  {l.emoji ?? '🗂'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate font-semibold">{l.name}</span>
                    <span className="shrink-0 text-sm text-faint">{rows.length}</span>
                  </div>
                  <p className="truncate text-xs text-muted">
                    {rows.length === 0
                      ? 'Empty — add titles from their page'
                      : rows
                          .slice(0, 3)
                          .map((r) => r.name)
                          .filter(Boolean)
                          .join(' · ')}
                  </p>
                </div>
                {/* A small overlapping poster stack of the newest additions. */}
                {rows.length > 0 && (
                  <div className="flex shrink-0 -space-x-3">
                    {rows.slice(0, 3).map((r) => (
                      <Poster
                        key={`${r.media_type}-${r.tmdb_id}`}
                        path={r.poster_path}
                        alt=""
                        size="w200"
                        rounded="rounded-md"
                        className="h-12 w-8 ring-2 ring-surface"
                      />
                    ))}
                  </div>
                )}
                <span className="shrink-0 text-faint">›</span>
              </Link>
            )
          })}
        </div>
      )}

      {creating && <ListModal onClose={() => setCreating(false)} />}
    </div>
  )
}
