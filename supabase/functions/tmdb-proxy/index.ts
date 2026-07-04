// tmdb-proxy — a thin, allowlisted proxy in front of the TMDB API.
//
// Why this exists:
//  * The TMDB key must NEVER ship to the browser. It lives here as a secret.
//  * We only expose the handful of read endpoints the app needs.
//  * Responses are cached at the edge to stay well under TMDB's rate limits.
//
// Deploy:  supabase functions deploy tmdb-proxy
// Secret:  supabase secrets set TMDB_API_KEY=<your v4 read access token OR v3 key>
//
// Set TMDB_API_KEY to either a TMDB v4 "API Read Access Token" (recommended —
// sent as a Bearer token) or a legacy v3 API key. This function auto-detects
// which one you gave it.

const TMDB_BASE = 'https://api.themoviedb.org/3'
const TMDB_KEY = Deno.env.get('TMDB_API_KEY') ?? ''

// Only these paths may be called, each with a small set of allowed query params.
// `:id` is a numeric placeholder.
const ROUTES: { pattern: RegExp; params: string[] }[] = [
  { pattern: /^search\/multi$/, params: ['query', 'page', 'include_adult'] },
  { pattern: /^movie\/\d+$/, params: ['append_to_response'] },
  { pattern: /^tv\/\d+$/, params: ['append_to_response'] },
  { pattern: /^tv\/\d+\/season\/\d+$/, params: [] },
  { pattern: /^trending\/(all|movie|tv)\/(day|week)$/, params: ['page'] },
  // Convert an external id (e.g. TheTVDB) to a TMDB id — used by the importer.
  { pattern: /^find\/[^/]+$/, params: ['external_source'] },
]

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...CORS, ...extraHeaders },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'GET') return json({ error: 'method not allowed' }, 405)
  if (!TMDB_KEY) return json({ error: 'TMDB_API_KEY not configured on the server' }, 500)

  const url = new URL(req.url)
  // Everything after `.../tmdb-proxy/` is the TMDB path we forward.
  const path = url.pathname.replace(/^.*\/tmdb-proxy\/?/, '').replace(/^\/+/, '')

  const route = ROUTES.find((r) => r.pattern.test(path))
  if (!route) return json({ error: `path not allowed: ${path}` }, 400)

  // Build the upstream URL, copying only allowlisted params.
  const upstream = new URL(`${TMDB_BASE}/${path}`)
  for (const key of route.params) {
    const value = url.searchParams.get(key)
    if (value !== null) upstream.searchParams.set(key, value)
  }

  // v4 read tokens are long JWTs (contain dots); v3 keys are short hex strings.
  const isV4 = TMDB_KEY.includes('.')
  const headers: Record<string, string> = { accept: 'application/json' }
  if (isV4) headers.authorization = `Bearer ${TMDB_KEY}`
  else upstream.searchParams.set('api_key', TMDB_KEY)

  const tmdbRes = await fetch(upstream, { headers })
  const data = await tmdbRes.json().catch(() => ({ error: 'bad upstream response' }))

  // Cache successful reads at the edge/CDN for 1 hour (metadata rarely changes).
  const cache = tmdbRes.ok ? { 'cache-control': 'public, max-age=3600' } : {}
  return json(data, tmdbRes.status, cache)
})
