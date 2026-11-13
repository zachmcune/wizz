import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Arcane Dominion v2 — static PWA. Lives entirely under v2/; the v1 app has its own config
// at the repository root and is never imported from here.
//
// Two entries:
//   index.html    the game
//   gallery.html  the art review page (every sprite, all facings, all team colours)
// The gallery is a real deliverable for art sign-off, not a dev toy, so it is built and deployed
// alongside the game rather than living only in the dev server.
export default defineConfig({
  root: __dirname,
  base: './',
  build: {
    target: 'es2022',
    sourcemap: true,
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        gallery: resolve(__dirname, 'gallery.html'),
      },
    },
  },
});
