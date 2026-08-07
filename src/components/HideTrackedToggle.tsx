import { useHideTracked } from '../lib/uiState'

// Filter pill for "hide what's already in my library". Styled to read as state
// rather than an action — lit when the filter is on — matching the genre and
// language pills it sits alongside.
export function HideTrackedToggle() {
  const [hide, setHide] = useHideTracked()
  return (
    <button
      onClick={() => setHide(!hide)}
      aria-pressed={hide}
      className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition active:scale-95 ${
        hide
          ? 'border-transparent bg-brand-gradient text-white'
          : 'border-line bg-surface/60 text-muted'
      }`}
    >
      ✨ New only
    </button>
  )
}
