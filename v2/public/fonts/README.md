# Self-hosted typefaces

IBM Plex, Latin subset only, woff2. Vendored here rather than installed from npm so the build has no
network dependency and the exact bytes are pinned in git.

| File | Family | Weight |
|---|---|---|
| `ibm-plex-sans-latin-400-normal.woff2` | Plex Sans | 400 |
| `ibm-plex-sans-latin-500-normal.woff2` | Plex Sans | 500 |
| `ibm-plex-sans-latin-600-normal.woff2` | Plex Sans | 600 |
| `ibm-plex-sans-condensed-latin-500-normal.woff2` | Plex Condensed | 500 |
| `ibm-plex-sans-condensed-latin-600-normal.woff2` | Plex Condensed | 600 |
| `ibm-plex-mono-latin-400-normal.woff2` | Plex Mono | 400 |
| `ibm-plex-mono-latin-500-normal.woff2` | Plex Mono | 500 |

Source: `@fontsource/ibm-plex-*` (SIL Open Font License 1.1). Only the weights the UI actually uses are
included; the whole set is 148 KB.

`src/ui/fonts.css` declares the `@font-face` rules and `tests/ui-style-proof.test.ts` asserts that every
referenced file exists and that no remote font host is used.
