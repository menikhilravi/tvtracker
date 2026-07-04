import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { isSupabaseConfigured } from '../lib/supabase'

export function Profile() {
  const { session, signInWithPassword, signOut } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
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
    setSubmitting(true)
    const { error } = await signInWithPassword(email, password)
    setSubmitting(false)
    if (error) setError(error)
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold">Sign in</h1>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <p className="text-sm text-slate-400">
          Sign in with the email and password for your account.
        </p>
        <input
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 outline-none focus:border-indigo-500"
        />
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 outline-none focus:border-indigo-500"
        />
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-indigo-600 py-3 font-semibold disabled:opacity-50"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </form>
      <p className="mt-4 text-xs text-slate-500">
        No account yet? Create your user in the Supabase dashboard under
        Authentication → Users → Add user (set a password and confirm the email),
        then sign in here.
      </p>
    </div>
  )
}
