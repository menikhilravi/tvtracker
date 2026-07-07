package com.tvtracker.widget

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/** One widget row: the next unwatched aired episode of a show being watched. */
data class UpNextItem(
    val showId: Int,
    val name: String,
    val posterPath: String?,
    val season: Int,
    val episode: Int,
    val episodeName: String?,
    val done: Int,
    val total: Int,
) {
    val subtitle: String
        get() = "S$season · E$episode" + (episodeName?.let { " — $it" } ?: "")

    fun toJson(): JSONObject = JSONObject()
        .put("showId", showId)
        .put("name", name)
        .put("posterPath", posterPath ?: JSONObject.NULL)
        .put("season", season)
        .put("episode", episode)
        .put("episodeName", episodeName ?: JSONObject.NULL)
        .put("done", done)
        .put("total", total)

    companion object {
        fun fromJson(o: JSONObject) = UpNextItem(
            showId = o.getInt("showId"),
            name = o.getString("name"),
            posterPath = if (o.isNull("posterPath")) null else o.getString("posterPath"),
            season = o.getInt("season"),
            episode = o.getInt("episode"),
            episodeName = if (o.isNull("episodeName")) null else o.getString("episodeName"),
            done = o.getInt("done"),
            total = o.getInt("total"),
        )
    }
}

/**
 * The widget's local cache: the computed up-next list plus poster thumbnails.
 * SyncWorker writes it; the RemoteViewsFactory reads it, so the widget renders
 * instantly and offline.
 */
object UpNextStore {

    private fun cacheFile(context: Context) = File(context.filesDir, "upnext.json")

    fun save(context: Context, items: List<UpNextItem>) {
        val arr = JSONArray()
        for (i in items) arr.put(i.toJson())
        cacheFile(context).writeText(arr.toString())
    }

    fun load(context: Context): List<UpNextItem> {
        val f = cacheFile(context)
        if (!f.exists()) return emptyList()
        return try {
            val arr = JSONArray(f.readText())
            (0 until arr.length()).map { UpNextItem.fromJson(arr.getJSONObject(it)) }
        } catch (_: Exception) {
            emptyList()
        }
    }

    fun posterFile(context: Context, showId: Int): File {
        val dir = File(context.filesDir, "posters")
        dir.mkdirs()
        return File(dir, "$showId.jpg")
    }

    /** Drop posters for shows no longer in the list, so the cache can't grow forever. */
    fun prunePosters(context: Context, keepShowIds: Set<Int>) {
        val dir = File(context.filesDir, "posters")
        dir.listFiles()?.forEach { f ->
            val id = f.nameWithoutExtension.toIntOrNull()
            if (id == null || id !in keepShowIds) f.delete()
        }
    }
}

/**
 * Port of the PWA's next-up logic (src/lib/tracking.ts): walk aired episodes
 * season by season and return the first one not in [watched], where keys are
 * "S{n}E{n}". Only episodes up to lastEpisodeToAir count as aired.
 */
object NextUp {

    data class Result(val season: Int, val episode: Int, val done: Int, val total: Int)

    /**
     * [seasonCounts] maps season number -> episode count (season 0 excluded),
     * [lastSeason]/[lastEpisode] identify the most recently aired episode.
     * Returns null when the user is caught up.
     */
    fun compute(
        seasonCounts: Map<Int, Int>,
        lastSeason: Int,
        lastEpisode: Int,
        watched: Set<String>,
    ): Result? {
        var next: Pair<Int, Int>? = null
        var done = 0
        var total = 0
        for (s in 1..lastSeason) {
            val maxEp = if (s == lastSeason) lastEpisode else seasonCounts[s] ?: 0
            for (e in 1..maxEp) {
                total++
                if (watched.contains("S${s}E$e")) done++
                else if (next == null) next = s to e
            }
        }
        val (season, episode) = next ?: return null
        return Result(season, episode, done, total)
    }
}
