package com.tvtracker.widget

import android.content.Context
import androidx.work.Data
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import org.json.JSONObject

/**
 * Logs one episode watch from a widget ✓ tap, mirroring the PWA's
 * useToggleEpisode: upsert the shared `titles` metadata cache, upsert the
 * `episode_watches` row (idempotent — safe on double-tap), then re-sync so the
 * widget advances to the following episode.
 */
class MarkWatchedWorker(context: Context, params: WorkerParameters) : Worker(context, params) {

    override fun doWork(): Result {
        val prefs = Prefs(applicationContext)
        if (!prefs.isSignedIn) return Result.failure()

        val showId = inputData.getInt(KEY_SHOW_ID, 0)
        val season = inputData.getInt(KEY_SEASON, 0)
        val episode = inputData.getInt(KEY_EPISODE, 0)
        if (showId == 0 || season == 0 || episode == 0) return Result.failure()

        return try {
            val name = inputData.getString(KEY_NAME)
            val poster = inputData.getString(KEY_POSTER)
            if (!name.isNullOrEmpty()) {
                SupabaseApi.restUpsert(
                    prefs, "titles", "tmdb_id,media_type",
                    JSONObject()
                        .put("tmdb_id", showId)
                        .put("media_type", "tv")
                        .put("name", name)
                        .put("poster_path", poster ?: JSONObject.NULL),
                )
            }
            SupabaseApi.restUpsert(
                prefs, "episode_watches",
                "user_id,tmdb_show_id,season_number,episode_number",
                JSONObject()
                    .put("tmdb_show_id", showId)
                    .put("season_number", season)
                    .put("episode_number", episode),
            )
            SyncWorker.syncNow(applicationContext)
            Result.success()
        } catch (e: Exception) {
            if (runAttemptCount < 3) Result.retry() else Result.failure()
        }
    }

    companion object {
        const val KEY_SHOW_ID = "show_id"
        const val KEY_SEASON = "season"
        const val KEY_EPISODE = "episode"
        const val KEY_NAME = "name"
        const val KEY_POSTER = "poster"

        fun enqueue(
            context: Context,
            showId: Int,
            season: Int,
            episode: Int,
            name: String?,
            poster: String?,
        ) {
            val data = Data.Builder()
                .putInt(KEY_SHOW_ID, showId)
                .putInt(KEY_SEASON, season)
                .putInt(KEY_EPISODE, episode)
                .putString(KEY_NAME, name)
                .putString(KEY_POSTER, poster)
                .build()
            WorkManager.getInstance(context).enqueue(
                OneTimeWorkRequestBuilder<MarkWatchedWorker>().setInputData(data).build(),
            )
        }
    }
}
