import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Custom SW (src/sw.ts) so we can handle Web Push events, which Workbox's
      // generated SW can't express. The manifest is injected into it at build.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'TV Tracker',
        short_name: 'TVTracker',
        description: 'Track the TV shows and movies you watch.',
        theme_color: '#08080c',
        background_color: '#08080c',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      // Runtime caching (TMDB images) now lives in src/sw.ts.
      devOptions: { enabled: false },
    }),
  ],
})
