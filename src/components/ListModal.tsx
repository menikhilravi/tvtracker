// Create/edit form for a custom list: name + optional emoji. Used by the
// Profile "New list" button and the list page's rename.
import { useState } from 'react'
import { useCreateList, useUpdateList, type ListRow } from '../lib/lists'

const EMOJIS = ['🍿', '😌', '❤️', '😂', '👻', '🔥', '🌙', '⭐', '🎄', '🤝', '🧠', '🏆']

export function ListModal({
  list,
  onClose,
  onSaved,
}: {
  list?: ListRow // present → edit, absent → create
  onClose: () => void
  onSaved?: (id: number) => void
}) {
  const create = useCreateList()
  const update = useUpdateList()
  const [name, setName] = useState(list?.name ?? '')
  const [emoji, setEmoji] = useState<string | null>(list?.emoji ?? null)
  const [error, setError] = useState<string | null>(null)
  const busy = create.isPending || update.isPending

  const save = () => {
    if (!name.trim()) return
    setError(null)
    const done = (id: number) => {
      onSaved?.(id)
      onClose()
    }
    const fail = (e: Error) => setError(e.message)
    if (list) update.mutate({ id: list.id, name, emoji }, { onSuccess: () => done(list.id), onError: fail })
    else create.mutate({ name, emoji }, { onSuccess: done, onError: fail })
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center px-6">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/60" />
      <div className="relative w-full max-w-sm rounded-3xl border border-line bg-surface p-5">
        <h2 className="text-lg font-bold tracking-tight">{list ? 'Edit list' : 'New list'}</h2>

        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          placeholder="Comfort shows, Movie night…"
          maxLength={60}
          className="mt-4 w-full rounded-2xl border border-line bg-bg/60 px-4 py-3 text-sm outline-none placeholder:text-faint focus:border-brand/60"
        />

        <div className="mt-3 flex flex-wrap gap-1.5">
          {EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => setEmoji(emoji === e ? null : e)}
              aria-pressed={emoji === e}
              className={`grid h-9 w-9 place-items-center rounded-xl text-lg transition active:scale-90 ${
                emoji === e ? 'bg-brand-gradient shadow-md shadow-brand/25' : 'bg-surface-2'
              }`}
            >
              {e}
            </button>
          ))}
        </div>

        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

        <div className="mt-5 flex gap-2">
          <button
            onClick={save}
            disabled={busy || !name.trim()}
            className="flex-1 rounded-2xl bg-brand-gradient py-2.5 text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
          >
            {busy ? '…' : list ? 'Save' : 'Create'}
          </button>
          <button
            onClick={onClose}
            className="rounded-2xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-muted active:scale-[0.98]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
