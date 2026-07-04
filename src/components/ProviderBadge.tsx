import { useQuery } from '@tanstack/react-query'
import { getTitle, IMG } from '../lib/tmdb'
import type { MediaType, WatchProvider } from '../lib/types'

// The top streaming provider for a title in a region, or null. Reuses the
// detail page's query key so a fetch here warms (and is warmed by) that page,
// and is cached 1h at the edge. TMDB has no batch endpoint — this is one
// request per title — so only use it on bounded lists (e.g. search results).
export function useTopProvider(
  mediaType: MediaType,
  id: number,
  region: string,
): WatchProvider | null {
  const { data } = useQuery({
    queryKey: ['title', mediaType, id],
    queryFn: () => getTitle(mediaType, id),
    staleTime: 60 * 60 * 1000,
  })
  const r = data?.watchProviders[region]
  if (!r) return null
  // "Streaming" = anything you can watch without paying per-title.
  return r.flatrate[0] ?? r.free[0] ?? r.ads[0] ?? null
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
