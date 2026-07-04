#!/usr/bin/env node
// Import a TV Time GDPR export into your tracker.
//
// Usage:
//   node scripts/import-tvtime.mjs <path-to-export-dir> [--dry-run] [--reset]
//
// Why it works the way it does: TV Time's export does NOT contain a complete
// per-episode watch list (only ~40% of episodes appear as rows) and has no
// explicit "completed/watching" status. The reliable, complete signal is
// `nb_episodes_seen` (a count per show). So we:
//   * mark the first N episodes of each show watched, in TMDB order (N = count)
//   * derive status by comparing N to the show's real episode count from TMDB
//
// Flags:
//   --dry-run   parse + report only, write nothing
//   --reset     delete your existing follows/episode_watches/ratings first
//
// Prereq: redeploy the proxy so the /find endpoint exists:
//   supabase functions deploy tmdb-proxy

import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { parse } from 'csv-parse/sync'
import { createClient } from '@supabase/supabase-js'

const exportDir = process.argv[2]
const DRY_RUN = process.argv.includes('--dry-run')
const RESET = process.argv.includes('--reset')

if (!exportDir || !fs.existsSync(exportDir)) {
  console.error('Usage: node scripts/import-tvtime.mjs <path-to-export-dir> [--dry-run] [--reset]')
  process.exit(1)
}

// --- env --------------------------------------------------------------------

function loadEnv() {
  const env = { ...process.env }
  const envPath = path.resolve('.env')
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/)
      if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
  return env
}
const env = loadEnv()
const SUPABASE_URL = env.VITE_SUPABASE_URL
const ANON_KEY = env.VITE_SUPABASE_ANON_KEY
const PROXY_URL = (
  env.VITE_TMDB_PROXY_URL || (SUPABASE_URL && `${SUPABASE_URL}/functions/v1/tmdb-proxy`)
)?.replace(/\/$/, '')

// --- CSV helpers ------------------------------------------------------------

function readCsv(name) {
  const file = path.join(exportDir, name)
  if (!fs.existsSync(file)) return []
  return parse(fs.readFileSync(file, 'utf8'), {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
  })
}

const toIso = (s) => {
  if (!s) return null
  const d = new Date(s.replace(' ', 'T') + 'Z')
  return isNaN(d) ? null : d.toISOString()
}

// --- parse the export -------------------------------------------------------

const userShowData = readCsv('user_tv_show_data.csv') // tv_show_id, nb_episodes_seen, tv_show_name
const followed = readCsv('followed_tv_show.csv') // tv_show_id, tv_show_name, archived, created_at
const showRatings = readCsv('tv_show_rate.csv') // tv_show_id, rating (out of 5)
const explicit = [
  ...readCsv('watched_on_episode.csv'),
  ...readCsv('seen_episode_source.csv'),
  ...readCsv('seen_episode.csv'),
  ...readCsv('seen_episode_unitarian.csv'),
]

const followedIds = new Set(followed.map((r) => Number(r.tv_show_id)))
const followedCreated = new Map(followed.map((r) => [Number(r.tv_show_id), toIso(r.created_at)]))

// Real watch dates we do have, keyed by "name|season|episode" (earliest wins),
// plus the latest activity date per show name for filling unknowns.
const dateByEp = new Map()
const latestByName = new Map()
for (const r of explicit) {
  const name = r.tv_show_name
  const s = Number(r.episode_season_number)
  const e = Number(r.episode_number)
  const iso = toIso(r.created_at)
  if (name && s && e && iso) {
    const key = `${name}|${s}|${e}`
    if (!dateByEp.has(key) || iso < dateByEp.get(key)) dateByEp.set(key, iso)
    if (!latestByName.has(name) || iso > latestByName.get(name)) latestByName.set(name, iso)
  }
}

// One entry per show we care about, keyed by TheTVDB id.
const shows = new Map()
for (const r of userShowData) {
  const tvdbId = Number(r.tv_show_id)
  shows.set(tvdbId, {
    tvdbId,
    name: r.tv_show_name,
    seen: Number(r.nb_episodes_seen || 0),
    followed: followedIds.has(tvdbId),
  })
}
// Followed shows with no user_tv_show_data row (unstarted watchlist items).
for (const id of followedIds) {
  if (!shows.has(id)) {
    const f = followed.find((r) => Number(r.tv_show_id) === id)
    shows.set(id, { tvdbId: id, name: f?.tv_show_name ?? '', seen: 0, followed: true })
  }
}

const ratingByTvdb = new Map()
for (const r of showRatings) {
  const score = Math.max(1, Math.min(10, Math.round(Number(r.rating) * 2)))
  if (score) ratingByTvdb.set(Number(r.tv_show_id), score)
}

const totalSeen = [...shows.values()].reduce((n, s) => n + s.seen, 0)

// --- movies -----------------------------------------------------------------
// TV Time has no dedicated movie CSV; movie activity lives in the unified
// tracking-prod-records.csv, distinguished by entity_type='movie'. There is no
// TMDB/external id — only a title and release_date — so movies are resolved by
// name + year later. Row types we care about:
//   watch   → you've watched it        → completed + a movie_watches row
//   towatch → on your watchlist        → watchlist
// (a 'follow' row is just the union of the two, so we ignore it.)
const tracking = readCsv('tracking-prod-records.csv')
const movieYear = (r) => (r.release_date || '').slice(0, 10).slice(0, 4) || null

const watchedMovies = new Map() // "name|year" -> { name, year, watchedAt }
const watchlistMovies = new Map()
for (const r of tracking) {
  if (r.entity_type !== 'movie' || !r.movie_name) continue
  const year = movieYear(r)
  const key = `${r.movie_name}|${year ?? ''}`
  if (r.type === 'watch') {
    if (!watchedMovies.has(key)) {
      watchedMovies.set(key, {
        name: r.movie_name,
        year,
        watchedAt: toIso(r.created_at) || toIso(r.updated_at) || null,
      })
    }
  } else if (r.type === 'towatch') {
    if (!watchlistMovies.has(key)) watchlistMovies.set(key, { name: r.movie_name, year })
  }
}
// A movie you've watched is never also "to watch".
for (const key of watchedMovies.keys()) watchlistMovies.delete(key)
const allMovies = [
  ...[...watchedMovies.values()].map((m) => ({ ...m, watched: true })),
  ...[...watchlistMovies.values()].map((m) => ({ ...m, watched: false })),
]

console.log('\n📦 Parsed TV Time export:')
console.log(`   Shows:                 ${shows.size}`)
console.log(`   Episodes watched (Σ):  ${totalSeen}`)
console.log(`   Show ratings:          ${ratingByTvdb.size}`)
console.log(`   Movies watched:        ${watchedMovies.size}`)
console.log(`   Movies to watch:       ${watchlistMovies.size}`)

if (DRY_RUN) {
  console.log('\n(dry run — nothing written; statuses/episodes are computed live during a real run)')
  const sample = [...shows.values()]
    .sort((a, b) => b.seen - a.seen)
    .slice(0, 10)
    .map((s) => `   • ${s.name} — ${s.seen} seen${s.followed ? '' : ' (not followed)'}`)
  console.log('\nMost-watched shows:\n' + sample.join('\n'))
  const movieSample = allMovies
    .slice(0, 10)
    .map((m) => `   • ${m.name}${m.year ? ` (${m.year})` : ''} — ${m.watched ? 'watched' : 'watchlist'}`)
  console.log('\nMovies (sample):\n' + movieSample.join('\n'))
  process.exit(0)
}

// --- TMDB lookup (id + episode structure), cached ---------------------------

if (!PROXY_URL || !ANON_KEY) {
  console.error('\nMissing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env')
  process.exit(1)
}

const mapPath = path.join(exportDir, 'tmdb-id-map.json')
const idMap = fs.existsSync(mapPath) ? JSON.parse(fs.readFileSync(mapPath, 'utf8')) : {}
const movieMapPath = path.join(exportDir, 'tmdb-movie-map.json')
const movieMap = fs.existsSync(movieMapPath) ? JSON.parse(fs.readFileSync(movieMapPath, 'utf8')) : {}
const authHeaders = { apikey: ANON_KEY, authorization: `Bearer ${ANON_KEY}` }

const getJson = (url) => fetch(url, { headers: authHeaders }).then((r) => r.json())

// Find the TMDB id for a show: first by TheTVDB id, then (if that misses) by
// name search — many regional/newer shows have no tvdb→tmdb cross-reference.
async function findTmdbId(tvdbId, name) {
  const find = await getJson(`${PROXY_URL}/find/${tvdbId}?external_source=tvdb_id`)
  if (find.tv_results?.[0]) return find.tv_results[0].id

  if (!name) return null
  const yearHint = name.match(/\((\d{4})\)/)?.[1]
  const query = name.replace(/\s*\(\d{4}\)\s*/, '').trim()
  const search = await getJson(
    `${PROXY_URL}/search/multi?query=${encodeURIComponent(query)}&include_adult=false`,
  )
  const tv = (search.results ?? []).filter((r) => r.media_type === 'tv')
  if (tv.length === 0) return null
  // Prefer a first-air-year match when the TV Time name carried a year.
  const byYear = yearHint && tv.find((r) => (r.first_air_date || '').startsWith(yearHint))
  return (byYear || tv[0]).id
}

async function resolveShow(tvdbId, name) {
  // Reuse only successful, current-shape cache entries. Old-shape entries and
  // previous "not found" nulls are re-resolved (so the name fallback applies).
  const cached = idMap[tvdbId]
  if (cached && cached.seasons !== undefined) return cached
  try {
    const tmdbId = await findTmdbId(tvdbId, name)
    if (!tmdbId) {
      idMap[tvdbId] = null
      return null
    }
    const detail = await getJson(`${PROXY_URL}/tv/${tmdbId}`)
    idMap[tvdbId] = {
      id: tmdbId,
      name: detail.name ?? name,
      poster_path: detail.poster_path ?? null,
      year: (detail.first_air_date || '').slice(0, 4) || null,
      numberOfEpisodes: detail.number_of_episodes ?? 0,
      status: detail.status ?? '',
      // [[seasonNumber, episodeCount], …] excluding specials (season 0)
      seasons: (detail.seasons ?? [])
        .filter((s) => s.season_number > 0)
        .sort((a, b) => a.season_number - b.season_number)
        .map((s) => [s.season_number, s.episode_count]),
    }
  } catch {
    idMap[tvdbId] = null
  }
  return idMap[tvdbId]
}

// Resolve a movie to a TMDB id by title (+ year hint) via search/multi. Movies
// in the export carry no external id, so this is a best-effort name match.
async function resolveMovie(name, year) {
  const key = `${name}|${year ?? ''}`
  if (movieMap[key] !== undefined) return movieMap[key] // cached (incl. null misses)
  try {
    const search = await getJson(
      `${PROXY_URL}/search/multi?query=${encodeURIComponent(name)}&include_adult=false`,
    )
    const results = (search.results ?? []).filter((r) => r.media_type === 'movie')
    if (results.length === 0) {
      movieMap[key] = null
      return null
    }
    const byYear = year && results.find((r) => (r.release_date || '').startsWith(year))
    const pick = byYear || results[0]
    movieMap[key] = {
      id: pick.id,
      name: pick.title || pick.original_title || name,
      poster_path: pick.poster_path ?? null,
      year: (pick.release_date || '').slice(0, 4) || year || null,
    }
  } catch {
    movieMap[key] = null
  }
  return movieMap[key]
}

async function pool(items, size, fn) {
  const queue = [...items]
  let done = 0
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (queue.length) {
        await fn(queue.shift())
        if (++done % 20 === 0) process.stdout.write(`\r   resolved ${done}/${items.length}…`)
      }
    }),
  )
  process.stdout.write(`\r   resolved ${items.length}/${items.length}   \n`)
}

// --- helpers ----------------------------------------------------------------

function firstNEpisodes(seasons, n) {
  const out = []
  for (const [season, count] of seasons ?? []) {
    for (let e = 1; e <= count && out.length < n; e++) out.push([season, e])
    if (out.length >= n) break
  }
  return out
}

function statusFor(seen, meta, followed) {
  if (seen <= 0) return followed ? 'watchlist' : null
  const ended = meta.status === 'Ended' || meta.status === 'Canceled'
  // TV Time's episode counts run slightly below TMDB's (specials, recaps, count
  // quirks), so treat an ended show that's ≥90% watched as finished.
  if (ended && meta.numberOfEpisodes && seen >= meta.numberOfEpisodes * 0.9) return 'completed'
  return 'watching'
}

// --- sign in ----------------------------------------------------------------

function ask(q, hidden = false) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  if (hidden) rl._writeToOutput = (s) => rl.output.write(s.includes(q) ? q : '')
  return new Promise((res) =>
    rl.question(q, (a) => {
      rl.close()
      if (hidden) process.stdout.write('\n')
      res(a)
    }),
  )
}

const email = env.TVTRACKER_EMAIL || (await ask('Your tracker email: '))
const password = env.TVTRACKER_PASSWORD || (await ask('Your tracker password: ', true))

const supabase = createClient(SUPABASE_URL, ANON_KEY)
const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
if (signInErr) {
  console.error('\nSign-in failed:', signInErr.message)
  process.exit(1)
}
console.log('✓ Signed in\n')

// --- optional reset ---------------------------------------------------------

if (RESET) {
  console.log('🧹 Clearing existing follows / episode_watches / movie_watches / ratings…')
  for (const t of ['episode_watches', 'movie_watches', 'follows', 'ratings']) {
    const { error } = await supabase.from(t).delete().gte('id', 0)
    if (error) throw new Error(`reset ${t}: ${error.message}`)
  }
}

// --- resolve TMDB metadata --------------------------------------------------

console.log('🔗 Resolving shows on TMDB (id + episode structure)…')
await pool([...shows.values()], 8, (s) => resolveShow(s.tvdbId, s.name))
fs.writeFileSync(mapPath, JSON.stringify(idMap, null, 2))

if (allMovies.length) {
  console.log('🎬 Resolving movies on TMDB (by title + year)…')
  await pool(allMovies, 8, (m) => resolveMovie(m.name, m.year))
  fs.writeFileSync(movieMapPath, JSON.stringify(movieMap, null, 2))
}

// --- build rows -------------------------------------------------------------

const titleRows = []
const followRows = []
const episodeRows = []
const ratingRows = []
const movieWatchRows = []
let mapped = 0
let skippedUnstarted = 0
let moviesMapped = 0
let moviesUnresolved = 0

for (const s of shows.values()) {
  const meta = idMap[s.tvdbId]
  if (!meta) continue
  const status = statusFor(s.seen, meta, s.followed)
  if (!status) {
    skippedUnstarted++
    continue // not followed and never watched — nothing to import
  }
  mapped++

  titleRows.push({
    tmdb_id: meta.id,
    media_type: 'tv',
    name: meta.name,
    poster_path: meta.poster_path,
    release_year: meta.year ? Number(meta.year) : null,
  })
  followRows.push({
    tmdb_id: meta.id,
    media_type: 'tv',
    status,
    name: meta.name,
    poster_path: meta.poster_path,
    updated_at: new Date().toISOString(),
  })

  const fallbackDate =
    latestByName.get(s.name) || followedCreated.get(s.tvdbId) || new Date().toISOString()
  for (const [season, episode] of firstNEpisodes(meta.seasons, s.seen)) {
    episodeRows.push({
      tmdb_show_id: meta.id,
      season_number: season,
      episode_number: episode,
      watched_at: dateByEp.get(`${s.name}|${season}|${episode}`) || fallbackDate,
    })
  }

  const score = ratingByTvdb.get(s.tvdbId)
  if (score) ratingRows.push({ tmdb_id: meta.id, media_type: 'tv', score })
}

console.log(`   ${mapped} shows mapped, ${skippedUnstarted} unstarted skipped`)

for (const m of allMovies) {
  const meta = movieMap[`${m.name}|${m.year ?? ''}`]
  if (!meta) {
    moviesUnresolved++
    continue
  }
  moviesMapped++

  titleRows.push({
    tmdb_id: meta.id,
    media_type: 'movie',
    name: meta.name,
    poster_path: meta.poster_path,
    release_year: meta.year ? Number(meta.year) : null,
  })
  followRows.push({
    tmdb_id: meta.id,
    media_type: 'movie',
    status: m.watched ? 'completed' : 'watchlist',
    name: meta.name,
    poster_path: meta.poster_path,
    updated_at: new Date().toISOString(),
  })
  if (m.watched) {
    movieWatchRows.push({
      tmdb_movie_id: meta.id,
      watched_at: m.watchedAt || new Date().toISOString(),
    })
  }
}

console.log(`   ${moviesMapped} movies mapped, ${moviesUnresolved} unresolved\n`)

// --- upsert -----------------------------------------------------------------

// Multiple TheTVDB shows can resolve to the same TMDB id (esp. via the name
// fallback), which would make a batch hit the same conflict key twice. Collapse
// duplicates first (last one wins).
function dedupe(rows, keyFn) {
  const m = new Map()
  for (const r of rows) m.set(keyFn(r), r)
  return [...m.values()]
}
const byTitle = (r) => `${r.tmdb_id}:${r.media_type}`
const byEpisode = (r) => `${r.tmdb_show_id}:${r.season_number}:${r.episode_number}`

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function upsertAll(table, rows, onConflict) {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500)
    // Retry transient network failures with backoff (upsert is idempotent).
    let error
    for (let attempt = 1; attempt <= 5; attempt++) {
      ;({ error } = await supabase.from(table).upsert(chunk, { onConflict }))
      if (!error) break
      process.stdout.write(`\r   ${table}: retry ${attempt} (${error.message})   `)
      await sleep(800 * attempt)
    }
    if (error) throw new Error(`${table}: ${error.message}`)
    process.stdout.write(`\r   ${table}: ${Math.min(i + 500, rows.length)}/${rows.length}          `)
  }
  process.stdout.write(`\r   ${table}: ${rows.length}/${rows.length} ✓          \n`)
}

console.log('⬆️  Writing to your tracker…')
await upsertAll('titles', dedupe(titleRows, byTitle), 'tmdb_id,media_type')
await upsertAll('follows', dedupe(followRows, byTitle), 'user_id,tmdb_id,media_type')
await upsertAll('episode_watches', dedupe(episodeRows, byEpisode), 'user_id,tmdb_show_id,season_number,episode_number')
if (ratingRows.length) await upsertAll('ratings', dedupe(ratingRows, byTitle), 'user_id,tmdb_id,media_type')

// movie_watches has no unique key, so upsert can't dedupe. Collapse to one row
// per movie, clear any prior imports for those ids, then insert — idempotent.
if (movieWatchRows.length) {
  const uniqueWatches = dedupe(movieWatchRows, (r) => r.tmdb_movie_id)
  const ids = uniqueWatches.map((r) => r.tmdb_movie_id)
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await supabase
      .from('movie_watches')
      .delete()
      .in('tmdb_movie_id', ids.slice(i, i + 200))
    if (error) throw new Error(`movie_watches clear: ${error.message}`)
  }
  for (let i = 0; i < uniqueWatches.length; i += 500) {
    const { error } = await supabase.from('movie_watches').insert(uniqueWatches.slice(i, i + 500))
    if (error) throw new Error(`movie_watches: ${error.message}`)
    process.stdout.write(
      `\r   movie_watches: ${Math.min(i + 500, uniqueWatches.length)}/${uniqueWatches.length}          `,
    )
  }
  process.stdout.write(`\r   movie_watches: ${uniqueWatches.length}/${uniqueWatches.length} ✓          \n`)
}

const tvFollows = followRows.filter((f) => f.media_type === 'tv')
const movieFollows = followRows.filter((f) => f.media_type === 'movie')
const by = (rows, s) => rows.filter((f) => f.status === s).length
console.log('\n✅ Import complete!')
console.log(
  `   ${tvFollows.length} shows  (${by(tvFollows, 'watching')} watching · ${by(tvFollows, 'completed')} completed · ${by(tvFollows, 'watchlist')} watchlist)`,
)
console.log(
  `   ${movieFollows.length} movies (${by(movieFollows, 'completed')} watched · ${by(movieFollows, 'watchlist')} watchlist)`,
)
console.log(`   ${episodeRows.length} episodes · ${movieWatchRows.length} movie watches · ${ratingRows.length} ratings`)
process.exit(0)
