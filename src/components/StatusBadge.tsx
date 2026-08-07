import type { MediaType } from '../lib/types'
import type { FollowStatus } from '../lib/tracking'

// How a library status reads wherever a title shows up — search rows, discovery
// rails, an actor's filmography. Poster tiles used to say a flat "✓ Tracked",
// which told you a title was in your library but not whether you'd finished it,
// were mid-way through, or had given up on it.
//
// The label is media-type aware because `completed` means different things:
// a movie you've seen is "Watched", a series you've reached the end of is
// "Finished".
const FOLLOW_BADGE: Record<
  FollowStatus,
  {
    icon: string
    label: Record<MediaType, string>
    /** On a solid surface (list rows). */
    pill: string
    /** Over poster art, where the tint has to survive whatever's behind it. */
    overlay: string
  }
> = {
  completed: {
    icon: '✓',
    label: { movie: 'Watched', tv: 'Finished' },
    pill: 'bg-watched/20 text-watched',
    overlay: 'bg-black/75 text-watched',
  },
  watching: {
    icon: '👁',
    label: { movie: 'Watching', tv: 'Watching' },
    pill: 'bg-brand/20 text-brand-2',
    overlay: 'bg-black/75 text-brand-2',
  },
  watchlist: {
    icon: '🔖',
    label: { movie: 'Watchlist', tv: 'Watchlist' },
    pill: 'bg-surface-2 text-muted',
    overlay: 'bg-black/75 text-white/85',
  },
  dropped: {
    icon: '⏹',
    label: { movie: 'Stopped', tv: 'Stopped' },
    pill: 'bg-surface-2 text-faint',
    overlay: 'bg-black/75 text-white/60',
  },
}

// Titles you've finished or abandoned are dimmed in discovery rails — they're
// done, and the point of those rails is to surface something new. Ones you're
// watching or have queued stay at full strength: they're still live for you.
export const isSettled = (status: FollowStatus | undefined) =>
  status === 'completed' || status === 'dropped'

export function statusLabel(status: FollowStatus, mediaType: MediaType): string {
  const b = FOLLOW_BADGE[status]
  return `${b.icon} ${b.label[mediaType]}`
}

// Inline pill for list rows.
export function StatusBadge({
  status,
  mediaType,
}: {
  status: FollowStatus | undefined
  mediaType: MediaType
}) {
  if (!status) return null
  return (
    <span
      className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${FOLLOW_BADGE[status].pill}`}
    >
      {statusLabel(status, mediaType)}
    </span>
  )
}

// Corner badge for poster tiles.
export function PosterStatusBadge({
  status,
  mediaType,
}: {
  status: FollowStatus | undefined
  mediaType: MediaType
}) {
  if (!status) return null
  return (
    <span
      className={`absolute left-1.5 top-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold backdrop-blur ${FOLLOW_BADGE[status].overlay}`}
    >
      {statusLabel(status, mediaType)}
    </span>
  )
}
