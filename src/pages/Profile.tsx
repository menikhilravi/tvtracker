import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { isSupabaseConfigured } from '../lib/supabase'

export function Profile() {
  const { session, signInWithEmail, signOut } = useAuth()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isSupabaseConfigured) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold">Profile</h1>
        <p className="mt-4 rounded-xl bg-slate-800 p-4 text-sm text-slate-300">
          Supabase isn’t configured yet. Add <code>VITE_SUPABASE_URL</code> and{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> to <code>.env</code> (see the README), then reload.
          Search still works without it.
        </p>
      </div>
    )
  }

  if (session) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold">Profile</h1>
        <p className="mt-4 text-sm text-slate-400">Signed in as</p>
        <p className="font-medium">{session.user.email}</p>
        <button
          onClick={() => signOut()}
          className="mt-6 rounded-xl bg-slate-700 px-5 py-2.5 font-semibold"
        >
          Sign out
        </button>
      </div>
    )
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const { error } = await signInWithEmail(email)
    if (error) setError(error)
    else setSent(true)
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold">Sign in</h1>
      {sent ? (
        <p className="mt-4 rounded-xl bg-slate-800 p-4 text-sm text-slate-300">
          Check <b>{email}</b> for a magic link. Open it on this device to finish signing in.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-3">
          <p className="text-sm text-slate-400">
            We’ll email you a one-tap magic link — no password.
          </p>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 outline-none focus:border-indigo-500"
          />
          <button type="submit" className="w-full rounded-xl bg-indigo-600 py-3 font-semibold">
            Send magic link
          </button>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </form>
      )}
    </div>
  )
}
