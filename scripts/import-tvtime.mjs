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

console.log('\n📦 Parsed TV Time export:')
console.log(`   Shows:                 ${shows.size}`)
console.log(`   Episodes watched (Σ):  ${totalSeen}`)
console.log(`   Show ratings:          ${ratingByTvdb.size}`)

if (DRY_RUN) {
  console.log('\n(dry run — nothing written; statuses/episodes are computed live during a real run)')
  const sample = [...shows.values()]
    .sort((a, b) => b.seen - a.seen)
    .slice(0, 10)
    .map((s) => `   • ${s.name} — ${s.seen} seen${s.followed ? '' : ' (not followed)'}`)
  console.log('\nMost-watched shows:\n' + sample.join('\n'))
  process.exit(0)
}

// --- TMDB lookup (id + episode structure), cached ---------------------------

if (!PROXY_URL || !ANON_KEY) {
  console.error('\nMissing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env')
  process.exit(1)
}

const mapPath = path.join(exportDir, 'tmdb-id-map.json')
const idMap = fs.existsSync(mapPath) ? JSON.parse(fs.readFileSync(mapPath, 'utf8')) : {}
const authHeaders = { apikey: ANON_KEY, authorization: `Bearer ${ANON_KEY}` }

async function resolveShow(tvdbId) {
  if (idMap[tvdbId] !== undefined) return idMap[tvdbId]
  try {
    const find = await (
      await fetch(`${PROXY_URL}/find/${tvdbId}?external_source=tvdb_id`, { headers: authHeaders })
    ).json()
    const hit = find.tv_results?.[0]
    if (!hit) {
      idMap[tvdbId] = null
      return null
    }
    const detail = await (await fetch(`${PROXY_URL}/tv/${hit.id}`, { headers: authHeaders })).json()
    idMap[tvdbId] = {
      id: hit.id,
      name: detail.name ?? hit.name,
      poster_path: detail.poster_path ?? hit.poster_path ?? null,
      year: (detail.first_air_date || hit.first_air_date || '').slice(0, 4) || null,
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
  for (const [season, count] of seasons) {
    for (let e = 1; e <= count && out.length < n; e++) out.push([season, e])
    if (out.length >= n) break
  }
  return out
}

function statusFor(seen, meta, followed) {
  if (seen <= 0) return followed ? 'watchlist' : null
  const ended = meta.status === 'Ended' || meta.status === 'Canceled'
  if (ended && meta.numberOfEpisodes && seen >= meta.numberOfEpisodes - 1) return 'completed'
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
  console.log('🧹 Clearing existing follows / episode_watches / ratings…')
  for (const t of ['episode_watches', 'follows', 'ratings']) {
    const { error } = await supabase.from(t).delete().gte('id', 0)
    if (error) throw new Error(`reset ${t}: ${error.message}`)
  }
}

// --- resolve TMDB metadata --------------------------------------------------

console.log('🔗 Resolving shows on TMDB (id + episode structure)…')
await pool([...shows.keys()], 8, resolveShow)
fs.writeFileSync(mapPath, JSON.stringify(idMap, null, 2))

// --- build rows -------------------------------------------------------------

const titleRows = []
const followRows = []
const episodeRows = []
const ratingRows = []
let mapped = 0
let skippedUnstarted = 0

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

console.log(`   ${mapped} shows mapped, ${skippedUnstarted} unstarted skipped\n`)

// --- upsert -----------------------------------------------------------------

async function upsertAll(table, rows, onConflict) {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500)
    const { error } = await supabase.from(table).upsert(chunk, { onConflict })
    if (error) throw new Error(`${table}: ${error.message}`)
    process.stdout.write(`\r   ${table}: ${Math.min(i + 500, rows.length)}/${rows.length}`)
  }
  process.stdout.write(`\r   ${table}: ${rows.length}/${rows.length} ✓\n`)
}

console.log('⬆️  Writing to your tracker…')
await upsertAll('titles', titleRows, 'tmdb_id,media_type')
await upsertAll('follows', followRows, 'user_id,tmdb_id,media_type')
await upsertAll('episode_watches', episodeRows, 'user_id,tmdb_show_id,season_number,episode_number')
if (ratingRows.length) await upsertAll('ratings', ratingRows, 'user_id,tmdb_id,media_type')

const completed = followRows.filter((f) => f.status === 'completed').length
const watching = followRows.filter((f) => f.status === 'watching').length
const watchlist = followRows.filter((f) => f.status === 'watchlist').length
console.log('\n✅ Import complete!')
console.log(`   ${followRows.length} shows  (${watching} watching · ${completed} completed · ${watchlist} watchlist)`)
console.log(`   ${episodeRows.length} episodes · ${ratingRows.length} ratings`)
process.exit(0)
