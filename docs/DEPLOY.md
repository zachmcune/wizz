# Deployment (Cloudflare, end to end)

## V1 — static PWA on Cloudflare Pages

The whole single-player game is the static output of `npm run build` (`dist/`): HTML, JS,
assets, and data JSON. There is **no backend in V1**.

### Repo config (checked in)

- `wrangler.toml` — tells Cloudflare Pages to publish `./dist` (not the repo root). Requires
  **Build System V2+** in the Pages dashboard.
- `.node-version` — pins Node 22 for consistent CI/builds.
- `.github/workflows/deploy-cloudflare-pages.yml` — optional GitHub Actions deploy (runs
  `npm run build` then `wrangler pages deploy`). Use this if dashboard builds keep serving
  source files (blank page with `/src/main.ts` in `index.html`).

### Dashboard setup (Git integration)

1. Connect the repo to Cloudflare Pages.
2. **Settings → Builds**: enable **Build System V2** (or V3).
3. Build command: `npm run build`. Output directory: `dist` (also set in `wrangler.toml`).
4. Framework preset: **Vite** or **None**.
5. `git push` publishes. Automatic HTTPS (required for service worker / PWA install) and custom
   domains are included.

### GitHub Actions deploy (recommended if the site is blank)

If https://your-project.pages.dev still serves `<script src="/src/main.ts">`, the build never
ran. Add these repository secrets, then push to `main`:

| Secret | Where to get it |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare dashboard → My Profile → API Tokens → Create Token → "Edit Cloudflare Workers" template (includes Pages) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → Workers & Pages → right sidebar |

The workflow builds locally in GitHub and uploads `dist/` via Wrangler, bypassing misconfigured
dashboard build settings.

### Cache headers

3. `public/_headers` (copied to `dist/`) sets the critical cache rules:
   - `index.html`, `sw.js`, `registerSW.js`, `manifest.webmanifest` → `no-cache` (revalidate),
   - `/assets/*` (content-hashed by Vite) → `immutable`, long-cached.
   This prevents players getting stuck on a stale build while letting hashed assets cache forever.
   `vite-plugin-pwa` (Workbox, `registerType: 'autoUpdate'`) drives the update flow.

**Cost:** effectively $0 (Pages serves static sites with unmetered bandwidth). Only a custom
domain registration costs money; the free `*.pages.dev` subdomain is $0.

## V2 — multiplayer relay on Cloudflare Workers + Durable Objects

Architected, not built (do not start before V1 ships and determinism is proven — it is, see
`tests/determinism.test.ts` and `tests/worker.test.ts`). Design:

- One **Durable Object per match room** holds that room's WebSocket connections and broadcasts the
  merged per-tick command list. Use **WebSocket Hibernation** so idle rooms don't bill compute.
- A thin **Worker** handles lobby/matchmaking and routes clients to a room DO. The relay forwards
  commands only; it never simulates.
- Client seams already exist: `src/net/protocol.ts` (wire messages, `INPUT_DELAY_TICKS`) and
  `src/net/lockstep.ts` (`LockstepClient`: input-delay buffering, confirmed per-tick commands,
  desync detection). Re-verify Cloudflare free-tier limits before building.

**Cost:** free at hobby scale; ~$5/month floor once past the Workers free allowance. No database
needed for matches (clients run the sim).
