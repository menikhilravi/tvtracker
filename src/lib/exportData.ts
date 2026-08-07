// A complete, self-contained dump of everything this app holds about you.
//
// The whole premise of TV Tracker is that a service shutting down shouldn't take
// your viewing history with it — which only holds if you can get the data back
// out. So this exports every user-owned table, and carries the referenced titles
// alongside it: a backup full of bare TMDB ids is not readable by a human, or by
// whatever you migrate to next.

import { supabase } from './supabase'
import { fetchAllRows } from './tracking'
import type { MediaType } from './types'

export const EXPORT_FORMAT = 'tvtracker-export'
export const EXPORT_VERSION = 1

export interface ExportedTitle {
  tmdb_id: number
  media_type: MediaType
  name: string | null
  poster_path: string | null
  release_year: number | null
  runtime: number | null
  episode_run_time: number | null
  number_of_episodes: number | null
  genres: string[] | null
  networks: string[] | null
  release_date: string | null
}

export interface ExportBundle {
  format: typeof EXPORT_FORMAT
  version: number
  exportedAt: string
  note: string
  user: { id: string; email: string | null }
  counts: Record<string, number>
  titles: ExportedTitle[]
  follows: unknown[]
  episodeWatches: unknown[]
  movieWatches: unknown[]
  ratings: unknown[]
  episodeRatings: unknown[]
  characterVotes: unknown[]
}

// `id` is the identity primary key on every user-owned table, and paginating by
// it is stable under concurrent writes in a way that ordering by a timestamp
// (which ties across an import batch) is not.
function page<T>(table: string, columns: string): Promise<T[]> {
  return fetchAllRows<T>(
    (from, to) =>
      // supabase-js infers row types from a *literal* column string; these are
      // built per table, so the shape is asserted here instead.
      supabase!.from(table).select(columns).order('id', { ascending: true }).range(from, to) as
        unknown as PromiseLike<{ data: T[] | null; error: unknown }>,
  )
}

// `titles` is shared reference data rather than user-scoped, so we pull only the
// rows the user's own data actually points at. Ids go out in chunks: a library
// of thousands would otherwise build a URL long enough to be rejected.
const ID_CHUNK = 300

// The detail columns arrive with migration 0006. A backup must not fail just
// because that hasn't been run yet, so fall back to the columns every install
// has — you get a smaller export rather than no export.
const TITLE_COLUMNS_FULL =
  'tmdb_id, media_type, name, poster_path, release_year, runtime, episode_run_time, number_of_episodes, genres, networks, release_date'
const TITLE_COLUMNS_BASE = 'tmdb_id, media_type, name, poster_path, release_year'

async function fetchReferencedTitles(refs: Set<string>): Promise<ExportedTitle[]> {
  const ids = [...new Set([...refs].map((r) => Number(r.split(':')[1])))]
  let columns = TITLE_COLUMNS_FULL
  const out: ExportedTitle[] = []

  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const chunk = ids.slice(i, i + ID_CHUNK)
    const get = (cols: string) =>
      supabase!.from('titles').select(cols).in('tmdb_id', chunk)

    let { data, error } = await get(columns)
    if (error && columns === TITLE_COLUMNS_FULL) {
      // Undefined column — retry this chunk, and every later one, on the base set.
      columns = TITLE_COLUMNS_BASE
      ;({ data, error } = await get(columns))
    }
    if (error) throw error

    // An id can exist as both a movie and a show, so match on the pair.
    for (const t of (data ?? []) as unknown as ExportedTitle[]) {
      if (refs.has(`${t.media_type}:${t.tmdb_id}`)) out.push(t)
    }
  }
  return out
}

export async function buildExport(user: { id: string; email?: string }): Promise<ExportBundle> {
  if (!supabase) throw new Error('Not configured')

  const [follows, episodeWatches, movieWatches, ratings, episodeRatings, characterVotes] =
    await Promise.all([
      page<{ tmdb_id: number; media_type: MediaType }>(
        'follows',
        'tmdb_id, media_type, status, name, poster_path, created_at, updated_at',
      ),
      page<{ tmdb_show_id: number }>(
        'episode_watches',
        'tmdb_show_id, season_number, episode_number, watched_at',
      ),
      page<{ tmdb_movie_id: number }>('movie_watches', 'tmdb_movie_id, watched_at'),
      page<{ tmdb_id: number; media_type: MediaType }>(
        'ratings',
        'tmdb_id, media_type, score, review, created_at, updated_at',
      ),
      page<{ tmdb_show_id: number }>(
        'episode_ratings',
        'tmdb_show_id, season_number, episode_number, score, updated_at',
      ),
      page<{ tmdb_id: number; media_type: MediaType }>(
        'character_votes',
        'tmdb_id, media_type, season_number, episode_number, person_id, character_name, actor_name, profile_path, created_at',
      ),
    ])

  const refs = new Set<string>()
  for (const r of follows) refs.add(`${r.media_type}:${r.tmdb_id}`)
  for (const r of ratings) refs.add(`${r.media_type}:${r.tmdb_id}`)
  for (const r of characterVotes) refs.add(`${r.media_type}:${r.tmdb_id}`)
  for (const r of episodeWatches) refs.add(`tv:${r.tmdb_show_id}`)
  for (const r of episodeRatings) refs.add(`tv:${r.tmdb_show_id}`)
  for (const r of movieWatches) refs.add(`movie:${r.tmdb_movie_id}`)

  const titles = await fetchReferencedTitles(refs)

  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    note: 'Personal export from TV Tracker. Watch/rating rows reference titles by TMDB id + media type; the `titles` array resolves those to names and metadata.',
    user: { id: user.id, email: user.email ?? null },
    counts: {
      titles: titles.length,
      follows: follows.length,
      episodeWatches: episodeWatches.length,
      movieWatches: movieWatches.length,
      ratings: ratings.length,
      episodeRatings: episodeRatings.length,
      characterVotes: characterVotes.length,
    },
    titles,
    follows,
    episodeWatches,
    movieWatches,
    ratings,
    episodeRatings,
    characterVotes,
  }
}

// Hand the bundle to the browser as a file. Revoking the object URL on the next
// tick keeps the blob alive long enough for the download to start without
// leaking it for the life of the page.
export function downloadExport(bundle: ExportBundle) {
  const stamp = bundle.exportedAt.slice(0, 10)
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `tvtracker-backup-${stamp}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
