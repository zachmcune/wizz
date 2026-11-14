import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Arcane Dominion v2 — static PWA. Lives entirely under v2/; the v1 app has its own config
// at the repository root and is never imported from here.
//
// Three entries:
//   index.html       the game
//   gallery.html     the art review page (every sprite, all facings, all team colours)
//   styleguide.html  the UI style reference (palette, type, components, states, icons, mockups)
//   ui-proof.html    harness that mounts one screen at one density, for the proof captures
// The gallery and the style guide are real deliverables for sign-off, not dev toys, so both are built
// and deployed alongside the game rather than living only in the dev server.
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
        styleguide: resolve(__dirname, 'styleguide.html'),
        // Proof harness: mounts one mockup at one density for the UI proof captures.
        uiproof: resolve(__dirname, 'ui-proof.html'),
      },
    },
  },
});
