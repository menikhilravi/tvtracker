// Web Push subscription management. Talks to the browser's PushManager and
// mirrors the subscription into Supabase (`push_subscriptions`), which the
// send-reminders Edge Function reads to deliver episode reminders.
import { supabase } from './supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export const pushSupported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window

// VAPID public keys are base64url; PushManager wants a Uint8Array backed by a
// concrete ArrayBuffer (so it satisfies BufferSource under TS's generic typing).
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(normalized)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

// Whether this browser currently has an active push subscription.
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

// Prompt for permission, subscribe, and persist to Supabase. Returns true on
// success. Throws with a readable message on the common failure modes.
export async function enablePush(): Promise<boolean> {
  if (!pushSupported()) throw new Error('Push notifications aren’t supported on this device.')
  if (!VAPID_PUBLIC_KEY) throw new Error('Push is not configured (missing VITE_VAPID_PUBLIC_KEY).')
  if (!supabase) throw new Error('Sign-in required to enable reminders.')

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notification permission was denied.')

  const reg = await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }))

  const json = sub.toJSON()
  const keys = json.keys ?? {}
  const { error } = await supabase.from('push_subscriptions').upsert(
    { endpoint: sub.endpoint, p256dh: keys.p256dh ?? '', auth: keys.auth ?? '' },
    { onConflict: 'endpoint' },
  )
  if (error) throw error
  return true
}

// Unsubscribe locally and remove the row from Supabase.
export async function disablePush(): Promise<void> {
  const sub = await currentSubscription()
  if (!sub) return
  const endpoint = sub.endpoint
  await sub.unsubscribe()
  if (supabase) await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
}
