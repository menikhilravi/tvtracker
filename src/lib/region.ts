import { usePersistedState } from './uiState'

// Best-effort region code from the browser locale, e.g. 'en-GB' -> 'GB'.
export function detectRegion(): string {
  const parts = (navigator.language || 'en-US').split('-')
  const last = parts[parts.length - 1]
  return last.length === 2 ? last.toUpperCase() : 'US'
}

// The user's watch-availability region, persisted and shared across the app
// (the detail page's Where-to-watch selector writes the same key).
export function useWatchRegion() {
  return usePersistedState('watch:region', detectRegion())
}
