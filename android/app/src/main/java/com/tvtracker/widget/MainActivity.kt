package com.tvtracker.widget

import android.app.Activity
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import java.text.DateFormat
import java.util.Date

/**
 * Sign-in and settings for the widget. Takes the same Supabase URL + anon key
 * the PWA uses (see the repo's .env), signs in with the same email/password
 * account, then hands off to WorkManager — the widget itself renders from the
 * synced cache.
 */
class MainActivity : Activity() {

    private lateinit var prefs: Prefs
    private lateinit var supabaseUrl: EditText
    private lateinit var anonKey: EditText
    private lateinit var appUrl: EditText
    private lateinit var email: EditText
    private lateinit var password: EditText
    private lateinit var signInButton: Button
    private lateinit var syncButton: Button
    private lateinit var signOutButton: Button
    private lateinit var status: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        prefs = Prefs(this)

        supabaseUrl = findViewById(R.id.input_supabase_url)
        anonKey = findViewById(R.id.input_anon_key)
        appUrl = findViewById(R.id.input_app_url)
        email = findViewById(R.id.input_email)
        password = findViewById(R.id.input_password)
        signInButton = findViewById(R.id.button_sign_in)
        syncButton = findViewById(R.id.button_sync)
        signOutButton = findViewById(R.id.button_sign_out)
        status = findViewById(R.id.text_status)

        supabaseUrl.setText(prefs.supabaseUrl)
        anonKey.setText(prefs.anonKey)
        appUrl.setText(prefs.appUrl)
        email.setText(prefs.email)

        signInButton.setOnClickListener { signIn() }
        syncButton.setOnClickListener {
            prefs.appUrl = appUrl.text.toString() // allow tweaking without re-auth
            SyncWorker.syncNow(this)
            Toast.makeText(this, R.string.sync_started, Toast.LENGTH_SHORT).show()
        }
        signOutButton.setOnClickListener {
            prefs.clearSession()
            UpNextStore.save(this, emptyList())
            SyncWorker.cancelAll(this)
            UpNextWidgetProvider.pushUpdate(this)
            render()
        }

        render()
    }

    private fun render() {
        val signedIn = prefs.isSignedIn
        syncButton.visibility = if (signedIn) View.VISIBLE else View.GONE
        signOutButton.visibility = if (signedIn) View.VISIBLE else View.GONE
        signInButton.setText(if (signedIn) R.string.re_sign_in else R.string.sign_in)
        status.text = when {
            !signedIn -> getString(R.string.status_signed_out)
            prefs.lastSyncAt > 0L -> getString(
                R.string.status_signed_in_synced,
                prefs.email,
                DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT)
                    .format(Date(prefs.lastSyncAt)),
            )
            else -> getString(R.string.status_signed_in, prefs.email)
        }
    }

    private fun signIn() {
        val url = supabaseUrl.text.toString().trim()
        val key = anonKey.text.toString().trim()
        val mail = email.text.toString().trim()
        val pass = password.text.toString()
        if (url.isEmpty() || key.isEmpty() || mail.isEmpty() || pass.isEmpty()) {
            Toast.makeText(this, R.string.fill_all_fields, Toast.LENGTH_SHORT).show()
            return
        }

        prefs.supabaseUrl = url
        prefs.anonKey = key
        prefs.appUrl = appUrl.text.toString()

        signInButton.isEnabled = false
        status.setText(R.string.status_signing_in)

        Thread {
            val error = try {
                SupabaseApi.signIn(prefs, mail, pass)
                null
            } catch (e: Exception) {
                e.message ?: e.javaClass.simpleName
            }
            runOnUiThread {
                signInButton.isEnabled = true
                if (error == null) {
                    password.text.clear()
                    Toast.makeText(this, R.string.signed_in, Toast.LENGTH_SHORT).show()
                    SyncWorker.schedulePeriodic(this)
                    SyncWorker.syncNow(this)
                    render()
                } else {
                    status.text = getString(R.string.status_error, error)
                }
            }
        }.start()
    }
}
