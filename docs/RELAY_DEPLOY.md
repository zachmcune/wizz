# Railway deployment (game + multiplayer)

One Railway service hosts **both** the static PWA (`dist/`) and the lockstep WebSocket relay on the
same URL. No Cloudflare Pages required; no `VITE_RELAY_URL` env var needed.

```text
Players → https://your-app.up.railway.app  (HTML/JS/assets)
Players → wss://your-app.up.railway.app    (command sync, same host)
```

Local dev is unchanged: `npm run relay` + `npm run dev` (relay on port 8787).

See [DEPLOY.md](DEPLOY.md) for Cloudflare Pages–only hosting (single-player, no relay).

## Prerequisites

- A [Railway](https://railway.com) account (Hobby plan, ~$5/month).
- Local multiplayer working (`npm run relay` + `npm run dev`, two tabs).

## 1. Deploy to Railway

1. **New Project** → **Deploy from GitHub repo** → select this repository.
2. `railway.json` configures the service automatically:
   - **Build:** `npm ci --include=dev && npm run build` (typecheck + Vite → `dist/`)
   - **Start:** `node relay/production.mjs` (static files + WebSocket relay)
   - **Health check:** `GET /health`
3. **Settings → Networking** → **Generate Domain** (e.g. `arcane-dominion.up.railway.app`).
4. **Settings → Deploy** → ensure **Serverless** is **off** (relay must stay always-on).

If the build fails with `tsc: not found` or `vite: not found`, Railway skipped devDependencies.
This repo sets `npm ci --include=dev` in `railway.json` / `nixpacks.toml` to fix that. You can also
add a Railway variable `NPM_CONFIG_PRODUCTION=false` for the build.

No database, volumes, or environment variables are required. Railway injects `PORT`.

## 2. Verify

```bash
curl https://YOUR-DOMAIN.up.railway.app/health
# {"ok":true,"rooms":0}

curl -I https://YOUR-DOMAIN.up.railway.app/
# 200, text/html
```

Open `https://YOUR-DOMAIN.up.railway.app/` in two browser tabs → **Create Online 1v1** /
**Join Online 1v1**. The client auto-connects to `wss://` on the same host (see
`src/net/multiplayer.ts`).

## 3. Local production smoke test

```bash
npm run build
npm run start
# http://localhost:8787 — game + relay on one port
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Build fails: `tsc` / `vite` not found | Dev deps skipped (`NODE_ENV=production`) | Redeploy latest `main`; or set `NPM_CONFIG_PRODUCTION=false` |
| `503 Game build missing` | `dist/` not built | Build step failed; check Railway build logs |
| Health check fails | Wrong start command or crash on boot | Logs; confirm `node relay/production.mjs` |
| WS connects to `:8787` on Railway | Old client build | Redeploy; HTTPS pages use `wss://host` with no port |
| Lobby spins forever | Serverless sleep enabled | Disable Serverless in Deploy settings |
| Stale PWA after deploy | Browser/service worker cache | Hard refresh; `index.html` is served with `no-cache` |

## Cost

- **Railway Hobby:** ~$5/month subscription; included usage usually covers a small Node process
  plus static traffic for a hobby game.
- No database; match rooms are in-memory and disappear when empty.

## Split hosting (optional)

You can still host the static game on **Cloudflare Pages** (free CDN) and run **only** the relay on
Railway:

1. Railway: change start to `node relay/server.mjs`, build to `npm ci` only.
2. Pages: set `VITE_RELAY_URL=wss://your-relay.up.railway.app` and redeploy.

The all-in-one setup above is simpler when you are already paying for Railway.

## Alternatives

- **Fly.io / VPS:** run `npm run build && npm run start` the same way.
- **Cloudflare Workers + Durable Objects:** future all-on-Cloudflare relay; see
  [DEPLOY.md](DEPLOY.md#cloudflare-workers--durable-objects-future).
