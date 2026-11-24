# Phase 7 — two-browser multiplayer proof

Two independent Chromium contexts playing a real match through the real HUD, the real renderer and the
**unmodified v1 relay**.

## What was run

| | |
|---|---|
| Host | 1366×768 Chromebook context, mouse |
| Guest | 667×375 phone context, **touch enabled** (`hasTouch` + `isMobile`, CDP touch events) |
| Relay | `ws://127.0.0.1:8787` — `relay/server.mjs`, unmodified v1 code |
| Duration | 150 s of wall time, final tick **7592** |
| Result | 132 common ticks compared, **0 hash mismatches**, **0 desyncs** |

## What both peers actually did

Every step below went through the page's own controls — the Buildings and Units tabs, the production
tiles, the attack-move button and a tap on the canvas. Nothing was injected into the simulation.

| | Host | Guest |
|---|---|---|
| Commands issued | 8 | 16 |
| Structures built (verified in the sim) | 1 | 2 |
| Units queued | 3 | 3 |
| Attack-move marches | 4 | 11 |
| Damage events seen | 98 | 98 |
| Units at the end | 0 | 7 |

Combat first appears in the log at **tick ~3155** and the damage counter climbs 46 → 85 → 98 as the
armies meet and units die. Both peers report the identical figure at every sample, which is the
independent confirmation that the two simulations are the same world.

Both sides were funded through `devSetMana`, which is a **real protocol command** the relay's own zod
schema validates and every peer applies identically. Mutating mana locally would have desynced the peers
and proved nothing. The consequence is stated plainly: this is a proof of the multiplayer chain, not a
balance measurement — see `HANDOFF.md` §7.2.1.

## Files

| File | What it is |
|---|---|
| `browser-match.log` | The full timeline: every sample with tick, buildings, units and damage on both peers, every march, and the hash comparison. |
| `browser-match.json` | Start and final state for both peers, command/built/trained/march counts, damage, common-tick count and mismatch count. |
| `lobby-host-created.png` | The host's room, with the invite code and both copy buttons. |
| `lobby-guest-joined.png` | The guest, seated by the invite link. |
| `lobby-host-ready.png` | The host's view once the guest is ready and Start is enabled. |
| `match-host-start.png` / `match-guest-start.png` | Both peers at the start of the match. |
| `match-host-mid-build.png` / `match-guest-mid-build.png` | Mid-build, after the tech chain was placed. |
| `match-host-combat.png` / `match-guest-combat.png` | The first frame with damage dealt — the armies engaging. |
| `match-host-final.png` / `match-guest-final.png` | The end of the 150 s run. |

## How to reproduce

```bash
cd /agent/repos/wizz
node --experimental-strip-types relay/server.mjs &   # relay on :8787
cd v2 && npx vite --host 127.0.0.1 --port 5343 --strictPort &

MP_PLAY_SECONDS=150 npx playwright test tests/net/browser-match.spec.ts
```

The spec skips rather than fails when the relay or the app is absent, so it does not turn a plain unit run
into a false red.

## Against the live relay

The same client talks to the deployed relay. Verified from this VM with a real `join` against
`wss://wizzrts.up.railway.app`, which returned `player0` as host with a server-assigned seed:

```
recv {"t":"joined","connId":"98bfd381dcc7d489","playerId":"player0","seed":4219289120,"startTick":0,"isHost":true,...}
OK joined as player0 host=true seed=4219289120
```

The automated proof deliberately stays on the LOCAL relay so its timings are deterministic; the deployed
build resolves `wss://wizzrts.up.railway.app` by default (see `resolveRelayUrl`).
