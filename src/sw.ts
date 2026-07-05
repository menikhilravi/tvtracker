/// <reference lib="webworker" />
// Custom service worker (injectManifest strategy). Handles the same offline
// caching as before, plus Web Push for episode reminders. The `push` and
// `notificationclick` handlers can't be expressed with Workbox's generateSW,
// which is why this app uses a hand-written SW.
import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>
}

// Take over as soon as a new version is deployed instead of waiting behind the
// old worker — otherwise refreshes keep serving the previous, stale bundle
// (registerType is 'autoUpdate', and injectManifest doesn't add these for us).
self.addEventListener('install', () => {
  self.skipWaiting()
})
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// Precache the built app shell (vite-plugin-pwa injects the manifest here).
precacheAndRoute(self.__WB_MANIFEST)

// Cache TMDB poster/backdrop images for offline viewing (ported from the old
// generateSW runtimeCaching config).
registerRoute(
  ({ url }) => url.origin === 'https://image.tmdb.org',
  new CacheFirst({
    cacheName: 'tmdb-images',
    plugins: [new ExpirationPlugin({ maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 })],
  }),
)

interface PushPayload {
  title?: string
  body?: string
  url?: string
}

self.addEventListener('push', (event) => {
  let payload: PushPayload = {}
  try {
    payload = event.data?.json() ?? {}
  } catch {
    payload = { body: event.data?.text() }
  }
  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'TV Tracker', {
      body: payload.body ?? '',
      icon: '/pwa-192.png',
      badge: '/pwa-192.png',
      data: { url: payload.url ?? '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus an existing tab and route it, else open a new one.
      for (const client of clients) {
        if ('focus' in client) {
          void client.navigate(url)
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
