import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { pushSupported, currentSubscription, enablePush, disablePush } from '../lib/push'

// App settings, split out of Profile so it doesn't get swamped.
export function Settings() {
  const { session } = useAuth()
  return (
    <div className="px-5 pt-14 pb-6">
      <Link to="/profile" className="inline-flex items-center gap-1 text-sm text-muted active:opacity-70">
        ‹ Profile
      </Link>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Settings</h1>

      {!session ? (
        <p className="mt-6 rounded-2xl border border-line bg-surface/60 p-4 text-sm text-muted">
          Sign in to change your settings.
        </p>
      ) : (
        <div className="mt-6">
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted">Notifications</h2>
          <RemindersRow />
        </div>
      )}
    </div>
  )
}

function RemindersRow() {
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    currentSubscription().then((s) => setEnabled(Boolean(s)))
  }, [])

  // On a dedicated settings page, explain unavailability rather than hiding it.
  if (!pushSupported()) {
    return (
      <div className="rounded-2xl border border-line bg-surface/60 p-4">
        <p className="font-medium">Episode reminders</p>
        <p className="mt-1 text-xs text-muted">
          Push notifications aren’t available on this device. On iPhone/iPad, install the app to
          your Home Screen first (iOS 16.4+).
        </p>
      </div>
    )
  }

  const toggle = async () => {
    setBusy(true)
    setErr(null)
    try {
      if (enabled) {
        await disablePush()
        setEnabled(false)
      } else {
        await enablePush()
        setEnabled(true)
      }
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface/60 p-4">
      <div className="min-w-0">
        <p className="font-medium">Episode reminders</p>
        <p className="text-xs text-muted">A push when a show you follow airs a new episode.</p>
        {err && <p className="mt-1 text-xs text-red-400">{err}</p>}
      </div>
      <button
        onClick={toggle}
        disabled={busy}
        className={`shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition active:scale-95 disabled:opacity-60 ${
          enabled ? 'border border-line bg-surface text-muted' : 'bg-brand-gradient text-white'
        }`}
      >
        {busy ? '…' : enabled ? 'On' : 'Enable'}
      </button>
    </div>
  )
}
