import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Arcane Dominion - Vite build/dev config. Static PWA; dist/ deploys to Cloudflare Pages.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Arcane Dominion',
        short_name: 'Arcane',
        description: 'A fast, mobile-first fantasy RTS. Rival archmages duel with summoned armies.',
        theme_color: '#12101c',
        background_color: '#12101c',
        display: 'fullscreen',
        orientation: 'landscape',
        start_url: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,json,woff2}'],
        /**
         * v2 is deployed from the same `dist` (see `scripts/build-v2.mjs`) but it is a separate app
         * with its own bundle, atlas and entry pages. Precaching it here would make every v1 player
         * download v2 as well and would put v2's HTML in the v1 cache under this worker's `/` scope.
         */
        globIgnores: ['v2/**', 'atlas-final/**'],
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
        /**
         * `/v2/` is the rebuilt game, deployed from this same `dist` (see `v2/` and
         * `scripts/build-v2.mjs`). This service worker is scoped to `/`, so without a denylist it
         * would answer a navigation to `/v2/` with the cached v1 `index.html` — every returning
         * player would get v1 at the v2 URL until the SW updated. The fallback is for v1's own
         * history URLs only.
         */
        navigateFallbackDenylist: [/^\/v2\//],
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
});
