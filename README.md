# Arcane Dominion

A mobile-first PWA real-time strategy game — "Red Alert 2 meets Wizard Duels." Rival archmages
battle for control with summoned creatures and arcane constructs. Landscape-only, touch-first,
built as an installable Progressive Web App.

## Quick start

```bash
npm install
npm run dev        # dev server (open on a phone or desktop)
npm run build      # production build -> dist/  (deploy to Cloudflare Pages)
npm run typecheck  # tsc --noEmit
npm run lint       # ESLint (includes the sim import guard)
npm test           # headless determinism + gameplay tests
```

Regenerate placeholder assets/map:

```bash
node scripts/gen-icons.mjs   # PWA icons
node scripts/gen-map.mjs     # data/maps/duel_glade.json
```

## What it is

- Deterministic, command-driven simulation core (headless-testable, replay/multiplayer-ready).
- PixiJS WebGL rendering, separated from game logic. Placeholder art drawn from data (`shape`),
  with a clean upgrade path to real sprites.
- Data-driven content in `/data` (units, buildings, spells, projectiles, maps, match configs),
  validated by Zod.
- Touch controls: tap-select, double-tap type-select, long-press box select, context commands,
  pan/pinch-zoom, build placement, spell targeting, production/rally, minimap.
- Layered AI opponent(s); supports 2–8 players, FFA and teams.
- Single resource (Mana), base building, harvesting, unit counters, 3 spells.

## Docs

- [ARCHITECTURE.md](docs/ARCHITECTURE.md) — layers, tick contract, module map.
- [DETERMINISM.md](docs/DETERMINISM.md) — the hard rules and how they're verified.
- [DATA_SCHEMA.md](docs/DATA_SCHEMA.md) — content format.
- [CONVENTIONS.md](docs/CONVENTIONS.md) — stack, scripts, naming.
- [GLOSSARY.md](docs/GLOSSARY.md) — canonical names.
- [DEPLOY.md](docs/DEPLOY.md) — Cloudflare Pages (V1) + Workers/DO relay (V2).

## Hosting

Static PWA on Cloudflare Pages (`dist/`). No backend for single-player. Online multiplayer
(V2) will add a Cloudflare Workers + Durable Object lockstep relay. See `public/_headers`.
