# TV Tracker

A personal, self-owned **TV & movie tracker** — a free replacement for TV Time (which shuts down July 15, 2026). It's an installable **PWA**: open it in Chrome on Android, "Add to Home screen," and it behaves like an app (full-screen, offline, home-screen icon). $0 to build, host, and run.

- **App:** Vite + React + TypeScript, Tailwind v4, TanStack Query, `vite-plugin-pwa`
- **Metadata:** TMDB, via a server-side proxy (your key never ships to the browser)
- **Your data (watchlist / watches / ratings):** Supabase Postgres + Auth, protected by Row-Level Security

## What works today (MVP)

- 🔍 Search movies & TV (debounced)
- 📄 Detail screen: poster, overview, cast, seasons/episodes
- ➕ Track a title (watchlist → watching → completed) and remove
- 👁 Mark a **movie** watched; toggle individual **episodes** watched
- 🏠 Home shelves: *Watching* and *Watchlist*
- 🔐 Email + password sign-in
- 📲 Installable + offline shell + cached posters

Roadmap (see [the plan](../../.claude/plans)): "Up Next" episode feed, upcoming-episode calendar, stats, web-push reminders, and Trakt / TV Time import.

---

## Setup — do these in order (all free, ~15 min)

Follow the steps top to bottom. Do not skip ahead; each one builds on the last.
You'll gather two values along the way (`SUPABASE_URL`, `ANON_KEY`) and one
secret (`TMDB token`).

### Step 1 — Install the code

```bash
npm install
```

### Step 2 — Get your TMDB token (metadata source)

1. Go to https://www.themoviedb.org and create a free account.
2. Open **Settings → API** and request a key (choose "Developer", personal use).
3. Copy the **API Read Access Token** (the long v4 token). Keep it somewhere
   safe for Step 5. **Do not put it in `.env`** — it stays server-side.

### Step 3 — Create your Supabase project (database + login)

1. Go to https://supabase.com and create a free account, then a new project.
   Pick a database password and wait ~2 min for it to provision.
2. Open **Project Settings → API** and copy two values:
   - **Project URL** → this is your `SUPABASE_URL`
   - **anon public** key → this is your `ANON_KEY`

### Step 4 — Create the database tables

1. In your Supabase project, open the **SQL Editor**.
2. Open the file [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql)
   from this repo, copy its entire contents, paste into the SQL Editor, and
   click **Run**. You should see "Success". (This creates the tables and the
   security rules that keep your data private.)

### Step 5 — Deploy the TMDB proxy (hides your token)

Install the Supabase CLI and connect it to your project, then deploy:

```bash
npm i -g supabase
supabase login
supabase link --project-ref <your-project-ref>   # ref is in your project URL / dashboard

supabase functions deploy tmdb-proxy
supabase secrets set TMDB_API_KEY=<paste the TMDB token from Step 2>
```

### Step 6 — Point the app at your project

Create your local env file and paste in the two values from Step 3:

```bash
cp .env.example .env
```

Edit `.env`:

```
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

(The app figures out the proxy URL automatically from `VITE_SUPABASE_URL`.)

### Step 7 — Run it locally

```bash
npm run dev
```

Open **http://localhost:5173**. First create your account: in Supabase,
**Authentication → Users → Add user**, enter your email + a password and tick
**Auto Confirm User**. Then on the **Profile** tab sign in with that email and
password. Now **Search** a show → open it → **+ Track** and mark an episode
watched.

> Sign-in uses email + password (no confirmation emails), so there are no email
> rate limits to worry about.

You now have a fully working app on your computer. The steps below put it on
your phone.

---

## Put it on your phone (free)

### Step 8 — Deploy to Cloudflare Pages

1. Push this repo to GitHub.
2. At https://pages.cloudflare.com, create a project and connect that repo.
3. Set **Build command** = `npm run build`, **Output directory** = `dist`.
4. Under the project's **Settings → Environment variables**, add the same two
   values from Step 6: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
5. Deploy. You'll get a URL like `https://tvtracker.pages.dev`.
6. Back in Supabase **Authentication → URL Configuration**, add your Pages URL.

Deep links (refreshing on a `/title/...` page) already work — this repo ships
the SPA fallback config for you: `public/_redirects` (Cloudflare Pages &
Netlify) and `vercel.json` (Vercel). Nothing to add.

**On Vercel instead?** Same flow: import the repo, framework preset auto-detects
"Vite", output `dist`, add the two `VITE_*` env vars, deploy. `vercel.json`
handles routing. Note Vercel's Hobby (free) plan is **non-commercial/personal
use only** — fine for a private tracker. Cloudflare Pages has no such
restriction, which is why it's the default recommendation.

### Step 9 — Install to your home screen

On your Android phone, open the Pages URL in **Chrome → ⋮ menu → Add to Home
screen**. It now launches full-screen like a native app.

> Optional, later: wrap it as a real Play Store app with Bubblewrap/TWA. The $25
> Play Store fee is one-time and entirely optional — the home-screen install
> above is free.

---

## Import your TV Time data

Migrate your TV Time history (shows, watched episodes, ratings) from a GDPR
export. Request the export in TV Time (Settings → account/privacy) and unzip it.

1. **Redeploy the proxy** (adds the id-conversion endpoint the importer needs):

   ```bash
   supabase functions deploy tmdb-proxy
   ```

2. **Dry run** to preview what will be imported (writes nothing):

   ```bash
   node scripts/import-tvtime.mjs /path/to/gdpr-data --dry-run
   ```

3. **Run it** — signs in as your account and upserts everything:

   ```bash
   node scripts/import-tvtime.mjs /path/to/gdpr-data          # first time
   node scripts/import-tvtime.mjs /path/to/gdpr-data --reset  # wipe & re-import
   ```

   Use `--reset` to clear your existing follows/episode_watches/ratings first —
   handy if a previous import left inaccurate data. It reads `VITE_SUPABASE_URL`
   / `VITE_SUPABASE_ANON_KEY` from `.env`, prompts for your tracker email +
   password, and writes `follows`, `episode_watches`, and `ratings`. It's
   **idempotent** and caches TMDB lookups to `tmdb-id-map.json` in the export
   folder (delete that file to force a fresh re-fetch).

   **How progress is reconstructed:** TV Time's export doesn't contain a
   complete per-episode watch list (only ~40% of episodes appear as rows) and
   has no explicit status. The reliable signal is `nb_episodes_seen` — a count
   per show. So the importer marks the **first N episodes** of each show watched
   (N = that count, in TMDB order) and derives status by comparing N to the
   show's real episode count (ended + all seen → *completed*; otherwise
   *watching*; nothing seen → *watchlist*). This assumes you watched roughly in
   order, which is accurate for the vast majority of shows; a show you watched
   out of order may mark slightly different episodes (the total will match).

   > Movies aren't imported — the export only identifies them by name, with no
   > reliable id to match against TMDB.

## Episode reminders (Web Push) — optional

Get a push notification when a show you follow airs a new episode. This is
opt-in and needs a few one-time setup steps.

1. **Generate VAPID keys** (a keypair that authorizes your push messages):

   ```bash
   npx web-push generate-vapid-keys
   ```

   Copy the **Public Key** and **Private Key**.

2. **Add the public key to the app** (`.env`, and your host's env vars for prod):

   ```
   VITE_VAPID_PUBLIC_KEY=<the public key>
   ```

3. **Create the subscriptions table** — run
   [`supabase/migrations/0003_push_subscriptions.sql`](supabase/migrations/0003_push_subscriptions.sql)
   in the Supabase SQL Editor (same as Step 4 above).

4. **Deploy the reminder function and set its secrets**:

   ```bash
   supabase functions deploy send-reminders
   supabase secrets set \
     VAPID_PUBLIC_KEY=<public key> \
     VAPID_PRIVATE_KEY=<private key> \
     VAPID_SUBJECT=mailto:you@example.com
   ```

   (`TMDB_API_KEY` is already set from the proxy step; `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.)

5. **Schedule it daily.** In the Supabase SQL Editor, enable the extensions and
   add a cron job (runs at 17:00 UTC here — pick a time that suits you). Replace
   `<PROJECT_REF>` and `<SERVICE_ROLE_KEY>`:

   ```sql
   create extension if not exists pg_cron;
   create extension if not exists pg_net;

   select cron.schedule(
     'daily-episode-reminders',
     '0 17 * * *',
     $$
     select net.http_post(
       url     := 'https://<PROJECT_REF>.functions.supabase.co/send-reminders',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
       )
     );
     $$
   );
   ```

6. **Turn it on.** Open the app → **Profile** → **Episode reminders → Enable**,
   and accept the browser permission prompt.

> **Platform note:** Web Push needs a supporting browser. On **iOS** it only
> works when the app is **installed to the Home Screen** (iOS 16.4+). To test a
> send immediately, hit the function URL with `?date=YYYY-MM-DD` set to a day a
> followed show actually airs.

## Project layout

```
src/
  lib/
    tmdb.ts        TMDB proxy client (normalized shapes)
    supabase.ts    Supabase client (null-safe if unconfigured)
    auth.tsx       AuthProvider + useAuth (email + password)
    tracking.ts    follows / episode+movie watches / ratings hooks
    types.ts       shared types
    queryClient.ts TanStack Query config
  components/       Layout (bottom nav), Poster
  pages/            Home, Search, TitleDetail, Profile
supabase/
  migrations/0001_init.sql     schema + Row-Level Security
  functions/tmdb-proxy/        allowlisted TMDB proxy (Deno)
  config.toml
```

## Notes

- **Personal / non-commercial use only.** Commercial use of TMDB requires a
  separate agreement with TMDB.
- The Supabase free project **pauses after ~1 week idle** — one click to resume.
- Without Supabase configured, search/browse still work; tracking is disabled.
