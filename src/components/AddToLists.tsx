// "Add to list" on the title page: a compact button showing where this title
// already lives, opening a bottom sheet of your lists with toggles. Lists are
// independent of tracking status — you can shortlist something you don't track.
import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import {
  useAllListItems,
  useCreateList,
  useLists,
  useToggleListItem,
  type ListableTitle,
  type ListRow,
} from '../lib/lists'

export function AddToLists({ title }: { title: ListableTitle }) {
  const { session } = useAuth()
  const [open, setOpen] = useState(false)
  const lists = useLists()
  const items = useAllListItems()

  if (!session) return null

  const memberIds = new Set(
    (items.data ?? [])
      .filter((r) => r.tmdb_id === title.id && r.media_type === title.media_type)
      .map((r) => r.list_id),
  )
  const inLists = (lists.data ?? []).filter((l) => memberIds.has(l.id))
  const label =
    inLists.length === 0
      ? 'Add to list'
      : `${inLists[0].emoji ? `${inLists[0].emoji} ` : ''}${inLists[0].name}${
          inLists.length > 1 ? ` +${inLists.length - 1}` : ''
        }`

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mt-2.5 flex w-full items-center justify-between rounded-2xl border border-line bg-surface/60 px-4 py-3 text-sm transition active:scale-[0.98]"
      >
        <span className={inLists.length ? 'font-medium text-ink' : 'text-muted'}>🗂 {label}</span>
        <span className="text-faint">›</span>
      </button>
      {open && (
        <ListSheet
          title={title}
          lists={lists.data ?? []}
          memberIds={memberIds}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

function ListSheet({
  title,
  lists,
  memberIds,
  onClose,
}: {
  title: ListableTitle
  lists: ListRow[]
  memberIds: Set<number>
  onClose: () => void
}) {
  const toggle = useToggleListItem()
  const create = useCreateList()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

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

  // Create a list and drop this title straight into it — one gesture.
  const createAndAdd = () => {
    if (!name.trim()) return
    setError(null)
    create.mutate(
      { name },
      {
        onSuccess: (id) => {
          toggle.mutate({ listId: id, title, inList: false })
          setName('')
        },
        onError: (e) => setError((e as Error).message),
      },
    )
  }

  return (
    <div className="fixed inset-0 z-50">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/60" />
      <div className="absolute inset-x-0 bottom-0 max-h-[75dvh] overflow-y-auto rounded-t-3xl border-t border-line bg-surface px-5 pb-8 pt-4">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
        <h2 className="text-base font-bold tracking-tight">Save to…</h2>

        {lists.length === 0 && (
          <p className="mt-2 text-xs text-muted">
            No lists yet — make your first one below. Comfort shows? Movie night?
          </p>
        )}

        <div className="mt-2 divide-y divide-line">
          {lists.map((l) => {
            const inList = memberIds.has(l.id)
            return (
              <button
                key={l.id}
                onClick={() => toggle.mutate({ listId: l.id, title, inList })}
                aria-pressed={inList}
                className="flex w-full items-center gap-3 py-3 text-left active:opacity-70"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-lg">
                  {l.emoji ?? '🗂'}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{l.name}</span>
                <span
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold transition ${
                    inList ? 'bg-watched text-bg' : 'border border-line bg-bg/40 text-faint'
                  }`}
                >
                  ✓
                </span>
              </button>
            )
          })}
        </div>

        <div className="mt-3 flex gap-2 border-t border-line pt-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createAndAdd()}
            placeholder="New list…"
            maxLength={60}
            className="min-w-0 flex-1 rounded-2xl border border-line bg-bg/60 px-4 py-2.5 text-sm outline-none placeholder:text-faint focus:border-brand/60"
          />
          <button
            onClick={createAndAdd}
            disabled={create.isPending || !name.trim()}
            className="shrink-0 rounded-2xl bg-brand-gradient px-4 py-2.5 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-50"
          >
            {create.isPending ? '…' : '＋ Create'}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      </div>
    </div>
  )
}
