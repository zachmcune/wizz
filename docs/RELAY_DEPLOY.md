# Relay deployment (Railway)

The lockstep multiplayer relay is a small Node WebSocket server (`relay/server.mjs`). It forwards
and merges player commands at 20 Hz; it does **not** run the game simulation. Deploy it separately
from the static PWA on Cloudflare Pages.

**Architecture:**

```text
Players → Cloudflare Pages (HTTPS, static game)
Players → Railway relay (WSS, command sync)
```

See also [DEPLOY.md](DEPLOY.md) for Pages setup and local dev.

## Prerequisites

- A [Railway](https://railway.com) account (Hobby plan for always-on WebSockets).
- Cloudflare Pages already building this repo (`npm run build` → `dist/`).
- Local multiplayer working (`npm run relay` + `npm run dev`, two tabs).

## 1. Create the Railway service

1. In Railway: **New Project** → **Deploy from GitHub repo** → select this repository.
2. Railway creates one service from the repo. The checked-in `railway.json` configures it:
   - **Build:** `npm ci` (installs the `ws` dependency only; no Vite build).
   - **Start:** `node relay/server.mjs`
   - **Health check:** `GET /health` (returns `{ "ok": true, "rooms": N }`).
3. Under **Settings → Networking**, click **Generate Domain**. Railway assigns a public HTTPS
   URL, e.g. `arcane-relay-production.up.railway.app`.

No database, volume, or extra env vars are required. Railway injects `PORT` automatically; the
relay listens on that port.

### Optional: custom domain

In **Settings → Networking → Custom Domain**, add e.g. `relay.yourdomain.com`. Railway provisions
TLS. Use that hostname in `VITE_RELAY_URL` below.

## 2. Verify the relay

```bash
curl https://YOUR-RAILWAY-DOMAIN.up.railway.app/health
```

Expected: `{"ok":true,"rooms":0}`

WebSocket test (optional, requires [websocat](https://github.com/nickel-org/nickel) or similar):

```bash
websocat "wss://YOUR-RAILWAY-DOMAIN.up.railway.app"
# then send: {"t":"join","room":"TEST01","matchId":"skirmish_1v1_online"}
```

You should receive a `joined` message with `playerId` and `seed`.

## 3. Point the game client at the relay

`VITE_RELAY_URL` is baked in at **build time** (see `src/net/multiplayer.ts`). Set it in
Cloudflare Pages, not Railway.

1. Cloudflare dashboard → **Workers & Pages** → your Pages project.
2. **Settings → Environment variables** → **Production** (and Preview if you want):
   - Name: `VITE_RELAY_URL`
   - Value: `wss://YOUR-RAILWAY-DOMAIN.up.railway.app` (no trailing slash)
3. **Deployments** → **Retry deployment** on the latest build (or push a commit) so the new env
   var is picked up.

For local production-like testing before Pages deploy:

```bash
VITE_RELAY_URL=wss://YOUR-RAILWAY-DOMAIN.up.railway.app npm run build
npm run preview
```

Open two tabs on the preview URL → **Create Online 1v1** / **Join Online 1v1**.

## 4. End-to-end smoke test

1. Open your live Pages URL on two devices or browser profiles.
2. Player A: **Create Online 1v1** — note the room code.
3. Player B: **Join Online 1v1** — enter the code.
4. Match should start when both players are in the lobby.

If the lobby spins forever, check the browser devtools **Network → WS** tab: the client should
connect to your `wss://` URL, not `ws://…:8787`.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| WS connects to `:8787` in production | `VITE_RELAY_URL` unset or Pages not rebuilt | Set env var; redeploy Pages |
| `502` / health check fails | Relay crashed or wrong start command | Railway logs; confirm `node relay/server.mjs` |
| CORS / mixed content errors | `VITE_RELAY_URL` uses `ws://` on HTTPS site | Use `wss://` |
| Room works locally, not online | Firewall or wrong relay URL | Verify `/health` and WS on Railway domain |
| Deploy runs Vite build (slow, unnecessary) | Dashboard overrides `railway.json` | Remove custom build command; rely on repo config |

## Cost

- **Railway Hobby:** small always-on Node process, typically a few dollars per month.
- **Cloudflare Pages:** static hosting remains free at hobby scale.
- No database; rooms are in-memory and disappear when empty.

## Alternatives

The same relay runs on any host with Node 20+ and WebSocket support (Fly.io, a VPS, etc.). Set
`PORT` if the platform requires it. Always expose `wss://` to browsers on HTTPS Pages.

A future **Cloudflare Workers + Durable Objects** port would colocate relay and Pages on
Cloudflare; see [DEPLOY.md](DEPLOY.md#v2--multiplayer-relay). The client wire protocol in
`src/net/protocol.ts` is already compatible.
