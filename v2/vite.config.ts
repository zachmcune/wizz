import { defineConfig } from 'vite';

// Arcane Dominion v2 — static PWA. Lives entirely under v2/; the v1 app has its own config
// at the repository root and is never imported from here.
export default defineConfig({
  root: __dirname,
  base: './',
  build: {
    target: 'es2022',
    sourcemap: true,
    outDir: 'dist',
    emptyOutDir: true,
  },
});
