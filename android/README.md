# TV Tracker — Android "Up next" widget

A tiny native Android companion app whose only job is a **home-screen widget**:
your next unwatched episode for every show you're watching, with a ✓ button to
log the watch right from the home screen.

Why a separate app? TV Tracker itself is a PWA, and Android doesn't let PWAs
provide home-screen widgets — widgets must come from a native app. This app is
deliberately minimal (no Play Store, no analytics, ~zero dependencies): it
talks to the **same Supabase project** as the web app, so everything stays in
sync — an episode marked watched on the widget shows up in the PWA instantly,
and vice versa.

## What the widget shows

- One row per show you're currently **watching**, ordered like the PWA's
  *Up next* rail (most recently watched / newly-aired first)
- Poster, show name, next episode (`S2 · E5 — Episode title`), and an
  aired-episodes progress bar
- **Tap a row** → opens that episode in the web app (deep link)
- **Tap ✓** → marks the episode watched and advances to the next one
- **Tap ↻** → refresh now (it also auto-syncs every ~6 hours)

## Get the APK

Every push touching `android/` runs the **“Android widget APK”** GitHub Actions
workflow. Open the run in the repo's *Actions* tab and download the
`tvtracker-widget-apk` artifact — inside is `app-debug.apk`.

Or build locally (needs the Android SDK; JDK 17+):

```bash
cd android
gradle assembleDebug   # or use Android Studio, or ./gradlew if you add a wrapper
# APK at app/build/outputs/apk/debug/app-debug.apk
```

## Install & set up (~2 min)

1. Copy `app-debug.apk` to your phone and open it (allow "install unknown
   apps" for your browser/file manager when prompted).
2. Open the **TV Tracker Widget** app and fill in:
   - **Supabase URL** and **anon key** — the same two values in the web app's
     `.env` (`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`)
   - **Web app URL** (optional) — where your PWA is deployed, e.g.
     `https://tvtracker-yours.vercel.app`; used to deep-link rows into the app
   - Your TV Tracker **email + password**, then **Sign in**
3. Long-press your home screen → **Widgets** → **TV Tracker Widget** → drag
   *Up next* onto the screen. Resize it as you like.

## How it works

```
android/app/src/main/java/com/tvtracker/widget/
├── MainActivity.kt         # sign-in / settings screen
├── Prefs.kt                # app-private storage (connection + session)
├── SupabaseApi.kt          # GoTrue auth, PostgREST tables, tmdb-proxy calls
├── SyncWorker.kt           # WorkManager job: fetch → compute up-next → cache
├── MarkWatchedWorker.kt    # logs an episode watch (mirrors useToggleEpisode)
├── UpNextStore.kt          # cached list + posters; port of computeNextUp
├── UpNextWidgetProvider.kt # the AppWidget itself
├── UpNextWidgetService.kt  # feeds rows into the widget ListView
└── ActionActivity.kt       # invisible trampoline for row taps
```

- Auth is plain Supabase email/password (GoTrue REST). The refresh token is
  stored app-privately and rotated on every refresh. Row-Level Security keeps
  data scoped to your account, exactly as in the PWA.
- Show structure comes from the **tmdb-proxy** Edge Function with the anon key
  — the TMDB key never touches the device.
- The sync computes each show's next unwatched *aired* episode with the same
  logic as `src/lib/tracking.ts` (`computeNextUp`/`airedProgress`) and caches
  the result + poster thumbnails locally, so the widget renders instantly and
  works offline.

## Notes

- The debug APK is signed with a debug key — fine for personal sideloading.
  Installing an updated build later is seamless as long as it's built with a
  debug key on the same machine (CI keys differ per run; if an update refuses
  to install, uninstall the old one first — you'll just need to sign in again).
- Battery/data impact is negligible: one small sync every ~6 h, images cached.
