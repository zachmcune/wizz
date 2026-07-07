# Deployment (Cloudflare, end to end)

## V1 — static PWA on Cloudflare Pages

The whole single-player game is the static output of `npm run build` (`dist/`): HTML, JS,
assets, and data JSON. There is **no backend in V1**.

### Repo config (checked in)

- `wrangler.toml` — tells Cloudflare Pages to publish `./dist` (not the repo root). Requires
  **Build System V2+** in the Pages dashboard.
- `.node-version` — pins Node 22 for consistent CI/builds.
- `wrangler.toml` — tells Cloudflare Pages to publish `./dist` (not the repo root). Requires
  **Build System V2+** in the Pages dashboard.

### Dashboard setup (Git integration)

1. Connect the repo to Cloudflare Pages.
2. **Settings → Builds**: enable **Build System V2** (or V3).
3. Build command: `npm run build`. Output directory: `dist` (also set in `wrangler.toml`).
4. Framework preset: **Vite** or **None**.
5. `git push` publishes. Automatic HTTPS (required for service worker / PWA install) and custom
   domains are included.

### GitHub Actions deploy (optional)

The repo no longer runs a GitHub Actions deploy by default. Cloudflare Pages git integration
builds on push. Only add a Actions workflow if you want CI deploy with API token secrets.

3. `public/_headers` (copied to `dist/`) sets the critical cache rules:
   - `index.html`, `sw.js`, `registerSW.js`, `manifest.webmanifest` → `no-cache` (revalidate),
   - `/assets/*` (content-hashed by Vite) → `immutable`, long-cached.
   This prevents players getting stuck on a stale build while letting hashed assets cache forever.
   `vite-plugin-pwa` (Workbox, `registerType: 'autoUpdate'`) registers via `src/pwa.ts`,
   polls for updates on focus/visibility, and reloads when a new build is available.

**Cost:** effectively $0 (Pages serves static sites with unmetered bandwidth). Only a custom
domain registration costs money; the free `*.pages.dev` subdomain is $0.

## V2 — multiplayer relay

### Local development (ready now)

1. **Terminal 1:** `npm run relay` — starts the lockstep relay on port **8787**
2. **Terminal 2:** `npm run dev` — Vite dev server
3. Open two browser tabs (or two devices on the same LAN):
   - Tab A: **Create Online 1v1** — share the room code
   - Tab B: **Join Online 1v1** — enter the code
4. Match starts automatically when both players join.

The client defaults to `ws://<hostname>:8787`. Override with `VITE_RELAY_URL` at build time
(see `.env.example`).

### Production relay deploy

The relay is a small Node WebSocket server (`relay/server.mjs`). Deploy it to any host that
supports WebSockets and set `VITE_RELAY_URL=wss://your-relay` when building the Pages app.

**Step-by-step (Railway):** [RELAY_DEPLOY.md](RELAY_DEPLOY.md) — includes `railway.json`, health
check, Cloudflare Pages env var, and smoke test.

### Cloudflare Workers + Durable Objects (future)

For hobby-scale hosting on Cloudflare, port `relay/server.mjs` merge/tick logic into a Durable
Object per room. The client `WebSocketTransport` and wire protocol are already compatible.

Architected design:

- One **Durable Object per match room** holds that room's WebSocket connections and broadcasts the
  merged per-tick command list. Use **WebSocket Hibernation** so idle rooms don't bill compute.
- A thin **Worker** handles lobby/matchmaking and routes clients to a room DO. The relay forwards
  commands only; it never simulates.
- Client seams: `src/net/protocol.ts`, `src/net/lockstep.ts`, `src/net/multiplayer.ts`.

**Cost:** free at hobby scale on CF Workers; Node relay on a small VPS is also ~$0–5/month. No
database needed for matches (clients run the sim).
