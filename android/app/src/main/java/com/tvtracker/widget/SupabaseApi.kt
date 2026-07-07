package com.tvtracker.widget

import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

class ApiException(message: String) : IOException(message)

/**
 * Minimal Supabase client over HttpURLConnection — auth (GoTrue), the REST
 * (PostgREST) tables, and the tmdb-proxy Edge Function. Mirrors exactly the
 * calls the PWA makes; RLS on the server keeps data scoped to the signed-in
 * user. All methods are blocking: call them from a Worker/background thread.
 */
object SupabaseApi {

    private fun request(
        method: String,
        url: String,
        headers: Map<String, String>,
        body: String? = null,
    ): String {
        val conn = URL(url).openConnection() as HttpURLConnection
        try {
            conn.requestMethod = method
            conn.connectTimeout = 15_000
            conn.readTimeout = 30_000
            for ((k, v) in headers) conn.setRequestProperty(k, v)
            if (body != null) {
                conn.setRequestProperty("Content-Type", "application/json")
                conn.doOutput = true
                conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            }
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() } ?: ""
            if (code !in 200..299) {
                // Surface GoTrue/PostgREST error messages when present.
                val detail = try {
                    val o = JSONObject(text)
                    o.optString("msg").ifEmpty { o.optString("message") }
                        .ifEmpty { o.optString("error_description") }
                        .ifEmpty { o.optString("error") }
                } catch (_: Exception) { "" }
                throw ApiException("HTTP $code${if (detail.isNotEmpty()) ": $detail" else ""}")
            }
            return text
        } finally {
            conn.disconnect()
        }
    }

    // --- Auth (GoTrue) -------------------------------------------------------

    private fun storeSession(prefs: Prefs, auth: JSONObject) {
        prefs.accessToken = auth.getString("access_token")
        prefs.refreshToken = auth.getString("refresh_token")
        val expiresIn = auth.optLong("expires_in", 3600)
        prefs.expiresAt = System.currentTimeMillis() + expiresIn * 1000
    }

    /** Email + password sign-in. Stores the session in [prefs] on success. */
    fun signIn(prefs: Prefs, email: String, password: String) {
        val body = JSONObject().put("email", email).put("password", password).toString()
        val text = request(
            "POST",
            "${prefs.supabaseUrl}/auth/v1/token?grant_type=password",
            mapOf("apikey" to prefs.anonKey),
            body,
        )
        storeSession(prefs, JSONObject(text))
        prefs.email = email
    }

    /**
     * Returns a valid access token, refreshing (and rotating the stored
     * refresh token) if the current one is within a minute of expiry.
     */
    fun ensureAccessToken(prefs: Prefs): String {
        if (prefs.accessToken.isNotEmpty() &&
            System.currentTimeMillis() < prefs.expiresAt - 60_000
        ) return prefs.accessToken

        if (prefs.refreshToken.isEmpty()) throw ApiException("Not signed in")
        val body = JSONObject().put("refresh_token", prefs.refreshToken).toString()
        val text = request(
            "POST",
            "${prefs.supabaseUrl}/auth/v1/token?grant_type=refresh_token",
            mapOf("apikey" to prefs.anonKey),
            body,
        )
        storeSession(prefs, JSONObject(text))
        return prefs.accessToken
    }

    // --- Tables (PostgREST) --------------------------------------------------

    private fun restHeaders(prefs: Prefs): Map<String, String> = mapOf(
        "apikey" to prefs.anonKey,
        "Authorization" to "Bearer ${ensureAccessToken(prefs)}",
    )

    /** GET /rest/v1/<pathAndQuery>, returning the JSON array of rows. */
    fun restGet(prefs: Prefs, pathAndQuery: String): JSONArray {
        val text = request("GET", "${prefs.supabaseUrl}/rest/v1/$pathAndQuery", restHeaders(prefs))
        return JSONArray(text)
    }

    /**
     * Pages through a PostgREST query (single responses cap at 1000 rows).
     * [pathAndQuery] must not contain limit/offset; ordering should be stable.
     */
    fun restGetAll(prefs: Prefs, pathAndQuery: String, pageSize: Int = 1000): JSONArray {
        val all = JSONArray()
        var offset = 0
        while (true) {
            val page = restGet(prefs, "$pathAndQuery&limit=$pageSize&offset=$offset")
            for (i in 0 until page.length()) all.put(page.get(i))
            if (page.length() < pageSize) return all
            offset += pageSize
        }
    }

    /** POST an upsert (merge on conflict) into a table, mirroring supabase-js upsert(). */
    fun restUpsert(prefs: Prefs, table: String, onConflict: String, row: JSONObject) {
        request(
            "POST",
            "${prefs.supabaseUrl}/rest/v1/$table?on_conflict=" +
                URLEncoder.encode(onConflict, "UTF-8"),
            restHeaders(prefs) + mapOf("Prefer" to "resolution=merge-duplicates,return=minimal"),
            JSONArray().put(row).toString(),
        )
    }

    // --- TMDB metadata (via the tmdb-proxy Edge Function) ---------------------

    /** GET {SUPABASE_URL}/functions/v1/tmdb-proxy/<path>. Anon key only, like the PWA. */
    fun tmdb(prefs: Prefs, path: String): JSONObject {
        val text = request(
            "GET",
            "${prefs.supabaseUrl}/functions/v1/tmdb-proxy/$path",
            mapOf("apikey" to prefs.anonKey, "Authorization" to "Bearer ${prefs.anonKey}"),
        )
        return JSONObject(text)
    }

    /** Download a poster thumbnail from TMDB's public image CDN. */
    fun fetchImage(posterPath: String): ByteArray {
        val conn = URL("https://image.tmdb.org/t/p/w185$posterPath")
            .openConnection() as HttpURLConnection
        try {
            conn.connectTimeout = 15_000
            conn.readTimeout = 30_000
            if (conn.responseCode !in 200..299) throw ApiException("image HTTP ${conn.responseCode}")
            return conn.inputStream.use { it.readBytes() }
        } finally {
            conn.disconnect()
        }
    }
}
