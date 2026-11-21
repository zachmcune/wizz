// Phase 2 evidence: a screen recording of a real headless match replayed into a canvas.
//
// Phase 2 has no renderer (that is Phase 3), so this is deliberately NOT a game renderer: it is a
// minimal top-down debug view that lets a reviewer WATCH the simulation run — units moving, combat
// resolving, buildings appearing, mana climbing. Every pixel is read from the same GameState the
// tests assert on, so the recording is evidence of sim behaviour rather than a mockup.
//
//   node v2/audit/phase2-video.mjs

import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const v2Root = join(here, '..');
const outDir = join(v2Root, 'docs', 'proof', 'phase-2');
mkdirSync(outDir, { recursive: true });

// ---- 1. Simulate a match ahead of time and record a frame of state per N ticks.
const entry = join(v2Root, '.record-entry.ts');
const bundle = join(v2Root, '.record-bundle.mjs');

const entrySource = `
import { getRegistry } from './tests/helpers';
import { initMatch } from './src/sim/factory';
import { stepSimulation } from './src/sim/step';
import { hashState } from './src/sim/hash';
import { TILE } from './src/core/constants';
import type { Command, GameState } from './src/sim/types';
import type { SimServices } from './src/sim/context';
import { buildProgressOf, getHarvester, getProductionQueue } from './src/sim/capabilities';
import { getPlayer } from './src/sim/queries';

function botCommands(state: GameState, services: SimServices, me: string): Command[] {
  const cmds: Command[] = [];
  const store = state.entities;
  const player = getPlayer(state, me);
  if (!player || player.defeated) return cmds;
  const oi = store.ownerIndexFor(me);

  let sanctum = -1, spire = -1, circle = -1, forge = -1;
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
  const sx = store.posX[sanctum]!, sy = store.posY[sanctum]!;

  if (spire < 0 && player.mana >= 750) { cmds.push({ type: 'build', playerId: me, defId: 'attunement_spire', x: sx + 112, y: sy + 80 }); return cmds; }
  const hasLey = (() => { for (let s=0;s<store.count;s++){ if(store.dead[s]||store.kind[s]!==1)continue; if(store.ownerIndex[s]!==oi)continue; if(store.extras[s]!.defId==='ley_conduit'&&buildProgressOf(store.extras[s]!)===undefined)return true;} return false; })();
  if (spire >= 0 && !hasLey && player.mana >= 300) { cmds.push({ type: 'build', playerId: me, defId: 'ley_conduit', x: sx - 112, y: sy + 80 }); return cmds; }
  if (spire >= 0 && circle < 0 && player.mana >= 550) { cmds.push({ type: 'build', playerId: me, defId: 'summoning_circle', x: sx + 176, y: sy + 96 }); return cmds; }
  if (circle >= 0 && forge < 0 && hasLey && player.mana >= 850) { cmds.push({ type: 'build', playerId: me, defId: 'golem_forge', x: sx - 176, y: sy + 96 }); return cmds; }

  const wisps: number[] = [];
  let node = -1, bestD = Infinity;
  for (let s = 0; s < store.count; s++) {
    if (store.dead[s]) continue;
    if (store.kind[s] === 0 && store.ownerIndex[s] === oi && getHarvester(store.extras[s]!)) wisps.push(s);
    if (store.extras[s]!.defId === 'mana_node') {
      const d = Math.hypot(store.posX[s]! - sx, store.posY[s]! - sy);
      if (d < bestD) { bestD = d; node = s; }
    }
  }
  if (spire >= 0 && wisps.length < 5) {
    const q = getProductionQueue(store.extras[spire]!);
    if ((q?.length ?? 0) === 0 && player.mana >= 200) cmds.push({ type: 'produce', playerId: me, buildingId: store.id[spire]!, defId: 'wisp' });
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
    if ((q?.length ?? 0) < 3 && player.mana >= 400) {
      const want = army.length % 4 === 0 ? 'arcane_archer' : 'imp_swarmling';
      cmds.push({ type: 'produce', playerId: me, buildingId: store.id[circle]!, defId: want });
    }
  }
  if (forge >= 0) {
    const q = getProductionQueue(store.extras[forge]!);
    if ((q?.length ?? 0) < 2 && player.mana >= 700) cmds.push({ type: 'produce', playerId: me, buildingId: store.id[forge]!, defId: 'stone_golem' });
  }

  if (army.length >= 8) {
    let tx = 0, ty = 0, found = false;
    for (let s = 0; s < store.count; s++) {
      if (store.dead[s] || store.kind[s] !== 1) continue;
      const o = store.ownerId(store.ownerIndex[s]!);
      if (o === me || state.relations[me]?.[o] !== 'enemy') continue;
      tx = store.posX[s]!; ty = store.posY[s]!; found = true; break;
    }
    if (found) {
      const idle = army.filter((s) => store.extras[s]!.orders.length === 0);
      if (idle.length > 0) cmds.push({ type: 'attackMove', playerId: me, entityIds: idle.map((s) => store.id[s]!), x: tx, y: ty });
    }
  }
  return cmds;
}

export function record(maxTicks: number, everyTicks: number, seed: number) {
  const reg = getRegistry();
  const { state, services } = initMatch(reg, {
    mapId: 'duel_glade', seed,
    players: [
      { id: 'player0', controller: 'ai', team: 0, color: '#4f9dff', startIndex: 0, factionId: 'arcane' },
      { id: 'player1', controller: 'ai', team: 1, color: '#ff5d5d', startIndex: 3, factionId: 'arcane' },
    ],
  });
  const colors: Record<string, string> = { player0: '#4f9dff', player1: '#ff5d5d' };
  const frames: any[] = [];

  const snap = () => {
    const store = state.entities;
    const ents: any[] = [];
    for (let s = 0; s < store.count; s++) {
      if (store.dead[s]) continue;
      const kind = store.kind[s]!;
      if (kind === 2) continue; // skip projectiles for clarity
      const d = store.extras[s]!.defId;
      const o = store.ownerId(store.ownerIndex[s]!);
      ents.push({
        x: store.posX[s]!, y: store.posY[s]!, kind, d,
        owner: o, hp: store.hp[s]!, max: store.maxHp[s]!,
        color: colors[o] ?? '#39d0c0',
        r: store.radius[s]!,
      });
    }
    frames.push({
      tick: state.tick,
      mana: state.players.map((p) => Math.floor(p.mana)),
      units: state.players.map((p, i) => { let n=0; for (let s=0;s<store.count;s++){ if(store.dead[s])continue; if(store.kind[s]!==0)continue; if(store.ownerIndex[s]!==i)continue; n++; } return n; }),
      ents, ended: state.ended, winner: state.winnerTeam,
    });
  };

  snap();
  while (state.tick < maxTicks && !state.ended) {
    const cmds = [
      ...(state.players[0]!.defeated ? [] : botCommands(state, services, 'player0')),
      ...(state.players[1]!.defeated ? [] : botCommands(state, services, 'player1')),
    ];
    stepSimulation(state, services, cmds);
    if (state.tick % everyTicks === 0) snap();
  }
  if (!state.ended) snap();
  return { frames, hash: hashState(state), mapW: reg.map('duel_glade').tileW * TILE, mapH: reg.map('duel_glade').tileH * TILE, tiles: reg.map('duel_glade').tiles, tileW: reg.map('duel_glade').tileW, heights: reg.map('duel_glade').heights };
}
`;

try {
  writeFileSync(entry, entrySource);
  execFileSync('npx', ['esbuild', entry, '--bundle', '--platform=node', '--format=esm', `--outfile=${bundle}`, '--log-level=error'], { cwd: v2Root, stdio: 'inherit' });
  const mod = await import(pathToFileURL(bundle).href);
  const rec = mod.record(7200, 4, 12345);
  console.log(`recorded ${rec.frames.length} frames, final hash ${rec.hash}`);

  // ---- 2. Write an HTML harness that plays the frames back.
  const htmlPath = join(v2Root, '.record-viewer.html');
  const dataPath = join(v2Root, '.record-data.json');
  writeFileSync(dataPath, JSON.stringify(rec));

  writeFileSync(
    htmlPath,
    `<!doctype html><html><head><style>
      html,body{margin:0;background:#0d0b16;overflow:hidden;font-family:system-ui,sans-serif}
      canvas{display:block}
      #hud{position:fixed;left:12px;top:10px;color:#e8e4f8;font-size:13px;line-height:1.5;
           background:rgba(23,20,38,.82);border:1px solid #2e2947;border-radius:8px;padding:8px 12px}
      #hud b{color:#9b8cff}
      #end{position:fixed;inset:0;display:none;align-items:center;justify-content:center;
           color:#fff;font-size:40px;font-weight:800;background:rgba(13,11,22,.75)}
    </style></head><body>
    <canvas id="c"></canvas>
    <div id="hud"></div>
    <div id="end"></div>
    <script>
      const REC = ${JSON.stringify(rec)};
      const c = document.getElementById('c');
      const ctx = c.getContext('2d');
      const hud = document.getElementById('hud');
      const endEl = document.getElementById('end');
      const S = 1366 / REC.mapW;
      function resize(){ c.width = 1366; c.height = Math.round(REC.mapH * S); }
      resize();
      function draw(f) {
        ctx.fillStyle = '#0d0b16'; ctx.fillRect(0,0,c.width,c.height);
        // terrain
        for (let ty=0; ty<Math.round(REC.mapH/32); ty++) for (let tx=0; tx<REC.tileW; tx++) {
          const i = ty*REC.tileW+tx;
          if (REC.tiles[i] === 1) { ctx.fillStyle = '#1a1630'; ctx.fillRect(tx*32*S, ty*32*S, 32*S+0.6, 32*S+0.6); }
          else if (REC.heights[i] > 0) { ctx.fillStyle = '#241f3d'; ctx.fillRect(tx*32*S, ty*32*S, 32*S+0.6, 32*S+0.6); }
        }
        // entities
        for (const e of f.ents) {
          const px = e.x*S, py = e.y*S;
          if (e.d === 'mana_node') {
            ctx.fillStyle = '#39d0c0'; ctx.beginPath(); ctx.arc(px,py,5,0,7); ctx.fill(); continue;
          }
          if (e.kind === 1) {
            const w = Math.max(12, e.r*2*S);
            ctx.fillStyle = e.color + '55'; ctx.strokeStyle = e.color; ctx.lineWidth = 1.5;
            ctx.fillRect(px-w/2, py-w/2, w, w); ctx.strokeRect(px-w/2, py-w/2, w, w);
          } else {
            ctx.fillStyle = e.color;
            ctx.beginPath(); ctx.arc(px, py, Math.max(3.2, e.r*S), 0, 7); ctx.fill();
            if (e.hp < e.max) {
              const frac = Math.max(0, e.hp/e.max);
              ctx.fillStyle = '#000a'; ctx.fillRect(px-6, py-9, 12, 2.5);
              ctx.fillStyle = frac > 0.5 ? '#5cff8a' : frac > 0.25 ? '#ffd166' : '#ff6b6b';
              ctx.fillRect(px-6, py-9, 12*frac, 2.5);
            }
          }
        }
        hud.innerHTML = '<b>Arcane Dominion v2 — Phase 2 simulation</b><br>' +
          'tick ' + f.tick + ' · ' + (f.tick/20/60).toFixed(1) + ' min<br>' +
          'Mana &nbsp;P1 <b>' + f.mana[0] + '</b> · P2 <b>' + f.mana[1] + '</b><br>' +
          'Units P1 <b>' + f.units[0] + '</b> · P2 <b>' + f.units[1] + '</b>';
        endEl.style.display = f.ended ? 'flex' : 'none';
        if (f.ended) endEl.textContent = (f.winner === 0 ? 'PLAYER 1 WINS' : f.winner === 1 ? 'PLAYER 2 WINS' : 'DRAW');
      }
      let i = 0;
      draw(REC.frames[0]);
      window.__ready = true;
      window.__play = (fps) => new Promise((res) => {
        const step = () => {
          if (i >= REC.frames.length) { res(true); return; }
          draw(REC.frames[i++]);
          setTimeout(step, 1000/fps);
        };
        step();
      });
    </script></body></html>`,
  );

  // ---- 3. Record it.
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const rawDir = join(outDir, '_vid');
  rmSync(rawDir, { recursive: true, force: true });
  mkdirSync(rawDir, { recursive: true });
  const ctxB = await browser.newContext({ viewport: { width: 1366, height: 768 }, recordVideo: { dir: rawDir, size: { width: 1366, height: 768 } } });
  const page = await ctxB.newPage();
  await page.goto(pathToFileURL(htmlPath).href);
  await page.waitForFunction(() => window.__ready === true);
  await page.waitForTimeout(400);
  // 40 fps playback: the whole match in roughly 20 seconds.
  await page.evaluate(() => window.__play(40));
  await page.waitForTimeout(900);
  const video = page.video();
  await ctxB.close();
  await browser.close();

  if (video) {
    const src = await video.path();
    renameSync(src, join(outDir, 'phase-2-match.mp4'));
    console.log('wrote', join(outDir, 'phase-2-match.mp4'));
  }
  rmSync(rawDir, { recursive: true, force: true });
} finally {
  for (const f of [entry, bundle, join(v2Root, '.record-viewer.html'), join(v2Root, '.record-data.json')]) {
    rmSync(f, { force: true });
  }
}
