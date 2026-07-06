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
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
      },
    }),
  ],
});
