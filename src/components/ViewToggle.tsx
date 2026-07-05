import type { ReactNode } from 'react'

// How Home's Watchlist / Up Next lists are laid out.
export type ViewMode = 'rail' | 'grid' | 'list'

const ICON: Record<ViewMode, ReactNode> = {
  // Carousel: emphasized center card, faded side cards.
  rail: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <rect x="1" y="4" width="3.5" height="8" rx="1" opacity="0.4" />
      <rect x="6" y="3" width="4" height="10" rx="1" />
      <rect x="11.5" y="4" width="3.5" height="8" rx="1" opacity="0.4" />
    </svg>
  ),
  // 2×2 grid.
  grid: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </svg>
  ),
  // Rows.
  list: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
      <path d="M2 4h12M2 8h12M2 12h12" />
    </svg>
  ),
}

const MODES: ViewMode[] = ['rail', 'grid', 'list']

export function ViewToggle({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <div className="flex gap-0.5 rounded-xl border border-line bg-surface/60 p-0.5">
      {MODES.map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          aria-label={`${m} view`}
          aria-pressed={value === m}
          className={`grid h-7 w-7 place-items-center rounded-lg transition active:scale-90 ${
            value === m ? 'bg-brand-gradient text-white' : 'text-muted'
          }`}
        >
          {ICON[m]}
        </button>
      ))}
    </div>
  )
}
