package com.tvtracker.widget

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.widget.RemoteViews
import android.widget.RemoteViewsService

/** Streams cached up-next rows into the widget's ListView. */
class UpNextWidgetService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory =
        UpNextRemoteViewsFactory(applicationContext)
}

class UpNextRemoteViewsFactory(private val context: Context) :
    RemoteViewsService.RemoteViewsFactory {

    private var items: List<UpNextItem> = emptyList()

    override fun onCreate() {
        items = UpNextStore.load(context)
    }

    override fun onDataSetChanged() {
        // Called on a binder thread — file reads are fine here.
        items = UpNextStore.load(context)
    }

    override fun onDestroy() {
        items = emptyList()
    }

    override fun getCount(): Int = items.size

    override fun getViewAt(position: Int): RemoteViews {
        val item = items[position]
        val row = RemoteViews(context.packageName, R.layout.widget_row)

        row.setTextViewText(R.id.row_title, item.name)
        row.setTextViewText(R.id.row_subtitle, item.subtitle)
        row.setTextViewText(R.id.row_progress_text, "${item.done}/${item.total}")
        row.setProgressBar(R.id.row_progress, item.total, item.done, false)

        loadPoster(item.showId)?.let { row.setImageViewBitmap(R.id.row_poster, it) }
            ?: row.setImageViewResource(R.id.row_poster, R.drawable.poster_placeholder)

        // Tap the row -> open the episode in the web app (or settings if unset).
        row.setOnClickFillInIntent(
            R.id.row_root,
            Intent()
                .putExtra(ActionActivity.EXTRA_ACTION, ActionActivity.ACTION_OPEN)
                .putExtra(ActionActivity.EXTRA_SHOW_ID, item.showId)
                .putExtra(ActionActivity.EXTRA_SEASON, item.season)
                .putExtra(ActionActivity.EXTRA_EPISODE, item.episode),
        )

        // Tap ✓ -> log the watch and advance to the next episode.
        row.setOnClickFillInIntent(
            R.id.row_check,
            Intent()
                .putExtra(ActionActivity.EXTRA_ACTION, ActionActivity.ACTION_MARK)
                .putExtra(ActionActivity.EXTRA_SHOW_ID, item.showId)
                .putExtra(ActionActivity.EXTRA_SEASON, item.season)
                .putExtra(ActionActivity.EXTRA_EPISODE, item.episode)
                .putExtra(ActionActivity.EXTRA_NAME, item.name)
                .putExtra(ActionActivity.EXTRA_POSTER, item.posterPath),
        )

        return row
    }

    private fun loadPoster(showId: Int): Bitmap? {
        val file = UpNextStore.posterFile(context, showId)
        if (!file.exists() || file.length() == 0L) return null
        return try {
            // w185 posters are ~185x278 — small enough to hand to RemoteViews as-is.
            BitmapFactory.decodeFile(file.absolutePath)
        } catch (_: Exception) {
            null
        }
    }

    override fun getLoadingView(): RemoteViews? = null
    override fun getViewTypeCount(): Int = 1
    override fun getItemId(position: Int): Long =
        items.getOrNull(position)?.showId?.toLong() ?: position.toLong()
    override fun hasStableIds(): Boolean = true
}
