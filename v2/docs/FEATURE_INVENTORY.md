# Arcane Dominion — v2 Feature Inventory

**Purpose.** This is the acceptance contract for the rebuild. If a row is checked `[x]`, v2
supports it and a test proves it. Nothing may be dropped without an explicit entry in
[`REBUILD_PLAN.md` §7](./REBUILD_PLAN.md#7-recommended-rule--design-changes) and Zachary's sign-off.

**Scope of the audit.** Branch `rebuild/v2`, taken from `main` @ `8786665`. Everything below was
read from source, executed headlessly, or measured — not inferred from READMEs.

**Audited surface**

| Metric | v1 value |
|---|---|
| Game source | 29,185 lines of TypeScript across 212 files in `src/` |
| Content | 10 units, 19 buildings, 4 spells, 6 projectile defs, 1 map, 4 match configs, 1 faction, 2 AI strategy JSONs |
| Simulation | 20 Hz fixed tick, 15 systems + an injected AI hook + sandbox cheats, in one frozen order |
| Commands / events | 23 gameplay commands + 12 dev commands, 27 event types |
| Tests | 65 Vitest files / 433 tests, 4 Playwright specs |
| Build | 828 KB `index.js` (230 KB gz) + 237 KB worker (52 KB gz); 6.4 MB dist incl. sourcemaps |
| Multiplayer | Lockstep over a WebSocket relay, 2–4 seats (sim itself allows 8) |

**How to read the tables.** `ID` is stable and referenced by the rebuild plan. `v1 evidence` is the
file that implements it today. `v2` is the checkbox we must tick.

---

## 1. App shell, boot, PWA

| ID | Feature | v1 evidence | v2 |
|---|---|---|---|
| APP-01 | Single-page boot: load data registry, load settings, construct audio, hand off to router | `src/main.ts` | [ ] |
| APP-02 | Full-screen fixed app shell that tracks `visualViewport` (URL-bar changes, safe areas) | `src/ui/viewport.ts` | [ ] |
| APP-03 | Landscape lock request (best effort) + "rotate your device" portrait overlay | `src/ui/orientation.ts` | [ ] |
| APP-04 | Compact-UI mode for short/small landscape screens (< 460 px tall or < 820 px wide) applied to `<html>` | `src/ui/viewport.ts` | [ ] |
| APP-05 | Installable PWA: manifest (fullscreen, landscape, 192/512 icons, maskable) | `vite.config.ts` | [ ] |
| APP-06 | Service worker with precache of app + data JSON, `cleanupOutdatedCaches`, `skipWaiting` | `vite.config.ts` | [ ] |
| APP-07 | Auto-update polling every 3 min + on focus + on visibility change | `src/pwa.ts` | [ ] |
| APP-08 | Correct cache headers (HTML/SW no-cache, `/assets/*` immutable) for Cloudflare and the Node server | `public/_headers`, `relay/static.mjs` | [ ] |
| APP-09 | Relative asset base (`base: './'`) so the app works under a Pages subpath | `vite.config.ts` | [ ] |
| APP-10 | Dev deep links: `?gallery=1`, `?sandbox=1`, `?scenario=<builtin-id>` | `src/ui/art-gallery.ts`, `src/sandbox/sandbox-config.ts` | [ ] |
| APP-11 | Graceful data-load failure (throws with file + field path) | `src/data/loader.ts` | [ ] |
| APP-12 | Static-only single-player deployment (no backend needed) | `docs/DEPLOY.md` | [ ] |

## 2. Menus & navigation

| ID | Feature | v1 evidence | v2 |
|---|---|---|---|
| MENU-01 | Main menu: title, subtitle, primary action list | `src/ui/screens.ts` | [ ] |
| MENU-02 | **Continue** — only shown when a resumable solo save exists; loads and resumes paused state | `src/app/app-router.ts` | [ ] |
| MENU-03 | **Rejoin Match** — only shown when a stored online session is < 30 min old | `src/storage/online-session.ts` | [ ] |
| MENU-04 | **Custom Game** → solo lobby | `src/ui/screens.ts` | [ ] |
| MENU-05 | Multiplayer group: **Create Online**, **Join Online** | `src/ui/screens.ts` | [ ] |
| MENU-06 | Developer group: **Entity Designs**, **Developer Sandbox** | `src/ui/screens.ts` | [ ] |
| MENU-07 | Join form with room code entry, validation, error echo, back | `src/ui/lobby.ts` | [ ] |
| MENU-08 | Screen teardown between routes (no leaking canvases/listeners/DOM) | `src/app/app-router.ts` | [ ] |

## 3. Lobby & match setup

### 3.1 Solo lobby

| ID | Feature | v1 evidence | v2 |
|---|---|---|---|
| LOB-01 | 4 slots as a row of panels: kind / team / start corner / ai difficulty / colour | `src/ui/match-lobby.ts` | [ ] |
| LOB-02 | Slot kinds: `closed`, `human`, `ai`, `open` | `src/lobby/types.ts` | [ ] |
| LOB-03 | Team assignment A–D (FFA = one team each, or shared letters for teams) | `src/lobby/teams.ts` | [ ] |
| LOB-04 | 4 team colours with swatches | `src/lobby/types.ts` | [ ] |
| LOB-05 | Start-corner picker: click a slot then a numbered spawn on the map preview | `src/ui/lobby-map-preview.ts` | [ ] |
| LOB-06 | Duplicate-corner prevention with a specific hint | `src/lobby/build-config.ts`, `src/lobby/start-hint.ts` | [ ] |
| LOB-07 | Map selector (from registry), faction selector (from registry) | `src/ui/match-lobby.ts` | [ ] |
| LOB-08 | Templates: **1v1 vs AI**, **FFA (4)**, **2v2 AI** | `src/lobby/templates.ts` | [ ] |
| LOB-09 | Toggle: eliminated players see the full map (`deadSpectatorReveal`) | `src/ui/match-lobby.ts` | [ ] |
| LOB-10 | Toggle: one superweapon per player | `src/ui/match-lobby.ts` | [ ] |
| LOB-11 | Economy pacing: **Standard** / **Tight** with an inline explanation of every changed number | `src/data/economy-pacing.ts` | [ ] |
| LOB-12 | Start button disabled with the reason until the lobby is valid (≥ 2 active, ≤ map max, all corners, unique, all claimed/ready in MP) | `src/lobby/build-config.ts` | [ ] |
| LOB-13 | Lobby coach card ("Pick a start") + Skip | `src/ui/coach/progress.ts` | [ ] |

### 3.2 Online lobby

| ID | Feature | v1 evidence | v2 |
|---|---|---|---|
| LOB-20 | Create room → 6-char uppercase code shown to share | `src/net/multiplayer.ts` | [ ] |
| LOB-21 | Join by code; auto-claim a free slot and auto-assign an unused corner | `relay/relay-app.mjs` | [ ] |
| LOB-22 | Host-only settings; guests edit only their own slot | `relay/relay-app.mjs` | [ ] |
| LOB-23 | Ready / Unready per guest; host always ready | `src/ui/match-lobby.ts` | [ ] |
| LOB-24 | Host start gated on all slots claimed + all ready, with precise error text | `relay/relay-app.mjs` | [ ] |
| LOB-25 | Live lobby state broadcast (slots, teams, colours, corners, options) | `src/net/lobby-wire.ts` | [ ] |
| LOB-26 | Claim-slot conflict resolution (no double-booking a slot or a corner) | `relay/relay-app.mjs` | [ ] |
| LOB-27 | Lobby full / match already started errors | `relay/relay-app.mjs` | [ ] |
| LOB-28 | Host leaving before start frees the room; room is GC'd when empty | `relay/relay-app.mjs` | [ ] |
| LOB-29 | Failed connection shows the lobby with the error rather than a dead screen | `src/app/app-router.ts` | [ ] |

## 4. In-match HUD

| ID | Feature | v1 evidence | v2 |
|---|---|---|---|
| HUD-01 | Top bar: Mana counter (integer, live) | `src/ui/hud.ts` | [ ] |
| HUD-02 | Top bar: Power `used/produced`, red + deficit when short, tooltip explaining the fix | `src/ui/hud.ts` | [ ] |
| HUD-03 | Top bar: spell chips with lock state, cooldown state, active-targeting state | `src/ui/hud/spell-bar.ts` | [ ] |
| HUD-04 | Top bar: Pause (solo only), Settings, hidden debug toggle | `src/ui/hud.ts` | [ ] |
| HUD-05 | Selection card: name, description, HP, and contextual meta (power draw, offline, slow, packing %, repairing, rally set, garrison n/m) | `src/ui/hud.ts` | [ ] |
| HUD-06 | Collapsible panels with remembered open state (Selection, Map) | `src/ui/hud/collapsible.ts` | [ ] |
| HUD-07 | Contextual panel router: placing / unit orders / producer / HQ build / nothing | `src/ui/hud.ts` | [ ] |
| HUD-08 | Info ⇄ Build tab switch on compact screens, single scroll container | `src/ui/hud.ts`, `src/ui/styles/hud.css` | [ ] |
| HUD-09 | Command menu for HQ and for a selected producer | `src/ui/hud/command-menu-panel.ts` | [ ] |
| HUD-10 | Build categories: Buildings / Defenses / Advanced | `src/ui/hud/menu-categories.ts` | [ ] |
| HUD-11 | Train categories: Workers / Small Troops / Large Troops / Wizards | `src/ui/hud/menu-categories.ts` | [ ] |
| HUD-12 | Build item: 2.5D icon, name, cost + power subtitle, accent stripe, affordable / locked / active states | `src/ui/hud/command-menu-panel.ts` | [ ] |
| HUD-13 | Building inspect card: cost, build time, HP, power, requirements (met/missing), what it unlocks, combat facts | `src/ui/hud/building-inspect.ts` | [ ] |
| HUD-14 | "Train at" producer chip row with queue counts and offline/slow flags | `src/ui/hud/producers.ts` | [ ] |
| HUD-15 | Train queue strip with per-item progress and cancel | `src/ui/hud/command-menu-panel.ts` | [ ] |
| HUD-16 | Unit orders: Deselect, Stop, Attack-Move, Move in Order | `src/ui/hud/unit-orders-panel.ts` | [ ] |
| HUD-17 | Contextual unit orders: Deploy (Waystone Wagon), Pack Up (Waystone Camp), Conjure/Stop conjuring (Mana Weaver), Garrison | `src/ui/hud/unit-orders-panel.ts` | [ ] |
| HUD-18 | Building actions: Sell, Repair, Rally, Unload garrison, Research (when data exists) | `src/ui/hud/building-actions-panel.ts` | [ ] |
| HUD-19 | Superweapon launch button with ready/charging state | `src/ui/hud/building-actions-panel.ts` | [ ] |
| HUD-20 | Superweapon status strip: per-player FIRING / countdown / READY | `src/ui/hud/superweapon-status.ts` | [ ] |
| HUD-21 | Minimap panel: canvas overview, tap/drag to move camera, viewport rectangle | `src/ui/minimap.ts` | [ ] |
| HUD-22 | Radar-off state: dashed/disabled minimap, "Radar off" label, and a build-this hint | `src/ui/radar-hint.ts`, `src/ui/hud.ts` | [ ] |
| HUD-23 | Placement confirm bar: Place/Cancel, cost (and wall-drag total), validity reason | `src/ui/hud.ts` | [ ] |
| HUD-24 | Spell confirm bar ("Cast spell?") for `requiresConfirm` spells | `src/ui/hud/spell-bar.ts` | [ ] |
| HUD-25 | Hint banner (transient, auto-hide) for tips, errors, reconnect, graphics drops | `src/ui/hud.ts` | [ ] |
| HUD-26 | First-match coach card: 4 steps (select HQ → place a building → move a wisp → radar & win), Got it / Skip tutorial | `src/ui/coach/progress.ts`, `src/ui/coach/card.ts` | [ ] |
| HUD-27 | Replay tutorial from Settings | `src/ui/hud/settings-screen.ts` | [ ] |
| HUD-28 | Pause overlay with Resume; blocks all input behind it | `src/ui/hud.ts`, `src/ui/styles/hud.css` | [ ] |
| HUD-29 | Result overlay: Victory / Defeat, "back to menu", post-game free camera | `src/ui/hud.ts` | [ ] |
| HUD-30 | Debug readout (fps, tick, entity count, selection count) | `src/ui/hud.ts` | [ ] |
| HUD-31 | Zoom slider with +/− buttons and draggable thumb | `src/ui/zoom-slider.ts` | [ ] |
| HUD-32 | Compact-phone HUD layout (short landscape): no clipped controls, wrapped category chips, thumb-reachable actions | `src/ui/styles/hud.css`, `tests/compact-ui.test.ts` | [ ] |
| HUD-33 | Touch scroll guards so HUD drags never pan the map | `src/ui/hud.ts` | [ ] |

## 5. Settings & persistence

| ID | Feature | v1 evidence | v2 |
|---|---|---|---|
| SET-01 | Mute toggle + volume 0–100 slider (live) | `src/ui/hud/settings-screen.ts` | [ ] |
| SET-02 | Show building names on the map | `src/ui/hud/settings-screen.ts`, `src/render/renderer.ts` | [ ] |
| SET-03 | Graphics quality: Auto / Low / Medium / High with a plain-language hint | `src/render/graphics-quality.ts` | [ ] |
| SET-04 | Show tips toggle + Replay tutorial | `src/ui/hud/settings-screen.ts` | [ ] |
| SET-05 | Leave match (with autosave) | `src/ui/hud/settings-screen.ts` | [ ] |
| SET-06 | Settings persisted across sessions (IndexedDB) | `src/storage/settings.ts` | [ ] |
| SET-07 | Auto quality fallback to Low after ~90 sustained < 24 fps frames (Auto mode only) | `src/app/game.ts` | [ ] |
| SET-08 | Drag behaviour preference (drag = box-select vs drag = pan) persisted | `src/storage/settings.ts` | [ ] (UI missing in v1 — see SET-20) |
| SET-20 | *Gap:* no settings entry on the main menu; `dragMode` has no UI | — | [ ] fix |

## 6. Controls

### 6.1 Touch

| ID | Feature | v1 evidence | v2 |
|---|---|---|---|
| INP-01 | Tap to select own unit/building | `src/input/gesture.ts` | [ ] |
| INP-02 | Tap enemy with combat units selected → attack | `src/input/modes/normal-mode.ts` | [ ] |
| INP-03 | Tap ground with units selected → move | `src/input/modes/normal-mode.ts` | [ ] |
| INP-04 | Tap mana node with wisp(s) selected → harvest | `src/input/modes/normal-mode.ts` | [ ] |
| INP-05 | Tap own bunker with garrisonable units selected → garrison | `src/input/modes/normal-mode.ts` | [ ] |
| INP-06 | Tap own building with harvesters selected → move (v1 bug; see BUG-02) | `src/input/modes/normal-mode.ts` | [ ] fix |
| INP-07 | Double-tap same unit type → select all of that type on screen | `src/input/modes/normal-mode.ts` | [ ] |
| INP-08 | Long-press + drag → box select | `src/input/gesture.ts` | [ ] |
| INP-09 | One-finger drag → pan (when nothing is being targeted) | `src/input/gesture.ts` | [ ] |
| INP-10 | Two-finger drag → pan; pinch → zoom | `src/input/gesture.ts` | [ ] |
| INP-11 | Drag-to-place walls in a line; per-tile validity preview | `src/input/modes/build-mode.ts` | [ ] |
| INP-12 | Placement ghost follows the finger while held | `src/app/match/pointer-binder.ts` | [ ] |
| INP-13 | Tap a map point to preview a building, then Place | `src/input/modes/build-mode.ts` | [ ] |
| INP-14 | Deploy: pick a spot, preview footprint, confirm | `src/input/modes/deploy-mode.ts` | [ ] |
| INP-15 | Rally point targeting mode | `src/input/modes/rally-mode.ts` | [ ] |
| INP-16 | Garrison targeting mode (pick a bunker) | `src/input/modes/garrison-mode.ts` | [ ] |
| INP-17 | Spell targeting with radius ring; group-target spells use the selection | `src/input/modes/spell-mode.ts` | [ ] |
| INP-18 | Superweapon mode: tap to launch, then tap to steer the beam | `src/input/modes/superweapon-mode.ts` | [ ] |

### 6.2 Desktop

| ID | Feature | v1 evidence | v2 |
|---|---|---|---|
| INP-30 | Left click select / issue context order | `src/app/match/pointer-binder.ts` | [ ] |
| INP-31 | Left drag box select | `src/input/gesture.ts` | [ ] |
| INP-32 | Middle-drag pan | `src/app/match/pointer-binder.ts` | [ ] |
| INP-33 | Wheel / two-finger touchpad scroll pan | `src/app/match/pointer-binder.ts` | [ ] |
| INP-34 | WASD / arrow-key pan with frame-rate-independent speed | `src/input/keyboard-controls.ts` | [ ] |
| INP-35 | Escape deselect/cancel; Enter confirm placement | `src/input/keyboard-controls.ts` | [ ] |
| INP-36 | Right click cancels targeting | `src/app/match/pointer-binder.ts` | [ ] |
| INP-37 | Hover-driven placement ghost for mouse/pen only | `src/app/match/pointer-binder.ts` | [ ] |
| INP-38 | Zoom slider (no wheel-zoom) | `src/ui/zoom-slider.ts` | [ ] |
| INP-39 | Control-action registry: every player-facing action declares a touch and/or keyboard binding; a test enforces it | `src/input/actions.ts`, `tests/input-parity.test.ts` | [ ] |
| INP-40 | *Gap:* `setStance` command exists but no UI/binding reaches it | `src/input/controller.ts` | [ ] decide (see RULE-07) |
| INP-41 | *Gap:* no shift-queued orders, no control groups, no idle-unit cycling, no "select all army" | — | [ ] add |
| INP-42 | *Gap:* right click never issues move/attack (desktop muscle memory) | `src/app/match/pointer-binder.ts` | [ ] add |

## 7. Simulation core & rules

### 7.1 Tick contract, commands, determinism

| ID | Feature | v1 evidence | v2 |
|---|---|---|---|
| SIM-01 | Fixed 20 Hz tick; render interpolates between ticks | `src/core/game-loop.ts`, `src/core/constants.ts` | [ ] |
| SIM-02 | 14 systems run in a documented, frozen order | `src/sim/step.ts` | [ ] |
| SIM-03 | All state mutation flows through the per-tick command queue | `src/sim/simulation.ts`, `src/sim/systems/apply-commands.ts` | [ ] |
| SIM-04 | AI runs after commands and queues its output for the next tick | `src/sim/step.ts` | [ ] |
| SIM-05 | Entities iterated in ascending id order everywhere state is mutated | `src/sim/queries.ts` | [ ] |
| SIM-06 | Seeded PRNG in `GameState` (mulberry32) — *present but never called by any system* | `src/sim/rng.ts` | [ ] fix (see BUG-09) |
| SIM-07 | No `Math.random` / `Date.now` / `performance` / DOM in `src/sim`, enforced by ESLint | `eslint.config.js` | [ ] |
| SIM-08 | `hashState()` over players, relations, entities, beams, RNG, morph/garrison/queue/journal state | `src/sim/sync-surface.ts` | [ ] |
| SIM-09 | Sim runs headless in Node for tests | `src/testing/headless.ts` | [ ] |
| SIM-10 | Sim runs in a Web Worker in solo **and** multiplayer | `src/app/sim.worker.ts`, `src/app/match/sim-controller.ts` | [ ] |
| SIM-11 | Incremental delta sync from worker to main thread (changed/removed entities) | `src/sim/sync-delta.ts` | [ ] |
| SIM-12 | Snapshot pack/unpack for worker init and multiplayer resync | `src/sim/state-transfer.ts` | [ ] |
| SIM-13 | Replay recorder (`tick → commands`) + serialized replay on desync | `src/sim/replay.ts` | [ ] |
| SIM-14 | `surrender` command → defeated + `playerDefeated` event | `src/sim/systems/commands/surrender.ts` | [ ] (see BUG-05) |
| SIM-15 | 12 dev commands (mana, spawn, destroy, hp, tech, clear, cast, research, add/remove/configure player) | `src/sim/types.ts` | [ ] |
| SIM-16 | Graceful fallback to main-thread sim if the worker cannot start | `src/app/match/sim-controller.ts` | [ ] |

### 7.2 Economy

| ID | Feature | v1 evidence | v2 |
|---|---|---|---|
| ECO-01 | Single resource: Mana. Starting amount 900 (600 in Tight) | `data/balance.json` | [ ] |
| ECO-02 | Wisp harvest loop: walk to node → siphon into carry → walk to nearest finished refinery → deposit | `src/sim/systems/harvest.ts` | [ ] |
| ECO-03 | Siphon rate 16/s **per wisp**, carry 75 (60 Tight) | `data/balance.json` | [ ] |
| ECO-04 | Mana node reserve, capped to 12,000 (8,000 Tight); node depletes and is removed at 0 | `src/sim/factory.ts`, `src/sim/systems/death.ts` | [ ] |
| ECO-05 | Node reserve always visible (terrain feature); reserve % ring/bar/label only when in sight | `src/render/renderer.ts`, `src/sim/fog.ts` | [ ] |
| ECO-06 | Wisp auto-repicks the nearest live node when its node empties | `src/sim/systems/harvest.ts` | [ ] |
| ECO-07 | Deposit requires the refinery to be powered | `src/sim/systems/harvest.ts` | [ ] |
| ECO-08 | Resonance Vault grants a 1.3× siphon multiplier once built (permanent unlock) | `src/sim/systems/harvest.ts` | [ ] |
| ECO-09 | Mana Weaver conjures 6 mana every 3 s while channeling (4 / 4 s Tight) | `src/sim/systems/channel.ts` | [ ] |
| ECO-10 | Sell building refunds 50 % of cost | `src/sim/systems/commands/build.ts` | [ ] |
| ECO-11 | Repair: 2 HP/tick at 0.05 mana/HP, auto-stops when unaffordable or full | `src/sim/systems/production.ts` | [ ] |
| ECO-12 | Construction cost is deducted up front; unit cost deducted at queue time with refund on cancel | `src/sim/systems/commands/production.ts` | [ ] |
| ECO-13 | Tight economy preset: exact numbers documented in the lobby | `src/data/economy-pacing.ts` | [ ] |
| ECO-14 | *Gap:* `MAX_UNITS_PER_PLAYER = 90` is declared and never enforced; no unit cap at all | `src/core/constants.ts` | [ ] fix (RULE-03) |

### 7.3 Power

| ID | Feature | v1 evidence | v2 |
|---|---|---|---|
| PWR-01 | Per-player `power` (produced) vs `powerUsed` | `src/sim/factory.ts` | [ ] |
| PWR-02 | Sanctum +20, Ley Conduit +60, Waystone Camp +15 | `data/buildings/*.json` | [ ] |
| PWR-03 | Low power ⇒ turrets / radar / auras go fully offline (dimmed + red X + ring) | `src/sim/power.ts`, `src/render/renderer.ts` | [ ] |
| PWR-04 | Low power ⇒ production and construction speed scale to `max(0.1, power/used)` | `src/sim/power.ts` | [ ] |
| PWR-05 | Low power ⇒ buildings stop providing vision | `src/sim/fog.ts` | [ ] |
| PWR-06 | HUD shows used/produced + deficit and explains the fix | `src/ui/hud.ts` | [ ] |
| PWR-07 | Power recomputed on build/sell/death/morph only (not per tick) | `src/sim/factory.ts` | [ ] |

### 7.4 Tech gating

| ID | Feature | v1 evidence | v2 |
|---|---|---|---|
| TEC-01 | `unlockedTech` accumulates building defIds as they **complete** (not when placed) | `src/sim/systems/production.ts` | [ ] |
| TEC-02 | Build/train buttons gate on `requires` with Locked/Needs-… copy | `src/ui/hud/command-menu-panel.ts` | [ ] |
| TEC-03 | Attunement Spire is mandatory before any other structure (validated at data load) | `src/data/validate-registry.ts` | [ ] |
| TEC-04 | Arcane Nexus is the late-tech hub (units, defenses, superweapon) | `data/buildings/arcane_nexus.json` | [ ] |
| TEC-05 | *Gap:* tech stays unlocked after the granting building is destroyed or sold | `src/sim/systems/production.ts` | [ ] fix (RULE-01) |
| TEC-06 | *Gap:* a full research system (queues, modifiers, UI) exists but `data/research/` is empty — dead feature | `src/sim/modifiers.ts`, `src/sim/systems/commands/research.ts` | [ ] implement or delete (RULE-08) |

### 7.5 Production

| ID | Feature | v1 evidence | v2 |
|---|---|---|---|
| PRO-01 | Per-building unit queue with progress scaled by power | `src/sim/systems/production.ts` | [ ] |
| PRO-02 | Research queue with the same mechanism (dormant, see TEC-06) | `src/sim/systems/production.ts` | [ ] |
| PRO-03 | Rally point per producer; new units move to it on spawn | `src/sim/systems/production.ts` | [ ] |
| PRO-04 | Safe spawn search: 16 directions × 8 rings, then nearest passable fallback | `src/sim/systems/production.ts` | [ ] |
| PRO-05 | Free Wisp spawned when an Attunement Spire completes | `data/buildings/attunement_spire.json` | [ ] |
| PRO-06 | Cancel queue item refunds full cost | `src/sim/systems/commands/production.ts` | [ ] |
| PRO-07 | *Gap:* unlimited queue length (30 clicks = 30 units, mana locked up) | `src/sim/systems/commands/production.ts` | [ ] fix (RULE-09) |

### 7.6 Construction & placement

| ID | Feature | v1 evidence | v2 |
|---|---|---|---|
| CON-01 | RA2 build zone: every footprint tile within 7 tiles (Chebyshev) of any own structure | `src/sim/build-zone.ts` | [ ] |
| CON-02 | Occupancy + spacing rules (structures share edges; walls/defenses always touch) | `src/sim/nav-grid.ts`, `src/core/placement-spacing.ts` | [ ] |
| CON-03 | Cannot build on a mana node | `src/sim/resource-nodes.ts` | [ ] |
| CON-04 | Footprints must sit on one level (ramps may bridge ±1) | `src/sim/nav-grid.ts` | [ ] |
| CON-05 | Per-tile placement classification (ok / blocked / range / node / cliff) rendered in the ghost | `src/sim/placement-preview.ts`, `src/render/placement-draw.ts` | [ ] |
| CON-06 | Build-zone tiles highlighted while placing | `src/render/placement-draw.ts` | [ ] |
| CON-07 | Construction animation progress; HP ramps from 10 % to 100 %; tech unlocks on completion | `src/sim/systems/production.ts` | [ ] |
| CON-08 | Sell (blocked if garrisoned or queueing) and repair toggles | `src/sim/systems/commands/build.ts` | [ ] |
| CON-09 | Wall line-drag placement with a running cost total | `src/input/modes/build-mode.ts` | [ ] |

### 7.7 Combat

| ID | Feature | v1 evidence | v2 |
|---|---|---|---|
| CMB-01 | Armor classes `light` / `heavy` / `building` with per-weapon `vs` multipliers | `data/units/*.json` | [ ] |
| CMB-02 | Instant melee, homing projectiles, splash, chain lightning, continuous beams, charged artillery | `src/sim/systems/combat.ts`, `beam-weapon.ts` | [ ] |
| CMB-03 | Projectiles home on their target and die if the target dies/garrisons | `src/sim/systems/projectile.ts` | [ ] |
| CMB-04 | Target acquisition: nearest by default, swarm-density preference, min/max range bands | `src/sim/systems/combat.ts` | [ ] |
| CMB-05 | Smooth turret tracking with arc-limited fire (Arcane Sentry) | `src/sim/systems/combat.ts` | [ ] |
| CMB-06 | 60-tick charge-up tell before Celestial Cannon fire | `src/sim/systems/combat.ts` | [ ] |
| CMB-07 | Frost slow stacks by exposure and decays after leaving the beam | `src/sim/systems/beam-weapon.ts` | [ ] |
| CMB-08 | Inferno lingering burn after leaving the cone | `src/sim/systems/beam-weapon.ts` | [ ] |
| CMB-09 | Aegis buff = temporary invulnerability (all damage ignored) | `src/sim/combat-util.ts` | [ ] |
| CMB-10 | Aggressive units auto-acquire within sight and chase | `src/sim/systems/combat.ts` | [ ] |
| CMB-11 | Stances: aggressive / stand-ground (`hold` declared but unreachable) | `src/sim/types.ts` | [ ] decide (RULE-07) |
| CMB-12 | Attack, attack-move, move, move-in-order (group-speed clamped) | `src/sim/systems/commands/orders.ts` | [ ] |
| CMB-13 | `underAttack` alert event emitted on damage | `src/sim/combat-util.ts` | [ ] (throttle — BUG-10) |
| CMB-14 | Building weapons offline when the grid is short | `src/sim/systems/combat.ts` | [ ] |
| CMB-15 | Air units only hittable by weapons with `targetsAir` | `src/sim/mobility.ts` | [ ] |

### 7.8 Height, cliffs, ramps (RA2-style)

| ID | Feature | v1 evidence | v2 |
|---|---|---|---|
| HGT-01 | Per-tile integer height field (0..n) in map data | `data/maps/duel_glade.json` | [ ] |
| HGT-02 | Tile codes: ground 0, blocked/cliff 1, ramp 2 | `src/core/constants.ts` | [ ] |
| HGT-03 | Ground movement may change height by 1 only through a ramp tile | `src/sim/nav-grid.ts` | [ ] |
| HGT-04 | Continuous ramp surface height used for visuals and screen picking | `src/core/ramp-slope.ts`, `src/core/coords.ts` | [ ] |
| HGT-05 | High ground grants +32 range (one tile) | `src/sim/systems/combat.ts` | [ ] |
| HGT-06 | Ground units cannot shoot up a cliff (ramp exempt) | `src/sim/systems/combat.ts` | [ ] |
| HGT-07 | Lower ground cannot see higher ground except via ramps | `src/sim/fog.ts` | [ ] |
| HGT-08 | Cliff faces, rim highlights, ramp slope + hatch rendering | `src/render/terrain-draw.ts` | [ ] |
| HGT-09 | Buildings cannot straddle a cliff; ramps may bridge | `src/sim/nav-grid.ts` | [ ] |
| HGT-10 | Flyers ignore terrain height, hover 2 visual levels, and see over cliffs | `src/sim/fog.ts`, `src/core/projection.ts` | [ ] |

### 7.9 Fog of war, vision, radar

| ID | Feature | v1 evidence | v2 |
|---|---|---|---|
| FOG-01 | Per-player `visible` + `explored` tile masks, recomputed every tick | `src/sim/fog.ts` | [ ] |
| FOG-02 | Allied vision is shared | `src/sim/fog.ts` | [ ] |
| FOG-03 | Terrain and mana nodes always render; enemy units need line of sight | `src/render/renderer.ts` | [ ] |
| FOG-04 | Scouted enemy buildings leave a frozen grey ghost when out of sight | `src/sim/fog.ts`, `src/render/renderer.ts` | [ ] |
| FOG-05 | Ghosts are removed when the viewer re-scouts the spot and the building is gone | `src/sim/fog.ts` | [ ] |
| FOG-06 | Radar (Scrying Obelisk) gates the minimap only, not the main view | `src/sim/fog.ts` | [ ] |
| FOG-07 | Radar needs power; low power shuts the minimap off with a hint | `src/sim/fog.ts`, `src/ui/radar-hint.ts` | [ ] |
| FOG-08 | Fog rendered as merged runs with a geometry cache keyed on visibility + view bounds | `src/render/fog-draw.ts` | [ ] |
| FOG-09 | Post-game / dead-spectator / sandbox full reveal paths | `src/sim/fog.ts` | [ ] |

### 7.10 Spells & superweapon

| ID | Feature | v1 evidence | v2 |
|---|---|---|---|
| SPL-01 | Meteor Storm: 220 area damage, r90, 1800-tick cooldown, two-step confirm | `data/spells/meteor_storm.json` | [ ] |
| SPL-02 | Aegis Ward: 200-tick invulnerability on selected units, 1200-tick cooldown | `data/spells/aegis_ward.json` | [ ] |
| SPL-03 | Blink Gate: teleports selected units to a point, 900-tick cooldown | `data/spells/blink_gate.json` | [ ] |
| SPL-04 | Astral Lance: 100-tick charge, then a 300-tick steerable 48-radius beam at 60 u/s, 4800-tick cooldown | `data/spells/astral_lance.json`, `src/sim/systems/superweapon.ts` | [ ] |
| SPL-05 | Astral Spire (4500 mana / 45 s) unlocks all four spells and their cooldowns | `data/buildings/astral_spire.json` | [ ] |
| SPL-06 | One superweapon per player (lobby toggle) | `src/sim/systems/commands/build.ts` | [ ] |
| SPL-07 | Spell chips show lock/cooldown/active; superweapon shows a live countdown strip | `src/ui/hud/spell-bar.ts` | [ ] |
| SPL-08 | Beam charging ring → firing beam + steer-by-tap | `src/render/renderer.ts`, `src/input/modes/superweapon-mode.ts` | [ ] |

### 7.11 Garrison, air, mobile HQ

| ID | Feature | v1 evidence | v2 |
|---|---|---|---|
| GAR-01 | Arcane Bunker: 4 slots, archers and storm casters only, +20 range, fires from inside | `data/buildings/arcane_bunker.json`, `src/sim/systems/garrison.ts` | [ ] |
| GAR-02 | Occupants take 50 % max-HP damage and are ejected when the host dies | `src/sim/systems/death.ts` | [ ] |
| GAR-03 | Capacity reservations while walking in; unload all or a subset | `src/sim/systems/commands/garrison.ts` | [ ] |
| GAR-04 | Unload finds a safe spawn position around the host | `src/sim/systems/commands/garrison.ts` | [ ] |
| AIR-01 | Rift Skimmer: air mobility, hits air + ground, 108 speed, 86 range | `data/units/rift_skimmer.json` | [ ] |
| AIR-02 | Air units path straight and ignore ground blockers/terrain height | `src/sim/mobility.ts` | [ ] |
| MHQ-01 | Waystone Wagon (2000 mana / 22 s) built at the Golem Forge | `data/units/waystone_wagon.json` | [ ] |
| MHQ-02 | Deploy: 12 s morph into a Waystone Camp at a chosen clear spot (keeps HP %) | `src/sim/systems/morph.ts` | [ ] |
| MHQ-03 | Waystone Camp is a construction yard (+15 power, 200 sight, 1400 HP) that counts as an HQ | `data/buildings/waystone_camp.json` | [ ] |
| MHQ-04 | Pack: 10 s morph back into a wagon (blocked while a queue is active) | `src/sim/systems/morph.ts` | [ ] |
| MHQ-05 | HUD Deploy / Pack Up buttons appear only when legal | `src/ui/hud/unit-orders-panel.ts` | [ ] |

### 7.12 Win / loss

| ID | Feature | v1 evidence | v2 |
|---|---|---|---|
| WIN-01 | Losing every HQ (Sanctum or Waystone Camp) eliminates a player and purges their units/buildings | `src/sim/systems/wincheck.ts`, `src/sim/factory.ts` | [ ] |
| WIN-02 | Match ends when one team remains; `winnerTeam` recorded; result overlay | `src/sim/systems/wincheck.ts` | [ ] |
| WIN-03 | Post-game free camera + reveal-all | `src/app/game.ts`, `src/sim/fog.ts` | [ ] |
| WIN-04 | 2–8 players, teams or FFA, driven by relations (no hard-coded 1v1) | `src/sim/queries.ts` | [ ] |

## 8. Content parity (every def must exist and be reachable in v2)

### 8.1 Units (10)

| ID | Name | Cost | HP | Armor | Speed | Range | Role | v2 |
|---|---|---|---|---|---|---|---|---|
| CNT-U01 | Wisp | 200 | 120 | light | 72 | — | harvester, carry 75 | [ ] |
| CNT-U02 | Mana Weaver | 350 | 90 | light | 52 | — | conjurer (6 mana / 3 s) | [ ] |
| CNT-U03 | Imp Swarmling | 140 | 90 | light | 88 | 18 | cheap melee, ×1.0 light | [ ] |
| CNT-U04 | Arcane Archer | 210 | 70 | light | 62 | 132 | ranged, ×1.2 light, hits air | [ ] |
| CNT-U05 | Rift Familiar | 125 | 60 | light | 124 | 18 | fast scout, sight 210 | [ ] |
| CNT-U06 | Stone Golem | 560 | 600 | heavy | 42 | 26 | heavy melee, ×1.5 building | [ ] |
| CNT-U07 | Storm Caster | 700 | 160 | light | 52 | 142 | splash 42, ×1.3 light, hits air | [ ] |
| CNT-U08 | Rift Skimmer | 360 | 85 | light | 108 | 86 | air harass, ×1.25 light | [ ] |
| CNT-U09 | Siege Behemoth | 980 | 500 | heavy | 34 | 155 | siege, splash 32, ×2.5 building | [ ] |
| CNT-U10 | Waystone Wagon | 2000 | 500 | heavy | 20 | — | mobile HQ → Camp | [ ] |

### 8.2 Buildings (19)

| ID | Name | Cost | Build | HP | Footprint | Power | Key behaviour | v2 |
|---|---|---|---|---|---|---|---|---|
| CNT-B01 | Sanctum | 0 | — | 2000 | 3 | +20 | construction yard, HQ, sight 220 | [ ] |
| CNT-B02 | Attunement Spire | 750 | 8 s | 900 | 2 | −10 | refinery, trains Wisps, free Wisp | [ ] |
| CNT-B03 | Ley Conduit | 300 | 6 s | 500 | 2 | +60 | power plant | [ ] |
| CNT-B04 | Resonance Vault | 1100 | 14 s | 1000 | 2 | −20 | 1.3× siphon, trains Mana Weavers | [ ] |
| CNT-B05 | Summoning Circle | 550 | 8 s | 700 | 2 | −20 | trains all infantry + air | [ ] |
| CNT-B06 | Golem Forge | 850 | 12 s | 900 | 3 | −40 | heavies + Waystone Wagon | [ ] |
| CNT-B07 | Arcane Nexus | 1200 | 14 s | 800 | 2 | −50 | late tech hub | [ ] |
| CNT-B08 | Scrying Obelisk | 400 | 7 s | 450 | 2 | −15 | radar (minimap) while powered | [ ] |
| CNT-B09 | Arcane Sentry | 250 | 5 s | 600 | 1 | −20 | sustained-fire turret, 3 dmg / 2 t, 165 r, arc 60° | [ ] |
| CNT-B10 | Arcane Bunker | 320 | 7 s | 850 | 2 | — | garrison 4, +20 range | [ ] |
| CNT-B11 | Stone Wall | 40 | 2 s | 350 | 1 | — | blocks movement | [ ] |
| CNT-B12 | Arcane Gate | 60 | 3 s | 400 | 1 | — | allies pass, enemies blocked | [ ] |
| CNT-B13 | Frost Spire | 650 | 10 s | 650 | 2 | −30 | frost beam, exposure slow | [ ] |
| CNT-B14 | Inferno Beacon | 800 | 12 s | 700 | 2 | −40 | flame cone, prefers swarms, lingering burn | [ ] |
| CNT-B15 | Storm Conductor | 1100 | 15 s | 850 | 2 | −50 | chain lightning 3 jumps, ground only | [ ] |
| CNT-B16 | Sanctuary Spire | 900 | 14 s | 700 | 2 | −45 | heal aura r150 @ 0.4 HP/tick | [ ] |
| CNT-B17 | Celestial Cannon | 2200 | 28 s | 900 | 3 | −90 | 420 range, min 120, 60-t charge, 180 dmg r90 | [ ] |
| CNT-B18 | Astral Spire | 4500 | 45 s | 1200 | 3 | −100 | superweapon, unlocks 4 spells | [ ] |
| CNT-B19 | Waystone Camp | 0 | — | 1400 | 3 | +15 | deployed mobile HQ, packable | [ ] |

### 8.3 Spells (4), projectiles (6), maps, factions, match configs

| ID | Item | v2 |
|---|---|---|
| CNT-S01 | Meteor Storm | [ ] |
| CNT-S02 | Aegis Ward | [ ] |
| CNT-S03 | Blink Gate | [ ] |
| CNT-S04 | Astral Lance | [ ] |
| CNT-P01 | arcane_bolt (used by archer, skimmer, sentry) | [ ] |
| CNT-P02 | siege_shard (used by behemoth) | [ ] |
| CNT-P03 | storm_orb (used by caster) | [ ] |
| CNT-P04 | frost_bolt (defined, **unused** in v1) | [ ] decide (RULE-11) |
| CNT-P05 | inferno_orb (defined, **unused**) | [ ] decide |
| CNT-P06 | celestial_shot (defined, **unused** since the cannon became a sky beam) | [ ] decide |
| CNT-M01 | Duel Glade — 128×88, 4 corner plateaus with ramps, centre plateau with 2 ramps, 4 rock clusters, 13 mana nodes (4×25 000 capped to 12 000, 9×3 000) | [ ] |
| CNT-F01 | Faction `arcane` ("Arcane Dominion") | [ ] |
| CNT-C01 | `skirmish_1v1` (human vs normal AI, corners 0/3) | [ ] |
| CNT-C02 | `skirmish_1v1_rush` (AI on `arcane_rush`) | [ ] |
| CNT-C03 | `skirmish_1v1_online` (2 humans) | [ ] |
| CNT-C04 | `ffa_4` (human + easy/normal/hard, corners 0–3) | [ ] |

## 9. AI

| ID | Feature | v1 evidence | v2 |
|---|---|---|---|
| AI-01 | Three difficulty levels with distinct profiles | `src/ai/difficulty.ts` | [ ] |
| AI-02 | Difficulty hints surfaced in the lobby | `src/ai/difficulty.ts` | [ ] |
| AI-03 | Decision cadence throttled per difficulty (20 / 15 / 10 ticks) and staggered per player | `src/ai/controller.ts` | [ ] |
| AI-04 | Data-driven build order (JSON) | `data/ai/*.json` | [ ] |
| AI-05 | Data-driven production roles (army rotation, air, siege, expand unit) | `data/ai/*.json` | [ ] |
| AI-06 | Two named strategies (`arcane_standard`, `arcane_rush`) selectable per player | `data/ai/*.json` | [ ] |
| AI-07 | Worker assignment with per-node spreading and threat avoidance | `src/ai/behaviors.ts` | [ ] |
| AI-08 | Wisp flee when enemies are near | `src/ai/behaviors.ts` | [ ] |
| AI-09 | Repair damaged buildings by priority | `src/ai/behaviors.ts` | [ ] |
| AI-10 | Mana Weavers trained and parked on conjure duty | `src/ai/behaviors.ts` | [ ] |
| AI-11 | Army production with queue limits and affordability checks | `src/ai/behaviors.ts` | [ ] |
| AI-12 | Air harass against workers/refineries | `src/ai/behaviors.ts` | [ ] |
| AI-13 | Scouting with a dedicated scout unit and rotating probe points | `src/ai/behaviors.ts`, `src/ai/intel.ts` | [ ] |
| AI-14 | Defense response with a configurable fraction of the army | `src/ai/behaviors.ts` | [ ] |
| AI-15 | Garrison archers into bunkers | `src/ai/shared.ts` | [ ] |
| AI-16 | Wounded-unit retreat threshold | `src/ai/behaviors.ts` | [ ] |
| AI-17 | Army massing at a staging point before pushing | `src/ai/behaviors.ts` | [ ] |
| AI-18 | Multi-axis attacks (1–3 approach lanes) | `src/ai/shared.ts` | [ ] |
| AI-19 | Siege units prioritise defenses | `src/ai/behaviors.ts` | [ ] |
| AI-20 | Expansion: build a wagon, drive to a far node, deploy, develop with spire/conduit/turret/bunker | `src/ai/expand.ts` | [ ] |
| AI-21 | Home guards parked on expansion camps | `src/ai/behaviors.ts` | [ ] |
| AI-22 | Superweapon: build the spire, aim the lance, steer a live beam | `src/ai/behaviors.ts` | [ ] |
| AI-23 | Utility spells: Meteor on clusters, Aegis on the army, Blink on siege | `src/ai/behaviors.ts` | [ ] |
| AI-24 | Threat scoring and focus fire | `src/ai/intel.ts` | [ ] |
| AI-25 | Attack objective selection by distance + per-building bias | `src/ai/intel.ts` | [ ] |
| AI-26 | Three intel modes (probe / memory / omniscient) | `src/ai/difficulty.ts` | [ ] redesign (RULE-05) |
| AI-27 | Late-game "commit" switch at 10 minutes | `src/ai/difficulty.ts` | [ ] redesign |
| AI-28 | Deterministic decision "sloppiness" via hashed rolls | `src/ai/chance.ts` | [ ] redesign (BUG-04) |
| AI-29 | Power-short emergency Ley Conduit | `src/ai/strategies/config-driven-strategy.ts` | [ ] |
| AI-30 | Extra production buildings beyond the first | `src/ai/strategies/config-driven-strategy.ts` | [ ] |
| AI-31 | Advanced defense ladder once the Nexus exists | `src/ai/strategies/config-driven-strategy.ts` | [ ] |
| AI-32 | Rally point set toward the attack objective | `src/ai/strategies/config-driven-strategy.ts` | [ ] |

## 10. Rendering & VFX

| ID | Feature | v1 evidence | v2 |
|---|---|---|---|
| RND-01 | PixiJS renderer, WebGL with WebGPU fallback | `src/render/renderer.ts` | [ ] |
| RND-02 | Dimetric 2.5D projection (0.5 / 0.25) as the only camera; single world↔screen module | `src/core/projection.ts` | [ ] |
| RND-03 | Depth sorting by projected Y; entities occlude correctly | `src/render/renderer.ts` | [ ] |
| RND-04 | Procedural voxel-box sprites from `art.shape` / `art.sprite`, 8 facings, per-team-colour bake, cached textures | `src/render/shape-sprite.ts` | [ ] |
| RND-05 | Terrain: drop walls, rim light/shade, ramp slopes + hatch, cliff blocks | `src/render/terrain-draw.ts` | [ ] |
| RND-06 | Interpolated motion between ticks + exponential display smoothing | `src/render/renderer.ts` | [ ] |
| RND-07 | Shadows, selection rings, HP bars, build/morph bars, carry dot, slow icon | `src/render/renderer.ts` | [ ] |
| RND-08 | Occluded own-unit markers behind buildings | `src/render/unit-occlusion.ts` | [ ] |
| RND-09 | Placement ghost (valid/invalid tint, per-cell classification), build-zone tiles, rally marker, spell radius | `src/render/placement-draw.ts` | [ ] |
| RND-10 | Fog veil with geometry caching | `src/render/fog-draw.ts` | [ ] |
| RND-11 | Bespoke VFX per signature building: Arcane Sentry, Storm Conductor, Celestial Cannon, Sanctuary Spire, Astral Spire | `src/render/*-vfx.ts` | [ ] |
| RND-12 | Continuous tower beams (frost, flame) with wobble | `src/render/tower-beams.ts` | [ ] |
| RND-13 | Attack tells (lunge / bolt / slam) tied to cooldown phase | `src/render/attack-fx.ts` | [ ] |
| RND-14 | Pooled generic effects (flash, puff, ring, spark, shockwave, strike) | `src/render/effects.ts` | [ ] |
| RND-15 | Camera: clamped pan with overscroll, zoom 0.4–2.0, micro-shake on big hits | `src/render/camera.ts` | [ ] |
| RND-16 | Minimap 2D canvas (terrain, fog, entities, ghosts, viewport rect) | `src/ui/minimap.ts` | [ ] |
| RND-17 | Quality profiles: resolution cap, AA, texture res, shadows, occlusion, VFX density, effect cap, cheap fog | `src/render/graphics-quality.ts` | [ ] |
| RND-18 | HUD icons extracted from the same 2.5D textures the world uses | `src/render/renderer.ts` | [ ] |

## 11. Audio

| ID | Feature | v1 evidence | v2 |
|---|---|---|---|
| AUD-01 | Procedural Web Audio (no binary assets), unlocked on first pointer input | `src/audio/audio.ts` | [ ] |
| AUD-02 | Event → voice map with per-type throttling | `src/audio/audio.ts` | [ ] |
| AUD-03 | Master volume + mute | `src/audio/audio.ts` | [ ] |
| AUD-04 | Arcane Sentry: acquire blip, per-crystal bolt pitches, impact tink, idle hum that rises in combat | `src/render/arcane-sentry-vfx.ts` | [ ] |
| AUD-05 | Storm Conductor: charge whine, primary crack, descending chain zaps, idle ticks | `src/render/storm-conductor-vfx.ts` | [ ] |
| AUD-06 | Celestial Cannon: charge drone, sky-connect, impact boom + ring | `src/render/celestial-cannon-vfx.ts` | [ ] |
| AUD-07 | Sanctuary Spire: idle pad, anticipation, pulse swell, first-entry blessing, aura shimmer | `src/render/sanctuary-spire-vfx.ts` | [ ] |
| AUD-08 | Loops are stopped on match exit | `src/app/game.ts` | [ ] |

## 12. Entity Designs gallery

| ID | Feature | v1 evidence | v2 |
|---|---|---|---|
| GAL-01 | Full-screen gallery with back | `src/ui/art-gallery.ts` | [ ] |
| GAL-02 | Sections: Troops / Defenses / Buildings; sorted by name | `src/ui/art-gallery.ts` | [ ] |
| GAL-03 | Three team colours, switchable, re-renders all cards | `src/ui/art-gallery.ts` | [ ] |
| GAL-04 | Per card: 2.5D world texture + HUD icon side by side, name, id, accent swatch | `src/ui/art-gallery.ts` | [ ] |
| GAL-05 | Live troop previews: combat (with a sensible dummy target), harvest, conjure, deploy, move | `src/ui/gallery-preview-scene.ts` | [ ] |
| GAL-06 | Live defense previews: combat, heal, garrison — real renderer + real sim in a mini scene | `src/ui/defense-combat-preview.ts` | [ ] |
| GAL-07 | Preview camera framing, zoom 2.4, auto-reset every 360 ticks, close/back | `src/ui/defense-combat-preview.ts` | [ ] |
| GAL-08 | Gallery audio matches the match audio for those buildings | `src/ui/defense-combat-preview.ts` | [ ] |
| GAL-09 | Works on phones (scrollable grid, tap to preview) | `src/ui/styles/art-gallery.css` | [ ] |

## 13. Developer sandbox

| ID | Feature | v1 evidence | v2 |
|---|---|---|---|
| SBX-01 | Opens from the menu or `?sandbox=1`; own banner; no coach; no autosave | `src/sandbox/sandbox-config.ts` | [ ] |
| SBX-02 | 10 tabs: Economy, Units, Build, AI, Map, Play, Spells, Combat, Save, Debug | `src/sandbox/ui/sandbox-panel.ts` | [ ] |
| SBX-03 | Economy cheats: set/add mana, infinite mana, infinite power, no costs, instant build/produce/research, ignore tech | `src/sim/sandbox-types.ts` | [ ] |
| SBX-04 | Unit spawn with def picker and count | `src/sandbox/sandbox-controller.ts` | [ ] |
| SBX-05 | Building spawn (complete or under construction), ignore placement rules | `src/sandbox/sandbox-controller.ts` | [ ] |
| SBX-06 | AI controls: pause, disable, force attack/defend/expand, reveal intel, switch controlled player | `src/sandbox/ai-director.ts` | [ ] |
| SBX-07 | Map controls: fog on/off, reveal map | `src/sim/sandbox-flags.ts` | [ ] |
| SBX-08 | Playback: pause, single-step tick, time scale | `src/sandbox/ui/sandbox-panel.ts` | [ ] |
| SBX-09 | Spell casting without cooldown/cost | `src/sim/sandbox-flags.ts` | [ ] |
| SBX-10 | Combat: clear all units, damage/kill selections | `src/sandbox/sandbox-controller.ts` | [ ] |
| SBX-11 | Command palette: 12+ commands with params, aliases, autocomplete, history, favourites | `src/sandbox/ui/command-palette.ts`, `src/sandbox/command-registry.ts` | [ ] |
| SBX-12 | Scenario save/load to IndexedDB, built-in scenarios, `?scenario=` link | `src/sandbox/scenario-store.ts`, `src/sandbox/builtin-scenarios.ts` | [ ] |
| SBX-13 | Debug overlays: nav grid, pathfinding, collision, vision radius, attack radius, cooldowns, footprints, ids, targets, AI state, fps/frame-time/memory | `src/sandbox/overlays/build-debug-overlay.ts` | [ ] |
| SBX-14 | Touch-friendly panel (FAB, collapsible, filter) | `src/sandbox/ui/touch.ts` | [ ] |

## 14. Networking & multiplayer

| ID | Feature | v1 evidence | v2 |
|---|---|---|---|
| NET-01 | Lockstep: every peer runs the identical sim; relay only merges and broadcasts commands | `src/net/lockstep.ts` | [ ] |
| NET-02 | Input delay of 6 ticks before a command executes | `src/net/protocol.ts` | [ ] |
| NET-03 | Per-tick command merge, sorted by player id for determinism | `relay/relay-app.mjs` | [ ] |
| NET-04 | Peer-paced relay clock: never more than 60 ticks (3 s) ahead of the slowest peer | `relay/relay-app.mjs` | [ ] |
| NET-05 | Client progress acks, throttled | `src/net/lockstep.ts` | [ ] |
| NET-06 | Stalled peer dropped from pacing after 15 s (survives 5–8 s wifi blips) | `protocol-constants.json` | [ ] |
| NET-07 | Checksum every 60 ticks, peer checksums relayed, desync detected | `src/app/match/sim-controller.ts` | [ ] |
| NET-08 | Snapshot request → host state → peer jumps forward instead of replaying | `src/app/match/sim-controller.ts` | [ ] |
| NET-09 | Catch-up bounds: 12 ms per frame, 60 ticks per worker batch | `protocol-constants.json` | [ ] |
| NET-10 | "Syncing…" hint while far behind; stall banner after 10 s with a real message | `src/net/lockstep-stall.ts` | [ ] |
| NET-11 | Hidden tab never flashes the stall banner; wall-clock jumps don't count as disconnects | `src/net/lockstep-stall.ts` | [ ] |
| NET-12 | Auto-reconnect with 1→16 s exponential backoff, then snapshot resync | `src/net/ws-transport.ts` | [ ] |
| NET-13 | Rejoin by room + `connId` within 30 minutes | `relay/relay-app.mjs` | [ ] |
| NET-14 | Room lifecycle: host election, GC when empty, 30 min grace after a match empties | `relay/relay-app.mjs` | [ ] |
| NET-15 | Wire messages validated with Zod on both client and relay | `src/net/protocol-schema.ts` | [ ] |
| NET-16 | `GET /health` returns `{ok, rooms}` | `relay/production.mjs` | [ ] |
| NET-17 | One Railway service serves the static build **and** the relay on the same origin | `relay/production.mjs` | [ ] |
| NET-18 | 30 s WebSocket keepalive ping/terminate | `relay/relay-app.mjs` | [ ] |
| NET-19 | Protocol version constant, safe to bump | `protocol-constants.json` | [ ] |
| NET-20 | Sim runs in a worker in multiplayer too, so catch-up never blocks rendering | `src/app/match/sim-controller.ts` | [ ] |
| NET-21 | *Gap:* no user-visible desync UX and no automatic recovery | `src/app/app-router.ts` | [ ] fix |
| NET-22 | *Gap:* a lagging peer whose **host** dropped can never get a snapshot | `relay/relay-app.mjs` | [ ] fix |

## 15. Persistence

| ID | Feature | v1 evidence | v2 |
|---|---|---|---|
| PER-01 | Solo save/load of the full deterministic state (IndexedDB, versioned) | `src/storage/save.ts` | [ ] |
| PER-02 | Autosave every 200 ticks, on pause, on leave | `src/app/match/sim-controller.ts` | [ ] |
| PER-03 | Continue resumes into a paused match with the right local player | `src/app/app-router.ts` | [ ] |
| PER-04 | Online session record (room, connId, slot, seed, relay URL) with 30 min TTL | `src/storage/online-session.ts` | [ ] |
| PER-05 | Settings persistence (volume, mute, names, quality, tips, drag mode) | `src/storage/settings.ts` | [ ] |
| PER-06 | Scenario store for the sandbox | `src/sandbox/scenario-store.ts` | [ ] |
| PER-07 | *Gap:* save loader accepts v1/2/4 but not 3 and has no field migration; a schema change silently corrupts saves | `src/storage/save.ts` | [ ] fix |

## 16. Test coverage

| ID | Area | v1 files | v2 |
|---|---|---|---|
| TST-01 | Determinism: identical hash across two runs, 1200-tick AI match, scripted replay | `determinism.test.ts` | [ ] |
| TST-02 | Lockstep: 2/3/4 peers hash-identical at tick 1200; relay pacing; stall policy; rejoin | `lockstep*.test.ts`, `relay-*.test.*` | [ ] |
| TST-03 | Architecture: hash surface, pack/unpack round-trip, delta, schema validation | `architecture.test.ts` | [ ] |
| TST-04 | Economy: harvest, deposit, gating, vault, tight pacing | `economy*.test.ts` | [ ] |
| TST-05 | Combat: counters, projectiles, beams, splash, chain, superweapon | `combat.test.ts`, `defense-mechanics.test.ts`, `superweapon.test.ts` | [ ] |
| TST-06 | Height/verticality: nav steps, ramps, cliffs, fire blocks, vision | `verticality.test.ts`, `terrain-height.test.ts` | [ ] |
| TST-07 | Movement/pathing: 60-unit group cohesion, flow fields, unstuck | `movement.test.ts`, `pathing.test.ts` | [ ] |
| TST-08 | Fog/radar/ghosts | `fog.test.ts`, `radar-hint.test.ts` | [ ] |
| TST-09 | Placement: zones, spacing, previews, ghost, overlay | `build-*.test.ts`, `placement-*.test.ts` | [ ] |
| TST-10 | Garrison, mobile HQ, channel, power, win check, FFA | corresponding files | [ ] |
| TST-11 | Input: gesture FSM, keyboard, pointer binder, projected picking, compact UI, HUD scroll, parity | corresponding files | [ ] |
| TST-12 | AI: difficulty divergence, behaviours, strategy determinism | `ai-difficulty.test.ts`, `capabilities-ai.test.ts` | [ ] |
| TST-13 | Sandbox: flags, palette, scenarios, overlays | `sandbox*.test.ts` | [ ] |
| TST-14 | Worker: determinism across the split, delta mirror fidelity | `worker*.test.ts` | [ ] |
| TST-15 | Save/load, replay serialization, mod overlay | corresponding files | [ ] |
| TST-16 | Gallery preview scenarios | `gallery-preview.test.ts` | [ ] |
| TST-17 | Balance harness: 4 AI matches must terminate (see BUG-13 — weak) | `balance.test.ts` | [ ] replace |
| TST-18 | E2E Playwright: menu→lobby→match→move+pan+box-select; HUD tick advances; canvas repaints; sandbox tabs/actions | `e2e/*.spec.ts` | [ ] |

---

## 17. Known issues register (audited, reproducible)

Severity: **S1** breaks a match, **S2** major feel/performance, **S3** polish.

### 17.1 Bugs

| ID | Sev | Defect | Evidence |
|---|---|---|---|
| BUG-01 | S1 | **Wisps permanently jam when told to move to their own base.** `fleeThreatenedWorkers` (and any player move order onto a building) targets the building centre; the goal tile is blocked, so the unit walks into the footprint and never arrives. The order completes only within 12.8 world units of the centre, but the unit stops ~48 units out (building radius) and stays `moving` forever. | Headless probe: wisp `state=moving`, `orders=[{move,464,464}]`, distance 48 after 400 ticks. `src/ai/behaviors.ts:117`, `src/sim/systems/movement.ts:116` |
| BUG-02 | S1 | **Clicking your own building with units selected issues a doomed move order** (same root cause as BUG-01). On mobile this is easy to do accidentally and silently deletes a worker from the economy. | `src/input/modes/normal-mode.ts` |
| BUG-03 | S1 | **AI economy collapses within ~4 minutes and never recovers.** Two 20-minute soaks, sampled every minute: from minute 3–5 both AIs sit on exactly 4 buildings (Sanctum, Attunement Spire, Ley Conduit, Summoning Circle) with mana at or near 0, and never produce a Golem Forge, Arcane Nexus or expansion for the remaining 15+ minutes. In one run an AI *lost* its Spire and Circle and finished on its Sanctum alone. | Headless soak, 20 min, per-minute trace |
| BUG-04 | S1 | **AI is identical every seed.** Six seeds (1–6) produced byte-identical outcomes: winner team 0 at 6.2 min, peak armies 22 vs 7, 44 entities at the end. `chance.roll` hashes only `tick|playerId|key`, so the match seed never reaches the AI, and `rngState` is never advanced by anything. | Probe over seeds 1–6 |
| BUG-05 | S2 | **`surrender` doesn't clear the board.** Sets `defeated` and ends the match, but the army keeps fighting and is never purged. Also unreachable: `InputController.surrender()` is never called by any UI. | Probe: 7 units still alive post-surrender |
| BUG-06 | S2 | **Tech is permanently unlocked once built.** Selling or losing the Astral Spire keeps all four spells; losing every refinery still allows any structure. | `productionSystem` only ever appends to `unlockedTech` |
| BUG-07 | S2 | **`setStance` is unreachable** and `hold` order is dead code. A command in the wire protocol that no UI can send. | `src/input/controller.ts:347`, no callers |
| BUG-08 | S2 | **Research is a complete feature with no content.** Sim queues, modifier pipeline, hash surface, UI buttons and validation all exist; `data/research/` doesn't exist, so it never appears. | `ls data/research` → missing |
| BUG-09 | S2 | **Seeded PRNG is dead code.** `mulberry32` and `Rng` exist and are hashed, but nothing calls them, so "deterministic randomness" is currently "no randomness". | `grep -rn "nextRandom(" src` → only the definition |
| BUG-10 | S2 | **`underAttack` fires per damage tick, not throttled.** 400 ticks of a 40v40 fight produced 280 `damageDealt` **and 280 `underAttack`** events. Comment in the code claims throttling. | Probe event census |
| BUG-11 | S2 | **`MAX_UNITS_PER_PLAYER = 90` is never enforced.** No cap exists at all; long games grow unbounded. | `grep MAX_UNITS` → declaration only |
| BUG-12 | S2 | **Map generator no longer reproduces the shipped map.** `node scripts/gen-map.mjs` rewrites 96 tiles and 1 156 height values — it never creates the four corner base plateaus the game actually ships with. Following the README silently deletes the corner mesas. | Regenerated and diffed against `data/maps/duel_glade.json` |
| BUG-13 | S2 | **Balance harness cannot fail on balance.** It runs 4 matches, logs a report, then asserts `report.length === 4`. Because of BUG-04 all four runs are identical anyway. | `tests/balance.test.ts` |
| BUG-14 | S2 | **Replay test only round-trips JSON**, it never replays a recorded match through the sim. | `tests/replay.test.ts` |
| BUG-15 | S2 | **`iconCanvas()` extracts a GPU canvas on every call**, and the build menu calls it for every item on every content re-render. | `src/render/renderer.ts:1094`, `command-menu-panel.ts` |
| BUG-16 | S2 | **Quality changes leak textures.** Cache keys include `textureResolution`, but `clearCache()` is never called on a quality switch, so every level change adds a second full set of textures. | `src/render/shape-sprite.ts:1258`, `renderer.setQuality` |
| BUG-17 | S3 | **`Camera.triggerMicroShake` is a 2-frame teleport, not a shake** — it randomises an offset, and `tickShake` zeroes it after two frames without decay. | `src/render/camera.ts:103` |
| BUG-18 | S3 | **Compact-UI decisions are read once at construction.** `Hud` captures `isCompactUiSize(...)` in its constructor and never re-evaluates on resize/rotate; CSS reacts, JS-side open/closed decisions don't. | `src/ui/hud.ts:133` |
| BUG-19 | S3 | **Spawn search scans every entity per candidate position** (up to 128 candidates × n entities), so a 5-deep queue finishing at once can hitch a tick. | `src/sim/systems/production.ts:180` |
| BUG-20 | S3 | **`isDefenseBuilding()` returns false for Stone Wall**, so walls are never picked as a siege target and the AI walks into them forever. | `src/ai/shared.ts:52` |
| BUG-21 | S3 | **`acquireTarget` queries a radius equal to raw weapon range** while `inWeaponBand` adds both radii, so a large building can acquire a target it cannot hit and vice versa. | `src/sim/systems/combat.ts:84,60` |
| BUG-22 | S3 | **Min-range is only enforced for buildings.** A min-range unit would fire point blank. | `src/sim/systems/combat.ts:95` |
| BUG-23 | S3 | **`knownBuildings` ghosts are never cleaned up when a player is eliminated.** | `src/sim/factory.ts:224` |
| BUG-24 | S3 | **Save loader skips version 3** and has no field migration. | `src/storage/save.ts:71` |
| BUG-25 | S3 | **A save referencing a deleted map throws inside the menu click handler**, leaving a blank screen with no error. | `src/app/app-router.ts:352` |
| BUG-26 | S3 | **`initOrientation` / gallery / preview listeners are never removed**; menu↔match cycles accumulate `matchMedia` and resize listeners. | `src/ui/orientation.ts` |
| BUG-27 | S3 | **`public/_headers` doesn't cover `/`**, only `/index.html`. | `public/_headers` |
| BUG-28 | S3 | **Sourcemaps are shipped** (`sourcemap: true`) → 6.4 MB dist and public source. | `vite.config.ts` |
| BUG-29 | S3 | **`sfx` blocks in all 29 content files are never read**; audio is event-driven only. Dead config in every file. | `grep "\.sfx" src` → none |
| BUG-30 | S3 | **Three projectile defs are unreachable** (`frost_bolt`, `inferno_orb`, `celestial_shot`). | weapon scan across `data/` |
| BUG-31 | S3 | **HUD hard-codes the superweapon** (`'Astral Lance'`, first `isSuperweapon` building, first spell in `unlocksSpells`) and the faction, so a second superweapon or faction breaks silently. | `superweapon-status.ts:20`, `building-actions-panel.ts:9` |
| BUG-32 | S3 | **No error surface for a failed data load** beyond a thrown error in the console. | `src/main.ts` |
| BUG-33 | S3 | **Dead content fields.** Every building declares `"armor": "building"` but the sim hardcodes building armor, so the field never matters; all 29 defs carry an `sfx` block nothing reads; `shortLabel` is used only in producer chips. Data that looks tunable but isn't is worse than no field. | `src/sim/combat-util.ts:11`, `grep "\.sfx" src` |

### 17.2 Performance problems (measured on the audit VM — not a Chromebook, so treat as *relative*)

| ID | Problem | Measurement |
|---|---|---|
| PERF-01 | **`entitiesSorted()` allocates a sorted array on every call**, from 30 call sites, several inside per-entity loops (`swarmScore` is called inside `acquireTarget`'s candidate loop → O(n² log n) per tower per tick). | 4.2 µs/call at 129 entities; ~100 calls/tick would be 0.42 ms/tick of pure sorting |
| PERF-02 | **Flow-field construction dominates the tick.** A full-map BFS (11 264 tiles × 2 passes) is rebuilt whenever a goal tile or the cache version changes; every building death/completion calls `invalidate()` and throws the whole cache away mid-battle. | 99 field builds in 10 min = **897 ms = 25 % of total sim time** |
| PERF-03 | **Unbounded flow-field cache.** Key is `${owner}:${tx},${ty}` in a plain `Map`, no LRU, no cap. | Grows with player count × distinct goals; retained for the whole match |
| PERF-04 | **Fog recompute is O(players × entities × sight-area) every tick.** | 8 players / 37 entities = 0.23 ms/tick; scales with entity count |
| PERF-05 | **Worker delta sync stringifies every entity every tick** (`JSON.stringify(e)`) to detect changes, *and* the main thread rebuilds the whole entity array and re-applies full state anyway. | 8 000 stringifies/s at 400 entities |
| PERF-06 | **8-player 454-entity brawl costs 5.28 ms/tick without AI and 14.96 ms/tick with AI.** | 50 ms tick budget: 30 % used at 1/4 of a realistic late-game entity count, and AI triples it |
| PERF-07 | **HUD reconciles every panel every rendered frame** at 60 fps: text writes, class toggles, `innerHTML = ''` on the train queue, `querySelectorAll` over all build buttons, minimap caption logic, coach state machine. | Not measured in isolation, but it is the largest per-frame DOM cost and runs even when nothing changed |
| PERF-08 | **Minimap re-hashes the whole 11 264-entry visibility array every frame** before deciding not to redraw, and redraws per-tile `fillRect` when it does. | 11 264-entry hash at 60 fps |
| PERF-09 | **Terrain is one un-chunked `Graphics`** built at init (11 264 polygons + drop walls) and drawn in full every frame with no culling or LOD. | Full-map geometry always on the GPU |
| PERF-10 | **Fog redraws as N separate `poly().fill()` runs** whenever the visibility fingerprint changes — on a moving army, every frame. | Potentially hundreds of draw calls/frame |
| PERF-11 | **One 828 KB JS chunk** (230 KB gz) plus a 237 KB worker chunk; Pixi ships WebGPU + Canvas renderers and filters that are never used. No code splitting. | `vite build` warns > 500 kB; parse/exec cost dominates cold start on a Celeron |
| PERF-12 | **No render FPS cap**, so a 120 Hz phone renders 120 fps with the full HUD update path. | — |
| PERF-13 | **`spellBar.update` rewrites text/title/aria-label for every spell chip every frame**; same pattern in the producer chips. | 60 writes/s × chips |
| PERF-14 | **No object pooling for events.** A 40v40 fight emits ~1 000 events/s, each a fresh object routed through the bridge. | 280 events / 400 ticks in a small fight → ~1 000/s scaled up |

### 17.3 Things that feel bad (subjective, but each has a mechanical cause)

| ID | Feeling | Cause |
|---|---|---|
| FEEL-01 | Units wander off | Auto-acquire radius equals `sight` (150–210) and aggressive units chase without leash; no stance UI |
| FEEL-02 | Attacks arrive as a trickle | `waveFraction` per difficulty plus "keep N home" logic; Hard splits into 3 lanes that arrive piecemeal because each group paths independently |
| FEEL-03 | The first 90 seconds are empty | 1v1 uses opposite corners of a 128×88 tile map; an archer at 62 u/s crosses ~4 000 world units in ~65 s |
| FEEL-04 | You lose workers and don't notice | No idle-worker indicator, no worker-loss alert, no "unit under attack" ping near the camera |
| FEEL-05 | Long games stall | AI never techs up (BUG-03), so matches end at 6 min or never; the 10-minute "commit" switch makes every AI all-in at once |
| FEEL-06 | The base feels cramped | Build zone is 7 tiles from *any* structure, so you must creep with walls to expand; buildings are 2–3 tiles on a 128-tile map with 13 nodes |
| FEEL-07 | Turrets beat units | Arcane Sentry: 20 dps at 165 range for 250 mana. Archer: 17.8 dps at 132 range for 210. The turret dominates the unit that is supposed to counter it |
| FEEL-08 | One building decides the game | Celestial Cannon: 180 dmg in r90 at 420 range every 5 s, 1.3× vs heavy — it outranges every unit by 3× and deletes clumps |
| FEEL-09 | Armies never die | Sanctuary Spire heals 8 HP/s to every unit in r150, more than most units' DPS |
| FEEL-10 | Superweapon roulette | 4 500 mana / 45 s unlocks all four spells; every AI build order ends there, so the mid-game is a race to one building |
| FEEL-11 | Mana is meaningless late | One 12 000 node at 16/s per wisp with 3–4 wisps sustains ~1 000 mana/min forever; expansion is decorative |
| FEEL-12 | Placement feels fiddly | Ghost can jump when the HUD steals the pointer, `startBuild` has a special-case re-placement, and wall drag needs a separate Place press |
| FEEL-13 | The tutorial stops too early | 4 steps, none about power, harvesting, or the actual win condition; the last step is a static card |
| FEEL-14 | Radar is a mystery | Minimap panel starts collapsed on compact screens and shows a build-this hint only after you open it |
| FEEL-15 | Text is tiny | 9 px building labels and 9 px HP text at 1× zoom on a 1366×768 Chromebook |
| FEEL-16 | Cannot tell teams apart | Blue/red/green/yellow only; no pattern, no colourblind palette, minimap dots are 2–4 px |
| FEEL-17 | Multiplayer drops are opaque | "Connection stalled" with no cause, no retry countdown, no desync explanation |
| FEEL-18 | Deploys lose matches | The service worker reloads on a new build (`skipWaiting`) mid-match |
| FEEL-19 | Keyboard players are second class | No shift-queue, no control groups, no right-click orders, no hotkeys for build/train |
| FEEL-20 | The result screen is wrong for desktop | Says "Drag or pinch to explore the map" on a mouse |

---

## 18. Parity summary

Counted from the tables above (excluding rows marked *Gap*):

| Group | Items |
|---|---|
| App shell / PWA | 12 |
| Menus | 8 |
| Lobby (solo + online) | 13 + 10 |
| HUD | 33 |
| Settings | 7 |
| Controls | 18 touch + 11 desktop |
| Simulation rules | 16 tick/determinism + 14 economy + 7 power + 6 tech + 7 production + 9 construction + 15 combat + 10 height + 9 fog + 8 spells + 5 garrison/air + 5 mobile HQ + 4 win |
| Content | 10 units + 19 buildings + 4 spells + 6 projectiles + 1 map + 1 faction + 4 match configs |
| AI | 32 |
| Rendering / VFX | 18 |
| Audio | 8 |
| Gallery | 9 |
| Sandbox | 14 |
| Networking | 19 |
| Persistence | 6 |
| Tests | 18 areas |

**Non-negotiables** (if any of these regress, the rebuild has failed): determinism + hash parity, lockstep with stall/snapshot recovery, the Entity Designs gallery with live previews, the first-match coach, every content id, the developer sandbox, and the compact-phone HUD.

---

## 19. Deliberate changes

Nothing is dropped yet. Proposed removals/rewrites, each with reasoning, live in
[`REBUILD_PLAN.md` §7](./REBUILD_PLAN.md#7-recommended-rule--design-changes). This section will be
updated to `[x] dropped — reason` as Zachary signs each one off.
