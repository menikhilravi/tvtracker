package com.tvtracker.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews
import java.text.DateFormat
import java.util.Date

/** The "Up next" home-screen widget: a list of next-unwatched episodes. */
class UpNextWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
    ) {
        for (id in appWidgetIds) update(context, appWidgetManager, id)
    }

    override fun onEnabled(context: Context) {
        // First widget placed: start background refreshes and fill it right away.
        SyncWorker.schedulePeriodic(context)
        SyncWorker.syncNow(context)
    }

    override fun onDisabled(context: Context) {
        SyncWorker.cancelAll(context)
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == ACTION_REFRESH) SyncWorker.syncNow(context)
        super.onReceive(context, intent)
    }

    companion object {
        const val ACTION_REFRESH = "com.tvtracker.widget.REFRESH"

        /** Re-render every placed widget from the local cache. */
        fun pushUpdate(context: Context) {
            val mgr = AppWidgetManager.getInstance(context)
            val ids = mgr.getAppWidgetIds(
                ComponentName(context, UpNextWidgetProvider::class.java),
            )
            if (ids.isEmpty()) return
            mgr.notifyAppWidgetViewDataChanged(ids, R.id.widget_list)
            for (id in ids) update(context, mgr, id)
        }

        private fun update(context: Context, mgr: AppWidgetManager, widgetId: Int) {
            val prefs = Prefs(context)
            val views = RemoteViews(context.packageName, R.layout.widget_up_next)

            val subtitle = when {
                !prefs.isSignedIn -> context.getString(R.string.widget_signed_out)
                prefs.lastSyncAt > 0L -> context.getString(
                    R.string.widget_updated,
                    DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(prefs.lastSyncAt)),
                )
                else -> context.getString(R.string.widget_syncing)
            }
            views.setTextViewText(R.id.widget_subtitle, subtitle)

            // Header opens the sign-in/settings screen.
            views.setOnClickPendingIntent(
                R.id.widget_header,
                PendingIntent.getActivity(
                    context, 0,
                    Intent(context, MainActivity::class.java),
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                ),
            )

            // Refresh button triggers a one-shot sync.
            views.setOnClickPendingIntent(
                R.id.widget_refresh,
                PendingIntent.getBroadcast(
                    context, 0,
                    Intent(context, UpNextWidgetProvider::class.java).setAction(ACTION_REFRESH),
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                ),
            )

            // List rows come from UpNextWidgetService; the per-widget data Uri
            // keeps the system from merging adapters across instances.
            val svc = Intent(context, UpNextWidgetService::class.java)
                .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
            svc.data = Uri.parse(svc.toUri(Intent.URI_INTENT_SCHEME))
            views.setRemoteAdapter(R.id.widget_list, svc)
            views.setEmptyView(R.id.widget_list, R.id.widget_empty)
            views.setTextViewText(
                R.id.widget_empty,
                context.getString(
                    if (prefs.isSignedIn) R.string.widget_caught_up
                    else R.string.widget_sign_in_hint,
                ),
            )

            // One template for all row taps; each row's fill-in intent picks the
            // action (open episode / mark watched) inside ActionActivity.
            views.setPendingIntentTemplate(
                R.id.widget_list,
                PendingIntent.getActivity(
                    context, 1,
                    Intent(context, ActionActivity::class.java),
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
                ),
            )

            mgr.updateAppWidget(widgetId, views)
        }
    }
}
