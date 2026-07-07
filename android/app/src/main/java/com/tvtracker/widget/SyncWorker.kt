package com.tvtracker.widget

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.concurrent.TimeUnit

/**
 * Rebuilds the widget's up-next list: reads the user's watching shows and
 * episode watches from Supabase, show structure from the tmdb-proxy, computes
 * each show's next unwatched aired episode (same logic as the PWA's Up Next
 * rail), caches poster thumbnails, and refreshes every widget instance.
 */
class SyncWorker(context: Context, params: WorkerParameters) : Worker(context, params) {

    override fun doWork(): Result {
        val ctx = applicationContext
        val prefs = Prefs(ctx)
        if (!prefs.isSignedIn) {
            // Nothing to sync; make sure the widget shows its sign-in hint.
            UpNextWidgetProvider.pushUpdate(ctx)
            return Result.success()
        }
        return try {
            sync(ctx, prefs)
            Result.success()
        } catch (e: Exception) {
            if (runAttemptCount < 3) Result.retry() else Result.failure()
        }
    }

    private fun sync(ctx: Context, prefs: Prefs) {
        // 1. Shows currently being watched (cap keeps TMDB calls bounded).
        val follows = SupabaseApi.restGet(
            prefs,
            "follows?select=tmdb_id,name,poster_path,updated_at" +
                "&media_type=eq.tv&status=eq.watching&order=updated_at.desc&limit=$MAX_SHOWS",
        )
        if (follows.length() == 0) {
            UpNextStore.save(ctx, emptyList())
            UpNextStore.prunePosters(ctx, emptySet())
            prefs.lastSyncAt = System.currentTimeMillis()
            UpNextWidgetProvider.pushUpdate(ctx)
            return
        }

        // 2. Episode watches for just those shows -> watched sets + last-watch times.
        val showIds = (0 until follows.length()).map { follows.getJSONObject(it).getInt("tmdb_id") }
        val watchesByShow = HashMap<Int, MutableSet<String>>()
        val lastWatchedByShow = HashMap<Int, Long>()
        val watches = SupabaseApi.restGetAll(
            prefs,
            "episode_watches?select=tmdb_show_id,season_number,episode_number,watched_at" +
                "&tmdb_show_id=in.(${showIds.joinToString(",")})&order=id.asc",
        )
        for (i in 0 until watches.length()) {
            val w = watches.getJSONObject(i)
            val id = w.getInt("tmdb_show_id")
            watchesByShow.getOrPut(id) { HashSet() }
                .add("S${w.getInt("season_number")}E${w.getInt("episode_number")}")
            parseTimestamp(w.optString("watched_at"))?.let { t ->
                if (t > (lastWatchedByShow[id] ?: 0L)) lastWatchedByShow[id] = t
            }
        }

        // 3. Per show: fetch structure, compute next-up, score for ordering.
        val now = System.currentTimeMillis()
        val scored = ArrayList<Pair<UpNextItem, Long>>()
        for (i in 0 until follows.length()) {
            val f = follows.getJSONObject(i)
            val showId = f.getInt("tmdb_id")
            val detail = try {
                SupabaseApi.tmdb(prefs, "tv/$showId")
            } catch (_: Exception) {
                continue // one flaky show shouldn't sink the whole sync
            }

            val last = detail.optJSONObject("last_episode_to_air") ?: continue
            val seasons = detail.optJSONArray("seasons")
            val counts = HashMap<Int, Int>()
            if (seasons != null) for (j in 0 until seasons.length()) {
                val s = seasons.getJSONObject(j)
                val n = s.optInt("season_number", 0)
                if (n > 0) counts[n] = s.optInt("episode_count", 0)
            }
            val next = NextUp.compute(
                counts,
                last.optInt("season_number", 0),
                last.optInt("episode_number", 0),
                watchesByShow[showId] ?: emptySet(),
            ) ?: continue // caught up — hide, like the PWA

            val episodeName = fetchEpisodeName(prefs, showId, next.season, next.episode)

            // Recency score, mirroring the PWA: the most recent of the follow's
            // updated_at, your last watch, and a new episode aired this week.
            var score = parseTimestamp(f.optString("updated_at")) ?: 0L
            lastWatchedByShow[showId]?.let { if (it > score) score = it }
            parseDate(last.optString("air_date"))?.let { air ->
                if (air <= now && now - air <= WEEK_MS && air > score) score = air
            }

            val posterPath = f.optString("poster_path", "").ifEmpty {
                detail.optString("poster_path", "")
            }.ifEmpty { null }
            posterPath?.let { cachePoster(ctx, showId, it) }

            scored.add(
                UpNextItem(
                    showId = showId,
                    name = f.optString("name", "").ifEmpty { detail.optString("name", "Untitled") },
                    posterPath = posterPath,
                    season = next.season,
                    episode = next.episode,
                    episodeName = episodeName,
                    done = next.done,
                    total = next.total,
                ) to score,
            )
        }

        val items = scored.sortedByDescending { it.second }.map { it.first }
        UpNextStore.save(ctx, items)
        UpNextStore.prunePosters(ctx, items.map { it.showId }.toSet())
        prefs.lastSyncAt = System.currentTimeMillis()
        UpNextWidgetProvider.pushUpdate(ctx)
    }

    /** The next episode's title, for a richer row. Best-effort — null on any failure. */
    private fun fetchEpisodeName(prefs: Prefs, showId: Int, season: Int, episode: Int): String? {
        return try {
            val data = SupabaseApi.tmdb(prefs, "tv/$showId/season/$season")
            val eps = data.optJSONArray("episodes") ?: return null
            for (i in 0 until eps.length()) {
                val e = eps.getJSONObject(i)
                if (e.optInt("episode_number") == episode) {
                    return e.optString("name", "").ifEmpty { null }
                }
            }
            null
        } catch (_: Exception) {
            null
        }
    }

    private fun cachePoster(ctx: Context, showId: Int, posterPath: String) {
        val file = UpNextStore.posterFile(ctx, showId)
        if (file.exists() && file.length() > 0) return
        try {
            file.writeBytes(SupabaseApi.fetchImage(posterPath))
        } catch (_: Exception) {
            file.delete() // don't leave truncated files behind
        }
    }

    private fun parseTimestamp(value: String?): Long? {
        if (value.isNullOrEmpty()) return null
        return try {
            OffsetDateTime.parse(value).toInstant().toEpochMilli()
        } catch (_: Exception) {
            null
        }
    }

    private fun parseDate(value: String?): Long? {
        if (value.isNullOrEmpty()) return null
        return try {
            LocalDate.parse(value).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
        } catch (_: Exception) {
            null
        }
    }

    companion object {
        private const val MAX_SHOWS = 30
        private const val WEEK_MS = 7L * 24 * 60 * 60 * 1000
        private const val PERIODIC_WORK = "tvtracker-sync"
        private const val ONE_SHOT_WORK = "tvtracker-sync-now"

        private val onlineConstraint =
            Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

        /** Refresh in the background a few times a day (WorkManager min interval is 15 min). */
        fun schedulePeriodic(context: Context) {
            val request = PeriodicWorkRequestBuilder<SyncWorker>(6, TimeUnit.HOURS)
                .setConstraints(onlineConstraint)
                .build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                PERIODIC_WORK, ExistingPeriodicWorkPolicy.KEEP, request,
            )
        }

        fun syncNow(context: Context) {
            val request = OneTimeWorkRequestBuilder<SyncWorker>()
                .setConstraints(onlineConstraint)
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(
                ONE_SHOT_WORK, ExistingWorkPolicy.REPLACE, request,
            )
        }

        fun cancelAll(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(PERIODIC_WORK)
        }
    }
}
