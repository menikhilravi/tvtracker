package com.tvtracker.widget

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.Toast

/**
 * Invisible trampoline for widget row taps. A collection widget gets a single
 * PendingIntent template, so every tap lands here with fill-in extras saying
 * what to do: deep-link into the PWA, or log an episode watch.
 */
class ActionActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val showId = intent.getIntExtra(EXTRA_SHOW_ID, 0)
        val season = intent.getIntExtra(EXTRA_SEASON, 0)
        val episode = intent.getIntExtra(EXTRA_EPISODE, 0)

        when (intent.getStringExtra(EXTRA_ACTION)) {
            ACTION_OPEN -> openEpisode(showId, season, episode)
            ACTION_MARK -> markWatched(showId, season, episode)
        }
        finish()
    }

    private fun openEpisode(showId: Int, season: Int, episode: Int) {
        val appUrl = Prefs(this).appUrl
        if (appUrl.isEmpty() || showId == 0) {
            // No web app configured — fall back to this app's settings screen.
            startActivity(Intent(this, MainActivity::class.java))
            return
        }
        // Same deep link the PWA's Up Next cards use.
        val url = "$appUrl/title/tv/$showId?s=$season&e=$episode"
        try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        } catch (_: Exception) {
            Toast.makeText(this, getString(R.string.open_failed, url), Toast.LENGTH_SHORT).show()
        }
    }

    private fun markWatched(showId: Int, season: Int, episode: Int) {
        if (showId == 0 || season == 0 || episode == 0) return
        MarkWatchedWorker.enqueue(
            this, showId, season, episode,
            intent.getStringExtra(EXTRA_NAME),
            intent.getStringExtra(EXTRA_POSTER),
        )
        Toast.makeText(
            this,
            getString(R.string.marked_watched, season, episode),
            Toast.LENGTH_SHORT,
        ).show()
    }

    companion object {
        const val EXTRA_ACTION = "action"
        const val ACTION_OPEN = "open"
        const val ACTION_MARK = "mark"
        const val EXTRA_SHOW_ID = "show_id"
        const val EXTRA_SEASON = "season"
        const val EXTRA_EPISODE = "episode"
        const val EXTRA_NAME = "name"
        const val EXTRA_POSTER = "poster"
    }
}
