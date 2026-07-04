// Lightweight per-session UI memory so lists keep their tab / filter / sort /
// scroll when you open a title and press back. State lives in a module-level
// map: it survives route unmounts within the session and resets on full reload.
// (Window scroll is handled separately by React Router's <ScrollRestoration>.)

import { useLayoutEffect, useRef, useState } from 'react'

const store = new Map<string, unknown>()

export function usePersistedState<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => (store.has(key) ? (store.get(key) as T) : initial))
  const set = (v: T) => {
    store.set(key, v)
    setValue(v)
  }
  return [value, set]
}

// Remember and restore an element's scrollTop across unmounts (e.g. a modal's
// scroll region, which the window-level ScrollRestoration can't see).
export function useScrollMemory<T extends HTMLElement>(key: string) {
  const ref = useRef<T>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (el) {
      const saved = store.get(key)
      if (typeof saved === 'number') el.scrollTop = saved
    }
    return () => {
      if (ref.current) store.set(key, ref.current.scrollTop)
    }
  }, [key])
  return ref
}
