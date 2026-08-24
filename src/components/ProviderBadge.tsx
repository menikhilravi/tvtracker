import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getTitle, streamingIn, IMG } from '../lib/tmdb'
import type { MediaType, WatchProvider } from '../lib/types'

// Every streaming provider for a title in a region. Reuses the detail page's
// query key so a fetch here warms (and is warmed by) that page, and is cached
// 1h at the edge. TMDB has no batch endpoint — this is one request per title —
// so only use it on bounded lists (e.g. search results).
//
// Discovery browses by service through `discover/…?with_watch_providers`
// instead, which filters server-side; this per-title path exists for lists TMDB
// can't filter, like text-search results.
export function useStreamingProviders(
  mediaType: MediaType,
  id: number,
  region: string,
): WatchProvider[] {
  const { data } = useQuery({
    queryKey: ['title', mediaType, id],
    queryFn: () => getTitle(mediaType, id),
    staleTime: 60 * 60 * 1000,
  })
  // Memoized so the identity is stable across renders: callers put this in
  // effect dependencies, and a fresh array each render would re-fire them.
  return useMemo(() => streamingIn(data?.watchProviders[region]), [data, region])
}

/** The single most prominent streaming provider, for a compact badge. */
export function useTopProvider(
  mediaType: MediaType,
  id: number,
  region: string,
): WatchProvider | null {
  return useStreamingProviders(mediaType, id, region)[0] ?? null
}

// A small provider logo shown on list rows ("Streaming on Netflix").
export function ProviderBadge({
  mediaType,
  id,
  region,
}: {
  mediaType: MediaType
  id: number
  region: string
}) {
  const top = useTopProvider(mediaType, id, region)
  const logo = top && IMG(top.logoPath, 'w200')
  if (!top || !logo) return null
  return (
    <img
      src={logo}
      alt={`Streaming on ${top.name}`}
      title={`Streaming on ${top.name}`}
      className="h-5 w-5 shrink-0 rounded ring-1 ring-line"
    />
  )
}
