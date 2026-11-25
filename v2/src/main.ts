// v2 app entry: boot the renderer against a headless sim so the game is actually playable-viewable.
//
// Phase 3 scope: this replaces the Phase-1 boot screen with a real rendered match. A scripted bot
// drives both sides (the real AI is Phase 5), the renderer draws it, and a minimal HUD shows the
// numbers a reviewer needs to confirm the sim and renderer agree.

import './ui/fonts.css';
import './ui/tokens.css';
import './ui/components.css';
import './styles/boot.css';
import { loadRegistry } from './data/loader';
import type { Registry } from './data/registry';
import { initMatch } from './sim/factory';
import { stepSimulation } from './sim/step';
import type { GameState } from './sim/types';
import type { SimServices } from './sim/context';
import { AiDriver } from './ai/driver';
import { loadAtlas } from './render/atlas';
import { MAX_UNITS_PER_PLAYER } from './core/constants';
import { button, densityFor, el as kitEl, resource, setDensity } from './ui/kit';
import type { LoadedAtlas } from './render/atlas';
import { Renderer, teamIdForColor } from './render/renderer';
import { TICK_MS } from './core/constants';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

async function boot(): Promise<void> {
  const host = document.getElementById('boot');
  if (!host) return;

  // Density is resolved from the real viewport and re-applied on resize, so the whole UI rescales from
  // one attribute rather than per-component media queries.
  const applyDensity = (): void => setDensity(densityFor(window.innerWidth, window.innerHeight));
  applyDensity();
  window.addEventListener('resize', applyDensity);

  host.replaceChildren();
  host.className = 'game-shell';

  const t0 = performance.now();
  const registry: Registry = loadRegistry();
  // Absolute path: `import.meta.env.BASE_URL` is './' here, which makes the request relative to the
  // current URL and resolves to the wrong place. Vite serves `public/` at the site root.
  const atlas: LoadedAtlas = await loadAtlas('/atlas-final/');

  /**
   * SEED AND DIFFICULTIES COME FROM THE URL, so a proof capture can select a specific match rather than whichever one the
   * hard-coded seed happens to produce. Without this the AI-vs-AI page always played the SAME game, and a request to capture
   * "10 and 18 minutes of a Hard vs Normal match" was impossible: that fixed seed finished at 11.3 minutes.
   *
   * Defaults are unchanged, so the page behaves the same for a casual visit.
   */
  const params = new URLSearchParams(window.location.search);
  const spectateSeed = Number(params.get('seed') ?? '20251113') || 20251113;
  const d0 = (params.get('d0') ?? 'hard') as 'easy' | 'normal' | 'hard';
  const d1 = (params.get('d1') ?? 'normal') as 'easy' | 'normal' | 'hard';
  const { state, services }: { state: GameState; services: SimServices } = initMatch(registry, {
    mapId: 'duel_glade',
    seed: spectateSeed,
    players: [
      /**
       * The ids are `p1`/`p2`, matching the tournament harness — NOT `player0`/`player1`.
       *
       * The AI derives its seeded opening variant from the match seed AND the player id, so a different id string produces a
       * different opening and therefore a DIFFERENT GAME. Captures taken with `player0` were showing a match that ended at 16.3
       * minutes while the tournament's seed-1000 match runs 22.9 — same seed, same difficulties, different ids. Matching the
       * harness ids is what makes a recording or screenshot show the game the measurements describe.
       */
      { id: 'p1', controller: 'ai', aiDifficulty: d0, team: 0, color: '#4f9dff', startIndex: 0, factionId: 'arcane' },
      /**
       * startIndex 1, matching the tournament harness. It was 3 here, which put the second player in a different corner and
       * therefore produced a DIFFERENT GAME from the one the measurements describe — a capture of "the Hard vs Normal match"
       * that is not the measured match is misleading, even though both are legal games.
       */
      { id: 'p2', controller: 'ai', aiDifficulty: d1, team: 1, color: '#ff5d5d', startIndex: 1, factionId: 'arcane' },
    ],
  });

  /**
   * THE SPECTATE PAGE RUNS THE REAL AI.
   *
   * This page used to drive both sides with a hand-written script in this file (`botCommands`), which meant a recording or a
   * screenshot of it showed a demo bot — NOT the Phase 5 AI that the tournament measures. Evidence that shows a different
   * opponent than the one being claimed is worse than no evidence, so the page now uses `AiDriver`, the same decision code
   * every match, test and tournament result in this phase runs through.
   */
  const aiDriver = new AiDriver(registry, services);

  const canvasHost = el('div', 'game-canvas-host');
  canvasHost.dataset.testid = 'game-canvas-host';
  host.appendChild(canvasHost);

  const renderer = new Renderer(registry, registry.map('duel_glade'));
  await renderer.init(canvasHost, atlas);
  renderer.setViewer('blue');

  // Centre on the player's base.
  const sanctum = (() => {
    for (let s = 0; s < state.entities.count; s++) {
      if (state.entities.dead[s]) continue;
      if (state.entities.extras[s]!.defId === 'sanctum' && state.entities.ownerIndex[s] === 0) return s;
    }
    return -1;
  })();
  if (sanctum >= 0) renderer.camera.centerOn(state.entities.posX[sanctum]!, state.entities.posY[sanctum]!);
  renderer.camera.setZoom(1.15);

  // ---- HUD, built from the design system.
  //
  // The resource bar is a real readout fed by the simulation, not a placeholder: mana and population
  // are read from state each frame. The debug line stays available but visually subordinate.
  const hud = el('div', 'game-hud');

  const bar = kitEl('div', 'hud-bar plate');
  const manaRes = resource('mana', '0', 'Mana');
  const supplyRes = resource('supply', '0 / 0', 'Units');
  const manaValue = manaRes.querySelector('.res__value') as HTMLElement;
  const supplyValue = supplyRes.querySelector('.res__value') as HTMLElement;
  bar.append(manaRes, supplyRes);

  const stats = el('div', 'hud-stats');

  hud.append(bar, stats);
  host.appendChild(hud);

  const hint = el('div', 'hud-hint plate', 'Drag to pan  ·  wheel or + / - to zoom');
  hud.append(hint);

  const zoomRow = el('div', 'hud-zoom');
  const zoomIn = button({ icon: 'zoom-in', label: 'Zoom in', iconOnly: true, size: 'sm' });
  const zoomOut = button({ icon: 'zoom-out', label: 'Zoom out', iconOnly: true, size: 'sm' });
  zoomIn.addEventListener('click', () => renderer.camera.zoomBy(1.2));
  zoomOut.addEventListener('click', () => renderer.camera.zoomBy(1 / 1.2));
  zoomRow.append(zoomOut, zoomIn);
  host.appendChild(zoomRow);

  // Keep the readouts in sync with the simulation.
  const syncReadouts = (): void => {
    const me = state.players[0];
    if (!me) return;
    const mana = Math.round(me.mana ?? 0);
    manaValue.textContent = mana.toLocaleString('en-US').replace(/,/g, ' ');
    let count = 0;
    for (let i = 0; i < state.entities.count; i++) {
      if (!state.entities.dead[i] && state.entities.kind[i] === 0 && state.entities.ownerIndex[i] === 0) count++;
    }
    supplyValue.textContent = `${count} / ${MAX_UNITS_PER_PLAYER}`;
  };

  // ---- input: drag to pan, wheel to zoom
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  const canvas = renderer.app.canvas;
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    renderer.camera.panByScreen(e.clientX - lastX, e.clientY - lastY);
    lastX = e.clientX;
    lastY = e.clientY;
  });
  canvas.addEventListener('pointerup', (e) => {
    dragging = false;
    canvas.releasePointerCapture(e.pointerId);
  });
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      renderer.camera.zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12);
    },
    { passive: false },
  );
  window.addEventListener('keydown', (e) => {
    const step = 60;
    if (e.key === 'ArrowLeft' || e.key === 'a') renderer.camera.panByScreen(step, 0);
    else if (e.key === 'ArrowRight' || e.key === 'd') renderer.camera.panByScreen(-step, 0);
    else if (e.key === 'ArrowUp' || e.key === 'w') renderer.camera.panByScreen(0, step);
    else if (e.key === 'ArrowDown' || e.key === 's') renderer.camera.panByScreen(0, -step);
  });

  /**
   * SPECTATE SPEED.
   *
   * `?speed=N` multiplies how much simulation time each rendered frame consumes, so a full AI-vs-AI match can be recorded in
   * a few minutes instead of twenty. It only changes how many fixed 20 Hz ticks are consumed per frame -- never the tick
   * count, the step order, or the RNG -- so the outcome is byte-identical to a real-time run. That is what makes the
   * recording evidence rather than a separate, unverified playthrough.
   */
  const speed = Math.max(1, Math.min(20, Number(new URLSearchParams(window.location.search).get('speed') ?? '1') || 1));

  // ---- main loop: fixed 20 Hz sim, interpolated render
  let acc = 0;
  let last = performance.now();
  let fps = 60;
  let simMs = 0;
  let renderMs = 0;

  const frame = (now: number): void => {
    /**
     * At 10 fps a 100 ms cap means each frame advances at most 100 ms of sim time, so `speed` could never exceed about 2x
     * no matter what was requested. A 500 ms cap lets a low-frame-rate spectate page actually reach the requested speed while
     * still bounding the catch-up after a stall (a tab backgrounded for a minute does not replay the whole minute).
     */
    const dt = Math.min(500, now - last);
    last = now;
    fps = fps * 0.92 + (1000 / Math.max(1, dt)) * 0.08;
    acc += dt * speed;
    let steps = 0;
    const st = performance.now();
    while (acc >= TICK_MS && steps < 20 * speed) {
      if (!state.ended) {
        const cmds = aiDriver.hook(state, services);
        const res = stepSimulation(state, services, cmds);
        void res;
      }
      acc -= TICK_MS;
      steps++;
    }
    if (steps > 0) {
      simMs = simMs * 0.8 + ((performance.now() - st) / steps) * 0.2;
      syncReadouts();
    renderer.sync(state);
    }
    const rT0 = performance.now();
    renderer.render(state, Math.min(1, acc / TICK_MS), new Set());
    renderMs = renderMs * 0.8 + (performance.now() - rT0) * 0.2;

    const p0 = state.players[0]!;
    const p1 = state.players[1]!;
    let u0 = 0;
    let u1 = 0;
    for (let s = 0; s < state.entities.count; s++) {
      if (state.entities.dead[s] || state.entities.kind[s] !== 0) continue;
      if (state.entities.ownerIndex[s] === 0) u0++;
      else if (state.entities.ownerIndex[s] === 1) u1++;
    }
    stats.textContent =
      `${fps.toFixed(0)} fps · ${simMs.toFixed(2)} ms sim · ${renderMs.toFixed(2)} ms render · ` +
      `${renderer.statsView.drawn}/${renderer.statsView.total} drawn\n` +
      `Mana ${Math.floor(p0.mana)} / ${Math.floor(p1.mana)}   Units ${u0} / ${u1}   ` +
      `t=${(state.tick / 1200).toFixed(1)}m`;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  /**
   * Demo-only: populate the map centre with a mixed army from both sides.
   *
   * Phase 3 is about the RENDERER; the real AI is Phase 5. To prove the renderer under load (and to
   * produce a battle screenshot worth reviewing) this spawns a representative force using the sim's
   * own dev commands, so every sprite type is on screen fighting.
   */
  const spawnBattle = (perSide = 26): void => {
    const centreX = 2048;
    const centreY = 1320;
    // The full roster, so a massed-battle shot exercises every unit type rather than only the pilot
    // five. Ordered so the mixes in each rank are deliberately varied.
    const units = [
      'stone_golem',
      'imp_swarmling',
      'arcane_archer',
      'storm_caster',
      'cinder_acolyte',
      'thornling',
      'wisp',
      'grove_warden',
      'mana_weaver',
      'rift_familiar',
      'rift_skimmer',
      'siege_behemoth',
      'obsidian_siege',
      'waystone_wagon',
    ];
    // Ids must match the players created above (`p1`/`p2`), or `applyCommands` rejects every order by owner.
    for (const [side, pid] of ['p1', 'p2'].entries()) {
      const sign = side === 0 ? -1 : 1;
      for (let i = 0; i < perSide; i++) {
        const defId = units[i % units.length]!;
        /**
         * FORMATION SPACING.
         *
         * The previous version used 5 ranks 26 world units apart, which is narrower than a Stone
         * Golem is wide (32 units) once the 2.9x visual scale is applied — so the front rank physically
         * overlapped the rank behind it and the fight rendered as one grey mass. Ranks are now 46
         * units apart and files 44 apart, which clears the widest unit and leaves a visible gap of
         * terrain between bodies.
         */
        const files = 4;
        const rank = Math.floor(i / files);
        const file = i % files;
        const x = centreX + sign * (90 + rank * 46);
        const y = centreY + (file - (files - 1) / 2) * 44 + sign * 30;
        stepSimulation(state, services, [
          { type: 'devSpawnUnit', playerId: pid, defId, x, y, count: 1 },
        ]);
      }
      // A couple of visible buildings at the fight so structures render in the shot too.
      stepSimulation(state, services, [
        { type: 'devSpawnBuilding', playerId: pid, defId: 'arcane_sentry', x: centreX + sign * 320, y: centreY + sign * 150, complete: true },
      ]);
      stepSimulation(state, services, [
        { type: 'devSpawnBuilding', playerId: pid, defId: side === 0 ? 'sanctum' : 'obsidian_bastion', x: centreX + sign * 420, y: centreY - sign * 150, complete: true },
      ]);
    }
    // Order both sides to attack-move into each other.
    const ids0: number[] = [];
    const ids1: number[] = [];
    const store = state.entities;
    for (let s = 0; s < store.count; s++) {
      if (store.dead[s] || store.kind[s] !== 0) continue;
      const oi = store.ownerIndex[s];
      if (oi === 0) ids0.push(store.id[s]!);
      else if (oi === 1) ids1.push(store.id[s]!);
    }
    stepSimulation(state, services, [
      { type: 'attackMove', playerId: 'p1', entityIds: ids0, x: centreX + 120, y: centreY },
      { type: 'attackMove', playerId: 'p2', entityIds: ids1, x: centreX - 120, y: centreY },
    ]);
    renderer.sync(state);
    renderer.camera.centerOn(centreX, centreY);
    renderer.camera.setZoom(1.0);
  };

  // Expose for the proof harness.
  (window as unknown as { __v2?: unknown }).__v2 = {
    state,
    renderer,
    registry,
    spawnBattle,
    loadMs: performance.now() - t0,
    teamOf: (i: number) => teamIdForColor(state.players[i]!.color),
  };
}

boot().catch((err) => {
  const host = document.getElementById('boot');
  if (host) {
    host.replaceChildren();
    const card = el('div', 'card err');
    card.append(el('h2', undefined, 'Failed to start'), document.createTextNode(String(err)));
    host.append(card);
  }
  (window as unknown as { __v2Error?: string }).__v2Error = String(err);
});
