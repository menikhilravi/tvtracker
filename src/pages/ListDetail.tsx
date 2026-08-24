// One custom list: its titles as a poster grid, with rename/delete and
// per-item removal behind an Edit toggle.
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAllListItems, useDeleteList, useLists, useToggleListItem } from '../lib/lists'
import { ListModal } from '../components/ListModal'
import { Poster } from '../components/Poster'

export function ListDetail() {
  const { id } = useParams<{ id: string }>()
  const listId = Number(id)
  const navigate = useNavigate()
  const lists = useLists()
  const items = useAllListItems()
  const del = useDeleteList()
  const toggle = useToggleListItem()
  const [editing, setEditing] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const list = lists.data?.find((l) => l.id === listId)
  const rows = (items.data ?? [])
    .filter((r) => r.list_id === listId)
    .sort((a, b) => b.added_at.localeCompare(a.added_at))

  if (lists.isLoading) return <p className="p-6 text-sm text-muted">Loading…</p>
  if (!list)
    return (
      <div className="px-5 pt-14">
        <p className="text-sm text-muted">This list doesn’t exist (anymore).</p>
        <button onClick={() => navigate('/profile')} className="mt-3 text-sm font-semibold text-brand-2">
          ‹ Back to profile
        </button>
      </div>
    )

  const deleteList = () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    del.mutate(list.id, { onSuccess: () => navigate('/profile') })
  }

  return (
    <div className="px-5 pb-6 pt-14">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line bg-surface/60 text-lg active:scale-90"
        >
          ‹
        </button>
        <h1 className="min-w-0 flex-1 truncate text-2xl font-bold tracking-tight">
          {list.emoji ? `${list.emoji} ` : ''}
          {list.name}
        </h1>
        <button
          onClick={() => {
            setEditing((v) => !v)
            setConfirmDelete(false)
          }}
          className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold active:scale-95 ${
            editing ? 'border-transparent bg-brand-gradient text-white' : 'border-line bg-surface'
          }`}
        >
          {editing ? 'Done' : 'Edit'}
        </button>
      </div>

      <p className="mt-2 text-xs text-faint">
        {rows.length} title{rows.length === 1 ? '' : 's'}
      </p>

      {editing && (
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => setRenaming(true)}
            className="flex-1 rounded-2xl border border-line bg-surface py-2.5 text-sm font-semibold text-muted active:scale-[0.98]"
          >
            ✏️ Rename
          </button>
          <button
            onClick={deleteList}
            disabled={del.isPending}
            className={`flex-1 rounded-2xl py-2.5 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-50 ${
              confirmDelete ? 'bg-red-500 text-white' : 'border border-line bg-surface text-red-400'
            }`}
          >
            {del.isPending ? '…' : confirmDelete ? 'Tap again to delete' : '🗑 Delete list'}
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-line bg-surface/60 px-4 py-6 text-center text-sm text-muted">
          Nothing here yet. Open any show or movie and tap{' '}
          <span className="font-semibold text-ink">🗂 Add to list</span>.
        </p>
      ) : (
        <div className="mt-5 grid grid-cols-3 gap-3">
          {rows.map((r) => {
            const key = `${r.media_type}-${r.tmdb_id}`
            return editing ? (
              <div key={key} className="relative">
                <Poster
                  path={r.poster_path}
                  alt={r.name ?? ''}
                  size="w342"
                  className="aspect-[2/3] w-full opacity-60 shadow-lg shadow-black/40"
                />
                <button
                  onClick={() =>
                    toggle.mutate({
                      listId: list.id,
                      title: {
                        id: r.tmdb_id,
                        media_type: r.media_type,
                        title: r.name ?? '',
                        posterPath: r.poster_path,
                      },
                      inList: true,
                    })
                  }
                  aria-label={`Remove ${r.name ?? 'title'} from list`}
                  className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-red-500 text-sm font-bold text-white shadow-lg active:scale-90"
                >
                  ✕
                </button>
                <p className="mt-1.5 truncate text-xs font-medium text-ink/90">{r.name}</p>
              </div>
            ) : (
              <Link key={key} to={`/title/${r.media_type}/${r.tmdb_id}`} className="active:scale-[0.97]">
                <Poster
                  path={r.poster_path}
                  alt={r.name ?? ''}
                  size="w342"
                  className="aspect-[2/3] w-full shadow-lg shadow-black/40"
                />
                <p className="mt-1.5 truncate text-xs font-medium text-ink/90">{r.name}</p>
              </Link>
            )
          })}
        </div>
      )}

      {renaming && <ListModal list={list} onClose={() => setRenaming(false)} />}
    </div>
  )
}
