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
      <div className="px-5 pt-14">
        <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
        <p className="mt-5 rounded-2xl border border-line bg-surface/60 p-4 text-sm leading-relaxed text-muted">
          Supabase isn’t configured yet. Add <code className="text-ink">VITE_SUPABASE_URL</code> and{' '}
          <code className="text-ink">VITE_SUPABASE_ANON_KEY</code> to <code className="text-ink">.env</code>{' '}
          (see the README), then reload. Search still works without it.
        </p>
      </div>
    )
  }

  if (session) {
    const email = session.user.email ?? ''
    const initial = email.charAt(0).toUpperCase() || '?'
    return (
      <div className="px-5 pt-14">
        <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
        <div className="mt-6 flex items-center gap-4 rounded-3xl border border-line bg-surface/60 p-5">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-brand-gradient text-2xl font-bold">
            {initial}
          </div>
          <div className="min-w-0">
            <p className="text-xs text-faint">Signed in as</p>
            <p className="truncate font-medium">{email}</p>
          </div>
        </div>
        <button
          onClick={() => signOut()}
          className="mt-4 w-full rounded-2xl border border-line bg-surface py-3 font-semibold active:scale-[0.98]"
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
    <div className="flex min-h-dvh flex-col justify-center px-6">
      <div className="mb-8 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-brand-gradient text-3xl shadow-2xl shadow-brand/30">
          📺
        </div>
        <h1 className="mt-5 text-2xl font-bold tracking-tight">Welcome back</h1>
        <p className="mt-1.5 text-sm text-muted">Sign in to your tracker</p>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <input
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-2xl border border-line bg-surface/80 px-4 py-3.5 outline-none transition-colors placeholder:text-faint focus:border-brand/60 focus:bg-surface"
        />
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded-2xl border border-line bg-surface/80 px-4 py-3.5 outline-none transition-colors placeholder:text-faint focus:border-brand/60 focus:bg-surface"
        />
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-2xl bg-brand-gradient py-3.5 font-semibold shadow-lg shadow-brand/25 transition active:scale-[0.98] disabled:opacity-50"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
        {error && <p className="text-center text-sm text-red-400">{error}</p>}
      </form>

      <p className="mt-6 text-center text-xs leading-relaxed text-faint">
        No account yet? Create your user in the Supabase dashboard under
        Authentication → Users → Add user (set a password and auto-confirm), then
        sign in here.
      </p>
    </div>
  )
}
