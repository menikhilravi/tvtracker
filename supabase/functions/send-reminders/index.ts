// send-reminders — a daily job that pushes "new episode today" reminders.
//
// Flow:
//  1. Read every actively-watched TV follow across users (service role).
//  2. For each distinct show, ask TMDB whether its next episode airs today.
//  3. Push a notification to each subscriber who follows a show airing today.
//  4. Prune push subscriptions TMDB/the push service reports as gone (404/410).
//
// Deploy:   supabase functions deploy send-reminders
// Secrets:  VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (TMDB_API_KEY is
//           already set for tmdb-proxy; SUPABASE_URL / SERVICE_ROLE are injected)
// Schedule: invoke daily via pg_cron (see README).
import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2.45.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:noreply@tvtracker.app'
const TMDB_KEY = Deno.env.get('TMDB_API_KEY') ?? ''
const TMDB_BASE = 'https://api.themoviedb.org/3'

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
const admin = createClient(SUPABASE_URL, SERVICE_ROLE)

interface NextEp {
  name: string
  airDate: string | null
  season: number | null
  episode: number | null
  epName: string | null
}

interface Sub {
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
}

async function fetchNextEpisode(showId: number): Promise<NextEp | null> {
  const url = new URL(`${TMDB_BASE}/tv/${showId}`)
  const headers: Record<string, string> = { accept: 'application/json' }
  if (TMDB_KEY.includes('.')) headers.authorization = `Bearer ${TMDB_KEY}`
  else url.searchParams.set('api_key', TMDB_KEY)

  const res = await fetch(url, { headers })
  if (!res.ok) return null
  const j = await res.json()
  const n = j.next_episode_to_air
  return {
    name: j.name ?? 'Your show',
    airDate: n?.air_date ?? null,
    season: n?.season_number ?? null,
    episode: n?.episode_number ?? null,
    epName: n?.name ?? null,
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

Deno.serve(async (req) => {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return json({ error: 'VAPID keys not configured' }, 500)

  // Allow ?date=YYYY-MM-DD to test a specific day; default to today (UTC).
  const today = new URL(req.url).searchParams.get('date') ?? new Date().toISOString().slice(0, 10)

  const { data: follows, error: fErr } = await admin
    .from('follows')
    .select('user_id, tmdb_id, name')
    .eq('media_type', 'tv')
    .eq('status', 'watching')
  if (fErr) return json({ error: fErr.message }, 500)

  const showIds = [...new Set((follows ?? []).map((f) => f.tmdb_id))]

  // Which shows air a new episode today?
  const airing = new Map<number, NextEp>()
  for (const id of showIds) {
    const next = await fetchNextEpisode(id)
    if (next?.airDate === today) airing.set(id, next)
  }
  if (airing.size === 0) return json({ checked: showIds.length, airing: 0, sent: 0 })

  const { data: subs, error: sErr } = await admin
    .from('push_subscriptions')
    .select('user_id, endpoint, p256dh, auth')
  if (sErr) return json({ error: sErr.message }, 500)

  const subsByUser = new Map<string, Sub[]>()
  for (const s of (subs ?? []) as Sub[]) {
    const list = subsByUser.get(s.user_id) ?? []
    list.push(s)
    subsByUser.set(s.user_id, list)
  }

  let sent = 0
  const expired: string[] = []
  for (const f of follows ?? []) {
    const next = airing.get(f.tmdb_id)
    const userSubs = subsByUser.get(f.user_id)
    if (!next || !userSubs) continue

    const payload = JSON.stringify({
      title: next.name,
      body: `New episode today — S${next.season} · E${next.episode}${next.epName ? `: ${next.epName}` : ''}`,
      url: `/title/tv/${f.tmdb_id}`,
    })
    for (const s of userSubs) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        )
        sent++
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode
        if (code === 404 || code === 410) expired.push(s.endpoint)
      }
    }
  }
  if (expired.length) await admin.from('push_subscriptions').delete().in('endpoint', expired)

  return json({ checked: showIds.length, airing: airing.size, sent, pruned: expired.length })
})
