# Arcane Dominion — v1 Feature Inventory (rebuild checklist)

**Purpose.** This is the definition of "nothing gets lost". Every player-visible feature, rule,
screen, and data-driven behaviour of the *current* game (v1, `main` @ `8786665`) is listed with
the exact file that implements it. v2 may rebuild the implementation, but every row here must
either exist in v2 or be struck out with an explicit, reasoned decision recorded in
`REBUILD_PLAN.md` §"Recommended rule changes".

Status legend: `[ ]` pending in v2 · `[x]` done in v2 · `[~]` deliberately replaced (see plan) ·
`[!]` known-broken in v1 (fix is mandatory in v2).

**How this inventory was produced.** Every row was verified by reading the referenced file in this
run, and the behaviour was additionally exercised for the rows marked with a `▣` by the test suite
(`npm test` → 431 passing), the Playwright suite (`npx playwright test` → 6 passing), or the
audit harnesses described in `REBUILD_PLAN.md` §9.

---

## 1. Match / game modes

| # | Feature | v1 implementation | v2 |
|---|---|---|---|
| 1.1 | Solo skirmish vs AI (default 1v1) | `src/ui/match-lobby.ts`, `src/lobby/templates.ts` (`skirmish_1v1`), `data/match/skirmish_1v1.json` | [ ] |
| 1.2 | 4-player FFA | `data/match/ffa_4.json`, `templates.ts` (`ffa_4`) | [ ] |
| 1.3 | 2v2 with teams (AI-filled) | `templates.ts` (`2v2_ai`), `src/lobby/teams.ts` | [ ] |
| 1.4 | Rush preset (AI strategy override) | `data/match/skirmish_1v1_rush.json` → `aiStrategyId: arcane_rush` | [ ] |
| 1.5 | Up to 4 slots, each Human / AI / Open / Closed | `src/lobby/types.ts`, `build-config.ts` (`validateLobby`) | [ ] |
| 1.6 | Per-slot team A–D, colour, start corner | `src/lobby/types.ts` (`DEFAULT_COLORS`), `match-lobby.ts` | [ ] |
| 1.7 | Per-slot AI difficulty (easy/normal/hard) | `ai/difficulty.ts`, `lobby/types.ts` | [ ] |
| 1.8 | Map picker (currently one map) | `match-lobby.ts` (`mapSelect`), `data/maps/duel_glade.json` | [ ] |
| 1.9 | Faction picker (currently one faction) | `match-lobby.ts` (`factionSelect`), `data/factions/arcane.json` | [ ] |
| 1.10 | Economy pacing preset Standard / Tight | `src/data/economy-pacing.ts` | [ ] |
| 1.11 | "Dead spectators see the whole map" toggle | `MatchConfig.deadSpectatorReveal`, `sim/views.ts` (`shouldRevealAllForViewer`) | [ ] |
| 1.12 | "One superweapon per player" toggle | `MatchConfig.oneSuperweaponPerPlayer`, `sim/systems/commands/spell.ts` | [ ] |
| 1.13 | Deterministic seed per match | `MatchConfig.seed` → `GameState.rngState` (`sim/factory.ts:172`) | [ ] |
| 1.14 | Continue saved solo match | `src/storage/save.ts`, `app-router.ts` (`onContinue`) | [ ] |
| 1.15 | Developer sandbox mode (`?sandbox=1`) | `src/sandbox/**` (see §11) | [ ] |
| 1.16 | Entity Designs gallery (`?gallery=1`) | `src/ui/art-gallery.ts` (see §9) | [ ] |
| 1.17 | Surrender command | `sim/systems/commands/surrender.ts` | [ ] |
| 1.18 | Victory / defeat detection & result screen | `sim/systems/wincheck.ts`, `ui/hud.ts` (`showResult`) | [ ] |

## 2. Screens & navigation

| # | Feature | v1 implementation | v2 |
|---|---|---|---|
| 2.1 | Main menu (Continue / Rejoin / Custom Game / Create Online / Join Online) | `src/ui/screens.ts` (`MainMenu`), `src/app/app-router.ts` (`showMenu`) | [ ] |
| 2.2 | Match Setup lobby (solo/host/guest in one component) | `src/ui/match-lobby.ts` (595 lines) | [ ] |
| 2.3 | Lobby map preview with clickable start corners | `src/ui/lobby-map-preview.ts` | [ ] |
| 2.4 | Lobby template dropdown | `match-lobby.ts` `templateSelect` (`data-testid="lobby-template"`) | [ ] |
| 2.5 | Join-by-room-code form | `src/ui/lobby.ts` (`JoinOnlineForm`) | [ ] |
| 2.6 | In-match Settings overlay | `src/ui/hud/settings-screen.ts` | [ ] |
| 2.7 | Pause overlay (solo only) | `hud.ts` (`pauseOverlay`), `game.ts` (`setPaused`) | [ ] |
| 2.8 | Portrait "rotate your device" overlay | `src/ui/orientation.ts` | [ ] |
| 2.9 | First-match coach card | `src/ui/coach/card.ts`, `coach/progress.ts` (see §8) | [ ] |
| 2.10 | In-match hint banner (12 s auto-hide) | `hud.ts` (`showHint`) | [ ] |
| 2.11 | Debug overlay (fps / tick / entities / selection) | `hud.ts` (`setDebug`), `game.ts` (`frame`) | [ ] |
| 2.12 | End-of-match result card + camera free-pan | `hud.ts` (`showResult`), `game.ts:506` | [ ] |

## 3. Settings & persistence

| # | Feature | v1 implementation | v2 |
|---|---|---|---|
| 3.1 | Mute toggle | `settings-screen.ts` (`applyMute`) | [ ] |
| 3.2 | Volume slider 0–100 | `settings-screen.ts` (`applyVolume`) | [ ] |
| 3.3 | Show-building-names toggle | `settings-screen.ts` + `renderer.setShowBuildingNames` | [ ] |
| 3.4 | Graphics quality Auto / Low / Medium / High (default **High**) | `render/graphics-quality.ts`, `settings-screen.ts` | [ ] |
| 3.5 | Adaptive drop to Low after sustained <24 fps (Auto only) | `game.ts` `maybeAdaptGraphicsQuality` | [ ] |
| 3.6 | Show-tips toggle + "Replay tutorial" | `settings-screen.ts`, `hud.ts` (`syncCoachEnabled`) | [ ] |
| 3.7 | Settings persisted in IndexedDB | `src/storage/settings.ts` | [ ] |
| 3.8 | Solo autosave on pause/exit + resume | `src/storage/save.ts` (`SAVE_VERSION = 4`) | [ ] |
| 3.9 | Online session persisted for Rejoin | `src/storage/online-session.ts` | [ ] |
| 3.10 | Drag mode setting (pan vs select) | `settings.ts` (`dragMode`), `input/gesture.ts` | [ ] |
| 3.11 | PWA auto-update check every 3 min + on focus/visible | `src/pwa.ts` | [ ] |

## 4. Economy

| # | Rule | v1 implementation | v2 |
|---|---|---|---|
| 4.1 | Single resource: **Mana** | `data/balance.json` (`startingMana: 900`) | [ ] |
| 4.2 | Mana Nodes: 4 corner nodes @ 25 000 (capped to 12 000), 9 contested nodes @ 3 000 | `data/maps/duel_glade.json` `manaNodes`, `sim/factory.ts:188` (`manaNodeCapacity`) | [ ] |
| 4.3 | Wisp harvest cycle: travel → siphon → return → deposit | `sim/systems/harvest.ts` | [ ] |
| 4.4 | Siphon 16 mana/s while in node contact, carry cap 75 | `balance.json` `siphonPerSecond`, `data/units/wisp.json` `carry` | [ ] |
| 4.5 | Deposit only at a completed, powered **Attunement Spire** (refinery) | `harvest.ts:63` (`buildingHasPower`), `isRefinery` | [ ] |
| 4.6 | Resonance Vault boosts siphon ×1.3 | `balance.json` `vaultSiphonMultiplier`, `harvest.ts:93` | [ ] |
| 4.7 | Node depletion → node disappears; harvester re-targets next node | `harvest.ts:77-88`, `sim/systems/death.ts:37` | [ ] |
| 4.8 | Refinery spawns one free Wisp on completion | `attunement_spire.json` `spawnsFreeWisp`, `production.ts:64` | [ ] |
| 4.9 | Mana Weaver conjures 6 mana / 3 s while channeling (stationary) | `sim/systems/channel.ts`, `balance.json` | [ ] |
| 4.10 | Repair: 0.05 mana per HP, 2 HP/tick, cancelled when broke | `balance.json`, `production.ts:71-86` | [ ] |
| 4.11 | Sell building for 50 % refund | `balance.json` `sellRefundRatio`, `commands/build.ts` | [ ] |
| 4.12 | Tight economy preset (costs ×1.5, fewer wisps, smaller nodes) | `data/economy-pacing.ts` | [ ] |
| 4.13 | Production/build refunds on cancel | `commands/production.ts`, `commands/research.ts` | [ ] |

## 5. Power grid (RA2 rules)

| # | Rule | v1 implementation | v2 |
|---|---|---|---|
| 5.1 | Buildings consume/produce power; player has `power`/`powerUsed` | `sim/power.ts`, `sim/factory.ts:248` (`recomputePower`) | [ ] |
| 5.2 | **Low power ⇒ defenses, radar, and auras go completely offline** | `power.ts` `buildingHasPower` / `isHardPowerConsumer` | [ ] |
| 5.3 | Low power ⇒ production/construction slow proportionally, floor 10 % | `power.ts` `productionRate` | [ ] |
| 5.4 | HUD shows `used/total (−deficit)` and a red low-power state | `hud.ts` | [ ] |
| 5.5 | Sanctum +20 pwr, Ley Conduit +60 pwr | `sanctum.json`, `ley_conduit.json` | [ ] |

## 6. Buildings (20 defs)

| # | Building | Key rules | v1 file | v2 |
|---|---|---|---|---|
| 6.1 | Sanctum (HQ) | 2000 HP, footprint 3, construction yard, +20 pwr, **lose it = lose the match** | `data/buildings/sanctum.json` | [ ] |
| 6.2 | Attunement Spire | 750 mana, refinery, trains Wisps, free Wisp, −10 pwr | `attunement_spire.json` | [ ] |
| 6.3 | Resonance Vault | 1100 mana, economy upgrade + trains Mana Weavers | `resonance_vault.json` | [ ] |
| 6.4 | Ley Conduit | 300 mana, +60 pwr | `ley_conduit.json` | [ ] |
| 6.5 | Summoning Circle | 550 mana, infantry/wizard/air producer | `summoning_circle.json` | [ ] |
| 6.6 | Golem Forge | 850 mana, heavy + Waystone producer, requires Ley Conduit | `golem_forge.json` | [ ] |
| 6.7 | Arcane Nexus | 1200 mana, tech hub (−50 pwr), requires Golem Forge | `arcane_nexus.json` | [ ] |
| 6.8 | Astral Spire | 4500 mana, 45 s, superweapon; unlocks all 4 spells (−100 pwr) | `astral_spire.json` | [ ] |
| 6.9 | Scrying Obelisk (radar) | 400 mana, enables minimap; requires Spire + Conduit (−15 pwr) | `scrying_obelisk.json` | [ ] |
| 6.10 | Arcane Sentry | 250 mana turret, rapid 3-dmg bolts, 360° turret w/ fire arc | `arcane_sentry.json` | [ ] |
| 6.11 | Frost Spire | 650 mana beam tower, stacking slow, needs Nexus | `frost_spire.json` | [ ] |
| 6.12 | Inferno Beacon | 800 mana flame cone, anti-swarm, lingering burn | `inferno_beacon.json` | [ ] |
| 6.13 | Storm Conductor | 1100 mana, chain lightning ×3 jumps, anti-heavy | `storm_conductor.json` | [ ] |
| 6.14 | Celestial Cannon | 2200 mana artillery, 420 range, 120 min-range blind spot, 60-tick charge | `celestial_cannon.json` | [ ] |
| 6.15 | Sanctuary Spire | 900 mana support, heals allies 0.4 HP/tick in r150 | `sanctuary_spire.json` | [ ] |
| 6.16 | Arcane Bunker | 320 mana, garrisons 4 ranged units, +20 range from slits | `arcane_bunker.json` | [ ] |
| 6.17 | Stone Wall | 40 mana, blocks movement, 350 HP | `stone_wall.json` | [ ] |
| 6.18 | Arcane Gate | 60 mana, own/allied units pass, enemies blocked | `arcane_gate.json`, `nav-grid.ts` `setGate` | [ ] |
| 6.19 | Waystone Camp (deployed MHQ) | 1400 HP, construction yard, packs back into a Wagon | `waystone_camp.json`, `sim/systems/morph.ts` | [ ] |
| 6.20 | Mana Node (neutral entity) | Resource node, depletes, never blocks | `sim/factory.ts:188` | [ ] |

## 7. Units (10 defs) — counters are the `vs` multipliers

| # | Unit | Cost / time | HP / armour | Weapon | v1 file | v2 |
|---|---|---|---|---|---|---|
| 7.1 | Wisp | 200 / 5 s | 120 light | none; harvester, carry 75 | `data/units/wisp.json` | [ ] |
| 7.2 | Imp Swarmling | 140 / 4 s | 90 light | 12 dmg melee, 8-tick CD, light 1.0 / heavy 0.6 / bldg 0.5 | `imp_swarmling.json` | [ ] |
| 7.3 | Arcane Archer | 210 / 6 s | 70 light | 16 dmg, r132, 18-tick CD, hits air | `arcane_archer.json` | [ ] |
| 7.4 | Rift Familiar | 125 / 4 s | 60 light | 8 dmg melee, speed 124, sight 210 (scout) | `rift_familiar.json` | [ ] |
| 7.5 | Stone Golem | 560 / 14 s | 600 heavy | 40 dmg, r26, 20-tick CD, bldg 1.5 | `stone_golem.json` | [ ] |
| 7.6 | Siege Behemoth | 980 / 18 s | 500 heavy | 60 dmg, r155, 40-tick CD, splash 32, bldg 2.5 | `siege_behemoth.json` | [ ] |
| 7.7 | Storm Caster | 700 / 12 s | 160 light | 30 dmg, r142, splash 42, hits air | `storm_caster.json` | [ ] |
| 7.8 | Rift Skimmer (air) | 360 / 8 s | 85 light | 12 dmg, r86, air+ground | `rift_skimmer.json` | [ ] |
| 7.9 | Mana Weaver | 350 / 8 s | 90 light | none; conjures mana | `mana_weaver.json` | [ ] |
| 7.10 | Waystone Wagon | 2000 / 22 s | 500 heavy | none; deploys into Camp | `waystone_wagon.json` | [ ] |

Armour classes `light | heavy | building`; every weapon carries a `vs` table — this *is* the counter
system (`src/data/defs.ts`, `docs/DATA_SCHEMA.md`). Verified by `tests/combat.test.ts`
("heavy melee (golems) beat an equal-cost mass of light ranged (archers)").

## 8. First-match coach / tutorial

| # | Feature | v1 implementation | v2 |
|---|---|---|---|
| 8.1 | 4-step pure state machine: `selectHq → placeBuilding → moveWisp → radarWin` | `src/ui/coach/progress.ts` (`MATCH_COACH_STEPS`, `advanceMatchCoach`) | [ ] |
| 8.2 | Steps advance only on real player action (facts from state) | `hud.ts` `collectCoachFacts` | [ ] |
| 8.3 | "Skip tutorial" disables tips permanently; "Got it" advances one step | `coach/card.ts`, `hud.ts` `finishCoach`/`gotItCoach` | [ ] |
| 8.4 | Coach anchored to command panel / map per step (`anchor`) | `card.ts` (`coach-card--cmd`/`--map`) | [ ] |
| 8.5 | Lobby coach card for start-position picking | `lobbyCoachCopy`, `match-lobby.ts` | [ ] |
| 8.6 | Radar-off explainer copy | `RADAR_OFFLINE_HOW`, `radar-hint.ts` | [ ] |
| 8.7 | Coach never runs in sandbox | `hud.ts` `syncCoachEnabled` | [ ] |
| 8.8 | [!] Coach card **overlaps and steals clicks from the build-confirm bar** on phones | see plan §10.1 | [ ] |

## 9. Entity Designs gallery

| # | Feature | v1 implementation | v2 |
|---|---|---|---|
| 9.1 | Grid of every unit + building, grouped Troops / Defenses / Buildings | `src/ui/art-gallery.ts` `entries()` | [ ] |
| 9.2 | Two previews per card: 2.5D world texture + HUD icon | `art-gallery.ts` `canvasFor` | [ ] |
| 9.3 | Team colour switcher (blue / red / green) | `TEAM_COLORS` | [ ] |
| 9.4 | Live 2.5D previews: combat / heal / garrison / harvest / channel / deploy / move | `src/ui/defense-combat-preview.ts`, `gallery-preview-scene.ts` | [ ] |
| 9.5 | Per-unit scripted vignettes (19 previewable defs) | `gallery-preview-scene.ts` `DEFENSE_SCENARIOS` + `troopCombatLayout` | [ ] |
| 9.6 | Runs a real headless `Simulation` for the preview | `gallery-preview-scene.ts` (`initMatch` + `Simulation`) | [ ] |
| 9.7 | `?gallery=1` deep link | `shouldOpenArtGallery()` | [ ] |
| 9.8 | Verified live-card count in browser | 19 `art-gallery-card-live` nodes (audit run) | [ ] |

## 10. In-match HUD & controls

| # | Feature | v1 implementation | v2 |
|---|---|---|---|
| 10.1 | Top bar: Mana, Power, 4 spell chips, debug, Pause, Settings | `hud.ts` constructor | [ ] |
| 10.2 | Collapsible Info / Build tab row, context-sensitive | `hud.ts` `syncPanelLayout` | [ ] |
| 10.3 | Build menu with categories Buildings / Defenses / Advanced | `hud/command-menu-panel.ts`, `hud/menu-categories.ts` | [ ] |
| 10.4 | Train menu with categories Workers / Small / Large / Wizards | same | [ ] |
| 10.5 | Build/train progress + cancel queue chips | `command-menu-panel.ts` `updateTrainQueue` | [ ] |
| 10.6 | Resource/tech gating with requirements tooltips | `commands/shared.ts` `requirementsMet` | [ ] |
| 10.7 | Unit orders panel (Deselect / Stop / Attack-Move / Move in Order) | `hud/unit-orders-panel.ts` | [ ] |
| 10.8 | Stance control (aggressive / hold / standground) | `sim/types.ts` `Stance`, `input/modes/*` | [ ] |
| 10.9 | Building actions: rally, repair, sell, unload garrison, deploy, pack, launch superweapon, research | `hud/building-actions-panel.ts` | [ ] |
| 10.10 | Building inspect tooltip (HP, power, garrison, progress) | `hud/building-inspect.ts`, `tests/building-inspect.test.ts` | [ ] |
| 10.11 | Spell bar with cooldown/locked states and confirm affordance | `hud/spell-bar.ts` | [ ] |
| 10.12 | Superweapon status (charge % + steer prompt) | `hud/superweapon-status.ts` | [ ] |
| 10.13 | Minimap: terrain, fog, entities, click-to-pan | `src/ui/minimap.ts` | [ ] |
| 10.14 | Radar-off minimap state + how-to hint | `radar-hint.ts`, `hud.ts` | [ ] |
| 10.15 | Zoom slider with +/− buttons | `src/ui/zoom-slider.ts`, `render/camera.ts` | [ ] |
| 10.16 | Touch: tap select, double-tap type select, long-press box select, two-finger pan, pinch zoom | `input/gesture.ts` (FSM), `tests/gesture.test.ts` | [ ] |
| 10.17 | Desktop: click select, left-drag box, middle-drag pan, wheel pan, WASD/arrow pan, Esc deselect | `input/keyboard-controls.ts`, `keyboard-controls.test.ts` | [ ] |
| 10.18 | Input modes: normal / build / deploy / rally / garrison / spell / superweapon / attack-move / move-in-order | `input/modes/*.ts` (9 modes) | [ ] |
| 10.19 | Build ghost follows mouse; green/red validity tiles; wall drag-place | `input/placement.ts`, `render/placement-draw.ts` | [ ] |
| 10.20 | Build-zone (RA2 "build near your base") visualisation | `sim/build-zone.ts`, `render/placement-draw.ts` | [ ] |
| 10.21 | Build confirm bar (Place / Cancel) + cost label | `hud.ts` (`buildConfirm`) | [ ] |
| 10.22 | Touch-scroll isolation so HUD scrolling never pans the camera | `hud.ts` (`keepScroll` listeners) | [ ] |
| 10.23 | Compact-UI phone layout (`height < 460 || width < 820`) | `ui/viewport.ts`, `--app-h/--app-w` CSS vars | [ ] |
| 10.24 | Command help / action-binding registry parity test | `input/actions.ts`, `tests/input-parity.test.ts` | [ ] |

## 11. Developer sandbox

| # | Feature | v1 implementation | v2 |
|---|---|---|---|
| 11.1 | Open via `?sandbox=1` or menu button | `sandbox-config.ts`, `screens.ts` | [ ] |
| 11.2 | 10 tabs: Economy, Units, Buildings, AI, Map, Gameplay, Spells, Combat, Scenarios, Overlays | `sandbox/ui/sandbox-panel.ts` | [ ] |
| 11.3 | Dev commands: set/add/remove mana, spawn unit/building, destroy, set HP, unlock tech, clear units, cast spell, complete research, add/remove/configure player | `sim/types.ts` `DevCommand`, `sim/systems/commands/dev.ts` | [ ] |
| 11.4 | Command palette with autocomplete + favourites | `sandbox/ui/command-palette.ts`, `command-registry.ts` | [ ] |
| 11.5 | Scenario save / load / builtin scenarios | `sandbox/scenario-store.ts`, `builtin-scenarios.ts` | [ ] |
| 11.6 | AI director overlay (force attack / expand / reveal intel) | `sandbox/ai-director.ts` | [ ] |
| 11.7 | Debug overlays: unit ids, vision radius, build grid, perf stats | `sandbox/overlays/build-debug-overlay.ts` | [ ] |
| 11.8 | Pause / step-one-tick / timescale 0.5×–4× | `sandbox-panel.ts`, `game.ts` | [ ] |
| 11.9 | Multi-player control switching in sandbox | `game.ts` `switchControlledPlayer` | [ ] |
| 11.10 | Sandbox chips: infinite mana/power, no costs, instant build/produce, ignore placement, reveal map, no cooldowns | `sim/sandbox-flags.ts`, `sandbox-types.ts` | [ ] |

## 12. Combat rules

| # | Rule | v1 implementation | v2 |
|---|---|---|---|
| 12.1 | Damage = `base × vs[armourClass]` | `sim/combat-util.ts` `applyDamage` | [ ] |
| 12.2 | Aegis buff = full damage immunity for its duration | `combat-util.ts:25` (`hasBuff(...,'aegis')`), `aegis_ward.json` | [ ] |
| 12.3 | Splash damage with distance-sorted, id-tiebroken targets | `combat-util.ts` `applySplashDamage` | [ ] |
| 12.4 | Chain lightning with falloff, no repeat hits | `combat-util.ts` `applyChainDamage` | [ ] |
| 12.5 | Continuous beam weapons (frost / flame) with cone hit detection | `sim/systems/beam-weapon.ts`, `sim/beam-util.ts` | [ ] |
| 12.6 | Frost slow stacks up to `maxFrostExposure` and decays | `beam-weapon.ts` `applyFrostExposure`/`decayFrostExposure` | [ ] |
| 12.7 | Turret rotation speed + fire arc gate | `combat.ts` `updateTurretFacing`/`canTurretFire` | [ ] |
| 12.8 | Charge-up attacks (Storm Conductor 10t, Celestial Cannon 60t) | `combat.ts` `chargingAttack` | [ ] |
| 12.9 | Minimum range / blind spot (`minRange`) | `combat.ts` `inWeaponBand` | [ ] |
| 12.10 | Air vs ground targeting layers | `sim/mobility.ts` `weaponHitsEntity`/`weaponHitsLayer` | [ ] |
| 12.11 | Garrisoned units fire from inside their host at reduced exposure | `sim/systems/garrison.ts` | [ ] |
| 12.12 | Garrison damage on host destruction (50 %) | `death.ts` `ejectGarrisonOnDeath`, `arcane_bunker.json` | [ ] |
| 12.13 | Stances: aggressive auto-acquire, hold, standground | `combat.ts:251` | [ ] |
| 12.14 | Fog gates targeting (cannot shoot what you cannot see) | `combat.ts` `isVisibleTo` checks | [ ] |
| 12.15 | Projectiles as real entities with travel time | `sim/systems/projectile.ts`, `makeProjectileCapability` | [ ] |
| 12.16 | `targetsAir` / `targetsGround` defaults | `mobility.ts` | [ ] |
| 12.17 | Attack tells (wind-up FX for Imp / Archer / Golem) | `render/attack-fx.ts` (`attackFxFromArt`), `attack-fx.test.ts` | [ ] |

## 13. Terrain, height, and 2.5D rules

| # | Rule | v1 implementation | v2 |
|---|---|---|---|
| 13.1 | 2.5D dimetric/oblique projection only (X×0.5, Y×0.25) | `src/core/projection.ts` | [ ] |
| 13.2 | `VISUAL_HEIGHT_STEP = 16`, flyers hover 2 levels | `projection.ts` | [ ] |
| 13.3 | Tile heights grid + ramp tiles (`TILE_RAMP`) | `sim/nav-grid.ts`, `core/ramp-slope.ts` | [ ] |
| 13.4 | Ground units may step ±1 height only on/into a ramp tile | `nav-grid.ts` `canStep` | [ ] |
| 13.5 | Ramps render as continuous slopes (surface height lerp) | `core/ramp-slope.ts` `surfaceHeightAt`, `render/tile-project.ts` | [ ] |
| 13.6 | Buildings can't straddle a height change (ramps tolerated) | `nav-grid.ts` `footprintHeightOk` | [ ] |
| 13.7 | **Cliffs block ground line of fire** (unless on a ramp) | `combat.ts` `heightBlocksGroundFire` | [ ] |
| 13.8 | High ground grants +1 tile weapon range | `HIGH_GROUND_RANGE_BONUS`, `combat.ts:34` | [ ] |
| 13.9 | High ground hides lower tiles from sight | `fog.ts` `revealSight` height check | [ ] |
| 13.10 | Flyers ignore terrain and see over cliffs | `nav-grid.ts` `isBlockedForAir`, `fog.ts` flying branch | [ ] |
| 13.11 | Depth sorting by projected Y | `renderer.ts` `sortKeyAt` | [ ] |
| 13.12 | Screen-space occlusion markers for units hidden behind buildings | `render/unit-occlusion.ts`, `unit-occlusion.test.ts` | [ ] |
| 13.13 | Camera clamp + overscroll (1.05× X, 0.55× Y) | `core/constants.ts`, `camera.ts` | [ ] |
| 13.14 | Zoom clamp 0.4–2.0 | `MIN_ZOOM`/`MAX_ZOOM` | [ ] |

## 14. Fog of war & radar

| # | Rule | v1 implementation | v2 |
|---|---|---|---|
| 14.1 | Per-player `explored` and `visible` tile arrays | `GameState.players[].explored/visible` | [ ] |
| 14.2 | Terrain + nodes always drawn; enemy units need live sight | `sim/fog.ts`, `renderer.ts` | [ ] |
| 14.3 | Enemy buildings leave grey **ghosts** once scouted | `Player.knownBuildings`, `fog.ts` `updateKnownBuildings` | [ ] |
| 14.4 | Ghosts refresh HP/progress while re-scouted | `snapshotBuilding` | [ ] |
| 14.5 | Radar (Scrying Obelisk) turns the minimap on; it does **not** reveal the main view | `fog.ts` `radarActive`, `isMinimapTileFogged` | [ ] |
| 14.6 | Radar shuts off on low power | `radarActive` (`isPowerShort`) | [ ] |
| 14.7 | Allied vision is shared | `fog.ts` `visionPartners` | [ ] |
| 14.8 | Dead-spectator full-map reveal (optional) | `sim/views.ts` `shouldRevealAllForViewer` | [ ] |

## 15. Spells & superweapons

| # | Content | v1 implementation | v2 |
|---|---|---|---|
| 15.1 | **Meteor Storm** — 220 dmg in r90, 90 s cooldown, ground-targeted, needs confirm | `data/spells/meteor_storm.json` | [ ] |
| 15.2 | **Aegis Ward** — 200-tick invulnerability on a selected group, 60 s CD | `aegis_ward.json` | [ ] |
| 15.3 | **Blink Gate** — teleport selected group ≤ 220 units, 45 s CD | `blink_gate.json`, `commands/spell.ts` | [ ] |
| 15.4 | **Astral Lance** — steerable satellite beam, 240 s CD, 100-tick charge, 300-tick duration | `astral_lance.json`, `sim/systems/superweapon.ts` | [ ] |
| 15.5 | All spells gated behind Astral Spire | `requires: ["astral_spire"]` | [ ] |
| 15.6 | One superweapon building per player (default) | `MatchConfig.oneSuperweaponPerPlayer`, `commands/spell.ts` | [ ] |
| 15.7 | Beam steering via `steerSuperweapon` command | `sim/systems/commands/superweapon.ts` | [ ] |

## 16. AI opponents

| # | Feature | v1 implementation | v2 |
|---|---|---|---|
| 16.1 | One controller per AI player, emits Commands only (never mutates state) | `ai/controller.ts` `aiStep` | [ ] |
| 16.2 | 3 difficulties with behavioural profiles | `ai/difficulty.ts` (`PROFILES`) | [ ] |
| 16.3 | Data-driven strategies with build orders | `data/ai/*.json`, `ai/strategies/config-driven-strategy.ts` | [ ] |
| 16.4 | Deterministic "sloppiness" rolls | `ai/chance.ts` (`roll`) | [ ] |
| 16.5 | Intel modes: `probe` / `memory` / `omniscient` | `ai/difficulty.ts` `AiIntelMode`, `ai/intel.ts` | [ ] |
| 16.6 | Build order executor + extra factories + turrets + advanced defenses | `config-driven-strategy.ts` | [ ] |
| 16.7 | Expansion via Waystone Wagon → Camp + econ/turret development | `ai/expand.ts` | [ ] |
| 16.8 | Harvester assignment / spread / flee | `ai/behaviors.ts` `assignHarvesters`, `fleeThreatenedWorkers` | [ ] |
| 16.9 | Repair logic | `behaviors.ts` `repairOwnBuildings` | [ ] |
| 16.10 | Scouting with Rift Familiar | `behaviors.ts` `decideScout` | [ ] |
| 16.11 | Air harass at enemy workers | `behaviors.ts` `decideCombat` (harass branch) | [ ] |
| 16.12 | Multi-axis attack pushes, staging rally, hold guards | `behaviors.ts` `issuePush`, `peelHoldGuards`, `rallyToStaging` | [ ] |
| 16.13 | Retreat when wounded, focus fire | `pullWoundedHome`, `pickFocusTarget` | [ ] |
| 16.14 | Spell usage (meteor clusters, aegis on army, blink siege) | `behaviors.ts` `decideSpells` | [ ] |
| 16.15 | Late-game "commit to a finish" at tick 12 000 (10 min) | `LATE_GAME_TICK` | [ ] |
| 16.16 | Garrison archers into bunkers | `ai/shared.ts` `garrisonNearbyUnits` | [ ] |
| 16.17 | Sandbox AI director (separate hook) | `sandbox/ai-director.ts` | [ ] |
| 16.18 | [!] AI deadlocks and never resolves — see plan §10.2 | measured, 8/16 runs stall | [ ] |

## 17. Multiplayer (lockstep over a Railway relay)

| # | Feature | v1 implementation | v2 |
|---|---|---|---|
| 17.1 | Room create / join by 4-letter-ish code | `src/net/multiplayer.ts` (`generateRoomCode`), `relay/relay-app.mjs` | [ ] |
| 17.2 | Host/guest lobby over the wire with claim + ready | `net/lobby-client.ts`, `net/lobby-wire.ts` | [ ] |
| 17.3 | Relay merges per-player commands in sorted player-id order, deterministic | `relay/relay-app.mjs` `mergePending` | [ ] |
| 17.4 | Relay paces its clock to the slowest peer via ACKs | `lockstep.ts` `ackProcessed`, relay tick loop | [ ] |
| 17.5 | Input delay `INPUT_DELAY_TICKS` scheduled ahead of relay head | `lockstep.ts` `scheduleForTick`, `src/net/protocol.ts` | [ ] |
| 17.6 | Gap synthesis (missing ticks become empty command lists) | `lockstep.ts` `ingestTick` | [ ] |
| 17.7 | Per-tick state **checksum** comparison and desync detection | `sim/hash.ts`, `lockstep.ts` `detectDesync` | [ ] |
| 17.8 | Desync report captured as a replay | `app-router.ts` `onDesync` → `serializeReplay` | [ ] |
| 17.9 | Stall detection, "Syncing…" catch-up state, wall-clock-jump reset | `net/lockstep-stall.ts`, `lockstep-stall.test.ts` (18 tests) | [ ] |
| 17.10 | Reconnect with exponential backoff + resync | `net/ws-transport.ts` (`enableReconnect`), `protocol-constants.json` | [ ] |
| 17.11 | Rejoin an in-progress match from the main menu | `storage/online-session.ts`, `app-router.ts` `rejoinOnlineMatch` | [ ] |
| 17.12 | Relay-side rejoin grace window (30 min) | `relay/relay-app.mjs` `REJOIN_GRACE_MS` | [ ] |
| 17.13 | Static asset serving from the same Railway service | `relay/static.mjs`, `relay/production.mjs` | [ ] |
| 17.14 | Protocol message schema (zod) | `net/protocol-schema.ts` | [ ] |
| 17.15 | AI players allowed inside online matches (deterministic AI on all peers) | `game.ts:181`, `lockstep-integration.test.ts` | [ ] |
| 17.16 | Relay lobby wire-protocol tests | `tests/relay-lobby.test.mjs` (12 tests) | [ ] |
| 17.17 | 2/3/4-peer determinism to tick 1200 | `tests/lockstep-integration.test.ts` (4 tests) | [ ] |

## 18. Determinism & architecture

| # | Rule | v1 implementation | v2 |
|---|---|---|---|
| 18.1 | `src/sim/**` may not import render/ui/audio/input/storage; no `Math.random`/`Date`/`window`/`document`/`performance` | `eslint.config.js`, `tests/architecture.test.ts` | [ ] |
| 18.2 | Fixed 20 Hz tick, fixed system order | `sim/step.ts`, `TICK_HZ` | [ ] |
| 18.3 | Commands are the only mutation path | `sim/systems/apply-commands.ts` | [ ] |
| 18.4 | Entity iteration sorted by id for mutating loops | `sim/queries.ts` `entitiesSorted` | [ ] |
| 18.5 | `hashState()` covers tick, rng, players, all entities | `sim/hash.ts` | [ ] |
| 18.6 | Determinism tests incl. 1200-tick AI match | `tests/determinism.test.ts` (5 tests) | [ ] |
| 18.7 | Zustand-free, engine-free hand-rolled code | whole repo | [ ] |
| 18.8 | Data validated by Zod at load with file+path errors | `data/schemas.ts`, `data/loader.ts` | [ ] |
| 18.9 | Mod loader / overlay manifest | `data/mod-loader.ts`, `data/manifest.json` | [ ] |
| 18.10 | Sim optionally runs in a Web Worker with delta mirroring | `app/sim.worker.ts`, `app/worker-client.ts`, `sim/worker/sim-host.ts` | [ ] |
| 18.11 | Replay record/serialize | `sim/replay.ts` | [ ] |
| 18.12 | State transfer / save-migration helpers | `sim/state-transfer.ts`, `sim/sync-delta.ts` | [ ] |
| 18.13 | [!] `GameState.rngState` is seeded but **never consumed** — seeds do nothing | see plan §10.3 | [ ] |

## 19. Audio

| # | Feature | v1 implementation | v2 |
|---|---|---|---|
| 19.1 | Fully procedural Web Audio (no binary assets) | `src/audio/audio.ts` | [ ] |
| 19.2 | Per-event voice map (select / move / attack / die / ready) | `audio.ts` `voiceFor` | [ ] |
| 19.3 | Multi-crystal sentry firing pitches | `audio.ts` (`crystalIndex`) | [ ] |
| 19.4 | Sanctuary Spire idle/combat ambience loop | `audio.ts` + `render/sanctuary-spire-vfx.ts` | [ ] |
| 19.5 | Mute/volume from settings | `audio.ts` `setMuted`/`setVolume` | [ ] |

## 20. Rendering & VFX

| # | Feature | v1 implementation | v2 |
|---|---|---|---|
| 20.1 | PixiJS v8 renderer, quality profiles | `render/renderer.ts`, `graphics-quality.ts` | [ ] |
| 20.2 | Procedural shape-sprite textures with team tint & 8 facing dirs | `render/shape-sprite.ts` (1322 lines) | [ ] |
| 20.3 | Terrain + height sides + ramp slopes | `render/terrain-draw.ts`, `tile-project.ts` | [ ] |
| 20.4 | Fog rendering (per-run merge for cheap mode) | `render/fog-draw.ts` | [ ] |
| 20.5 | Placement ghosts + build-zone tiles | `render/placement-draw.ts` | [ ] |
| 20.6 | Effects layer: rings, hit sparks, trails, max-active cap | `render/effects.ts` | [ ] |
| 20.7 | Dedicated VFX: sanctuary, sentry, storm conductor, celestial cannon, astral spire, tower beams, lightning, support auras | `render/*-vfx.ts`, `tower-beams.ts` | [ ] |
| 20.8 | Attack tell / pose animation | `render/attack-fx.ts` | [ ] |
| 20.9 | Occlusion markers | `render/unit-occlusion.ts` | [ ] |
| 20.10 | VFX density scaling by quality | `render/vfx-quality.ts` | [ ] |
| 20.11 | Graphics pooling for overlay/selection shapes | `render/graphics-pool.ts` | [ ] |
| 20.12 | Camera micro-shake on impacts | `camera.ts` `triggerMicroShake` | [ ] |

## 21. PWA / platform

| # | Feature | v1 implementation | v2 |
|---|---|---|---|
| 21.1 | Installable manifest, landscape, fullscreen | `vite.config.ts` (`VitePWA`, `display: fullscreen`) | [ ] |
| 21.2 | Service worker precache + autoUpdate + skipWaiting | `vite.config.ts` `workbox` | [ ] |
| 21.3 | Cache headers (HTML/SW revalidate, assets immutable) | `public/_headers` | [ ] |
| 21.4 | App icons 192/512 + maskable | `public/icons/`, `scripts/gen-icons.mjs` | [ ] |
| 21.5 | Landscape lock attempt + portrait overlay | `ui/orientation.ts` | [ ] |
| 21.6 | Visual-viewport CSS var sync (`--app-h`, `--app-w`, `--vv-top`) | `ui/viewport.ts` | [ ] |
| 21.7 | Resume handling on visibility change / pageshow | `game.ts` `onVisibilityResume` | [ ] |
| 21.8 | Railway all-in-one deploy (game + relay) | `railway.json`, `nixpacks.toml`, `relay/production.mjs` | [ ] |
| 21.9 | Cloudflare Pages static deploy (solo only) | `wrangler.toml`, `public/_headers`, `docs/DEPLOY.md` | [ ] |

## 22. Test suite (must be matched or exceeded)

| # | Area | v1 test file | count |
|---|---|---|---|
| 22.1 | Determinism (incl. 1200-tick AI match) | `tests/determinism.test.ts` | 5 |
| 22.2 | Lockstep 2/3/4 peers | `tests/lockstep-integration.test.ts` | 4 |
| 22.3 | Lockstep stall/catch-up | `tests/lockstep-stall.test.ts` | 18 |
| 22.4 | Relay lobby wire protocol | `tests/relay-lobby.test.mjs` | 12 |
| 22.5 | AI difficulty & determinism | `tests/ai-difficulty.test.ts` | 19 |
| 22.6 | Verticality / terrain height | `tests/verticality.test.ts`, `terrain-height.test.ts` | 25 |
| 22.7 | Economy, gating, pacing | `tests/economy*.test.ts` | 14 |
| 22.8 | Combat & counters | `tests/combat.test.ts`, `defense-mechanics.test.ts` | 11 |
| 22.9 | Fog | `tests/fog.test.ts` | 8 |
| 22.10 | Superweapon | `tests/superweapon.test.ts` | 7 |
| 22.11 | Garrison / mobile HQ / morph | `garrison.test.ts`, `mobile-hq.test.ts` | 7 |
| 22.12 | Input: gesture, keyboard, parity, pointer-binder | 4 files | 35 |
| 22.13 | HUD: compact-ui, scroll, building-inspect, building-actions | 4 files | 30 |
| 22.14 | Sandbox (incl. extended) | `sandbox.test.ts`, `sandbox-extended.test.ts` | 39 |
| 22.15 | Gallery preview | `gallery-preview.test.ts` | 10 |
| 22.16 | Worker determinism | `worker.test.ts`, `worker-delta-mirror.test.ts` | 4 |
| 22.17 | Save / state transfer | `save.test.ts`, `state-transfer.test.ts` | 6 |
| 22.18 | Pathing / movement | `pathing.test.ts`, `movement.test.ts` | 7 |
| 22.19 | AI-vs-AI balance harness (slow) | `tests/balance.test.ts` | 2 |
| 22.20 | E2E smoke / canvas / solo tick / sandbox | `e2e/*.spec.ts` | 6 |
| **Total (fast suite)** | | `npm test` | **431 passing** |
