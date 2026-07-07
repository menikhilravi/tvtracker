package com.tvtracker.widget

import android.content.Context
import android.content.SharedPreferences

/**
 * App-private storage for the Supabase connection and session. Values never
 * leave this app's sandbox. The Supabase URL + anon key are the same public
 * values the PWA ships in its bundle; the refresh token is the only secret.
 */
class Prefs(context: Context) {
    private val sp: SharedPreferences =
        context.getSharedPreferences("tvtracker", Context.MODE_PRIVATE)

    var supabaseUrl: String
        get() = sp.getString("supabase_url", "")!!
        set(v) { sp.edit().putString("supabase_url", v.trim().trimEnd('/')).apply() }

    var anonKey: String
        get() = sp.getString("anon_key", "")!!
        set(v) { sp.edit().putString("anon_key", v.trim()).apply() }

    /** Where the PWA is deployed; widget rows deep-link into it. Optional. */
    var appUrl: String
        get() = sp.getString("app_url", "")!!
        set(v) { sp.edit().putString("app_url", v.trim().trimEnd('/')).apply() }

    var email: String
        get() = sp.getString("email", "")!!
        set(v) { sp.edit().putString("email", v.trim()).apply() }

    var accessToken: String
        get() = sp.getString("access_token", "")!!
        set(v) { sp.edit().putString("access_token", v).apply() }

    var refreshToken: String
        get() = sp.getString("refresh_token", "")!!
        set(v) { sp.edit().putString("refresh_token", v).apply() }

    /** Unix millis when the current access token expires. */
    var expiresAt: Long
        get() = sp.getLong("expires_at", 0L)
        set(v) { sp.edit().putLong("expires_at", v).apply() }

    var lastSyncAt: Long
        get() = sp.getLong("last_sync_at", 0L)
        set(v) { sp.edit().putLong("last_sync_at", v).apply() }

    val isSignedIn: Boolean
        get() = supabaseUrl.isNotEmpty() && anonKey.isNotEmpty() && refreshToken.isNotEmpty()

    fun clearSession() {
        sp.edit()
            .remove("access_token")
            .remove("refresh_token")
            .remove("expires_at")
            .remove("last_sync_at")
            .apply()
    }
}
