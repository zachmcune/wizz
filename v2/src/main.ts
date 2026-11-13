// v2 app entry: boot the renderer against a headless sim so the game is actually playable-viewable.
//
// Phase 3 scope: this replaces the Phase-1 boot screen with a real rendered match. A scripted bot
// drives both sides (the real AI is Phase 5), the renderer draws it, and a minimal HUD shows the
// numbers a reviewer needs to confirm the sim and renderer agree.

import './styles/boot.css';
import { loadRegistry } from './data/loader';
import type { Registry } from './data/registry';
import { initMatch } from './sim/factory';
import { stepSimulation } from './sim/step';
import type { Command, GameState } from './sim/types';
import type { SimServices } from './sim/context';
import { buildProgressOf, getHarvester, getProductionQueue } from './sim/capabilities';
import { getPlayer } from './sim/queries';
import { loadAtlas } from './render/atlas';
import type { LoadedAtlas } from './render/atlas';
import { Renderer, teamIdForColor } from './render/renderer';
import { TICK_MS } from './core/constants';

/** Deterministic scripted player, same shape as the Phase-2 demo bot. */
function botCommands(state: GameState, me: string): Command[] {
  const cmds: Command[] = [];
  const store = state.entities;
  const p = getPlayer(state, me);
  if (!p || p.defeated) return cmds;
  const oi = store.ownerIndexFor(me);

  let sanctum = -1;
  let spire = -1;
  let circle = -1;
  let forge = -1;
  for (let s = 0; s < store.count; s++) {
    if (store.dead[s] || store.kind[s] !== 1) continue;
    if (store.ownerIndex[s] !== oi) continue;
    const d = store.extras[s]!.defId;
    const done = buildProgressOf(store.extras[s]!) === undefined;
    if (d === 'sanctum' && sanctum < 0) sanctum = s;
    else if (d === 'attunement_spire' && done && spire < 0) spire = s;
    else if (d === 'summoning_circle' && done && circle < 0) circle = s;
    else if (d === 'golem_forge' && done && forge < 0) forge = s;
  }
  if (sanctum < 0) return cmds;
  const sx = store.posX[sanctum]!;
  const sy = store.posY[sanctum]!;

  if (spire < 0 && p.mana >= 750) {
    cmds.push({ type: 'build', playerId: me, defId: 'attunement_spire', x: sx + 120, y: sy + 88 });
    return cmds;
  }
  let hasLey = false;
  for (let s = 0; s < store.count; s++) {
    if (store.dead[s] || store.kind[s] !== 1) continue;
    if (store.ownerIndex[s] !== oi) continue;
    if (store.extras[s]!.defId === 'ley_conduit' && buildProgressOf(store.extras[s]!) === undefined) hasLey = true;
  }
  if (spire >= 0 && !hasLey && p.mana >= 300) {
    cmds.push({ type: 'build', playerId: me, defId: 'ley_conduit', x: sx - 120, y: sy + 88 });
    return cmds;
  }
  if (spire >= 0 && circle < 0 && p.mana >= 550) {
    cmds.push({ type: 'build', playerId: me, defId: 'summoning_circle', x: sx + 190, y: sy + 110 });
    return cmds;
  }
  // A second circle roughly doubles army throughput, which is what makes the demo reach a real
  // battle instead of trickling four units into a fight.
  let circleCount = 0;
  for (let s = 0; s < store.count; s++) {
    if (store.dead[s] || store.kind[s] !== 1) continue;
    if (store.ownerIndex[s] !== oi) continue;
    if (store.extras[s]!.defId === 'summoning_circle') circleCount++;
  }
  if (circleCount === 1 && p.mana >= 900) {
    cmds.push({ type: 'build', playerId: me, defId: 'summoning_circle', x: sx - 60, y: sy - 140 });
    return cmds;
  }
  if (circle >= 0 && forge < 0 && hasLey && p.mana >= 850) {
    cmds.push({ type: 'build', playerId: me, defId: 'golem_forge', x: sx - 190, y: sy + 110 });
    return cmds;
  }

  const wisps: number[] = [];
  let node = -1;
  let bd = Infinity;
  for (let s = 0; s < store.count; s++) {
    if (store.dead[s]) continue;
    if (store.kind[s] === 0 && store.ownerIndex[s] === oi && getHarvester(store.extras[s]!)) wisps.push(s);
    if (store.extras[s]!.defId === 'mana_node') {
      const d = Math.hypot(store.posX[s]! - sx, store.posY[s]! - sy);
      if (d < bd) {
        bd = d;
        node = s;
      }
    }
  }
  if (spire >= 0 && wisps.length < 5) {
    const q = getProductionQueue(store.extras[spire]!);
    if ((q?.length ?? 0) === 0 && p.mana >= 200) {
      cmds.push({ type: 'produce', playerId: me, buildingId: store.id[spire]!, defId: 'wisp' });
    }
  }
  if (node >= 0) {
    for (const w of wisps) {
      if (store.extras[w]!.orders.length === 0 && (store.state[w] === 0 || store.state[w] === 3)) {
        cmds.push({ type: 'harvest', playerId: me, entityIds: [store.id[w]!], nodeId: store.id[node]! });
        break;
      }
    }
  }

  const army: number[] = [];
  for (let s = 0; s < store.count; s++) {
    if (store.dead[s] || store.kind[s] !== 0) continue;
    if (store.ownerIndex[s] !== oi) continue;
    const d = store.extras[s]!.defId;
    if (d === 'imp_swarmling' || d === 'arcane_archer' || d === 'stone_golem') army.push(s);
  }
  if (circle >= 0) {
    const q = getProductionQueue(store.extras[circle]!);
    if ((q?.length ?? 0) < 5 && p.mana >= 250) {
      cmds.push({
        type: 'produce',
        playerId: me,
        buildingId: store.id[circle]!,
        defId: army.length % 3 === 0 ? 'arcane_archer' : 'imp_swarmling',
      });
    }
  }
  if (forge >= 0) {
    const q = getProductionQueue(store.extras[forge]!);
    if ((q?.length ?? 0) < 2 && p.mana >= 700) {
      cmds.push({ type: 'produce', playerId: me, buildingId: store.id[forge]!, defId: 'stone_golem' });
    }
  }

  if (army.length >= 8) {
    let tx = 0;
    let ty = 0;
    let found = false;
    for (let s = 0; s < store.count; s++) {
      if (store.dead[s] || store.kind[s] !== 1) continue;
      const o = store.ownerId(store.ownerIndex[s]!);
      if (o === me || state.relations[me]?.[o] !== 'enemy') continue;
      tx = store.posX[s]!;
      ty = store.posY[s]!;
      found = true;
      break;
    }
    if (found) {
      const idle = army.filter((s) => store.extras[s]!.orders.length === 0);
      if (idle.length > 0) {
        cmds.push({ type: 'attackMove', playerId: me, entityIds: idle.map((s) => store.id[s]!), x: tx, y: ty });
      }
    }
  }
  return cmds;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

async function boot(): Promise<void> {
  const host = document.getElementById('boot');
  if (!host) return;
  host.replaceChildren();
  host.className = 'game-shell';

  const t0 = performance.now();
  const registry: Registry = loadRegistry();
  // Absolute path: `import.meta.env.BASE_URL` is './' here, which makes the request relative to the
  // current URL and resolves to the wrong place. Vite serves `public/` at the site root.
  const atlas: LoadedAtlas = await loadAtlas('/atlas/');

  const { state, services }: { state: GameState; services: SimServices } = initMatch(registry, {
    mapId: 'duel_glade',
    seed: 20251113,
    players: [
      { id: 'player0', controller: 'ai', team: 0, color: '#4f9dff', startIndex: 0, factionId: 'arcane' },
      { id: 'player1', controller: 'ai', team: 1, color: '#ff5d5d', startIndex: 3, factionId: 'arcane' },
    ],
  });

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

  // HUD.
  const hud = el('div', 'game-hud');
  const stats = el('div', 'hud-stats');
  const hint = el('div', 'hud-hint', 'drag / arrows to pan · wheel or +/− to zoom');
  hud.append(stats, hint);
  host.appendChild(hud);

  const zoomRow = el('div', 'hud-zoom');
  const zoomIn = el('button', 'hud-btn', '+');
  const zoomOut = el('button', 'hud-btn', '−');
  zoomIn.addEventListener('click', () => renderer.camera.zoomBy(1.2));
  zoomOut.addEventListener('click', () => renderer.camera.zoomBy(1 / 1.2));
  zoomRow.append(zoomOut, zoomIn);
  host.appendChild(zoomRow);

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

  // ---- main loop: fixed 20 Hz sim, interpolated render
  let acc = 0;
  let last = performance.now();
  let fps = 60;
  let simMs = 0;
  let renderMs = 0;

  const frame = (now: number): void => {
    const dt = Math.min(100, now - last);
    last = now;
    fps = fps * 0.92 + (1000 / Math.max(1, dt)) * 0.08;
    acc += dt;
    let steps = 0;
    const st = performance.now();
    while (acc >= TICK_MS && steps < 5) {
      if (!state.ended) {
        const cmds = [
          ...(state.players[0]!.defeated ? [] : botCommands(state, 'player0')),
          ...(state.players[1]!.defeated ? [] : botCommands(state, 'player1')),
        ];
        const res = stepSimulation(state, services, cmds);
        void res;
      }
      acc -= TICK_MS;
      steps++;
    }
    if (steps > 0) {
      simMs = simMs * 0.8 + ((performance.now() - st) / steps) * 0.2;
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
    const units = [
      'imp_swarmling', 'arcane_archer', 'stone_golem', 'storm_caster',
      'rift_skimmer', 'rift_familiar', 'wisp',
    ];
    for (const [side, pid] of ['player0', 'player1'].entries()) {
      const sign = side === 0 ? -1 : 1;
      for (let i = 0; i < perSide; i++) {
        const defId = units[i % units.length]!;
        const x = centreX + sign * (60 + (i % 5) * 26);
        const y = centreY + (Math.floor(i / 5) - 2) * 34 + sign * 40;
        stepSimulation(state, services, [
          { type: 'devSpawnUnit', playerId: pid, defId, x, y, count: 1 },
        ]);
      }
      // A couple of visible buildings at the fight so structures render in the shot too.
      stepSimulation(state, services, [
        { type: 'devSpawnBuilding', playerId: pid, defId: 'arcane_sentry', x: centreX + sign * 260, y: centreY + sign * 120, complete: true },
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
      { type: 'attackMove', playerId: 'player0', entityIds: ids0, x: centreX + 120, y: centreY },
      { type: 'attackMove', playerId: 'player1', entityIds: ids1, x: centreX - 120, y: centreY },
    ]);
    renderer.sync(state);
    renderer.camera.centerOn(centreX, centreY);
    renderer.camera.setZoom(1.0);
  };

  // Expose for the proof harness.
  (window as unknown as { __v2?: unknown }).__v2 = {
    state,
    renderer,
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
