// Phase 2 evidence: run a full headless AI-vs-AI-style match and print a readable log.
//
// There is no AI yet (Phase 5), so this drives a deterministic scripted "bot" that behaves like a
// competent player: builds economy, trains an army, attacks. The point is to prove the whole
// simulation stack runs end to end — construction, production, harvesting, pathing, combat, death,
// win check — and to leave an artifact a reviewer can read.
//
//   node v2/scripts/demo-headless-match.mjs [--ticks N] [--seed N]

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const v2Root = join(here, '..');
const outDir = join(v2Root, 'docs', 'proof', 'phase-2');
mkdirSync(outDir, { recursive: true });

const args = process.argv.slice(2);
const ticksArg = args.indexOf('--ticks');
const seedArg = args.indexOf('--seed');
const MAX_TICKS = ticksArg >= 0 ? Number(args[ticksArg + 1]) : 20 * 60 * 8;
const SEED = seedArg >= 0 ? Number(args[seedArg + 1]) : 12345;

const entry = join(v2Root, '.demo-match-entry.ts');
const bundle = join(v2Root, '.demo-match-bundle.mjs');

const entrySource = `
import { getRegistry } from './tests/helpers';
import { initMatch } from './src/sim/factory';
import { stepSimulation } from './src/sim/step';
import { hashState } from './src/sim/hash';
import { TILE } from './src/core/constants';
import type { Command, GameState } from './src/sim/types';
import type { SimServices } from './src/sim/context';
import { KIND_BUILDING, KIND_UNIT } from './src/sim/entity-store';
import { buildProgressOf, getHarvester, getProductionQueue } from './src/sim/capabilities';
import { getPlayer } from './src/sim/queries';

export interface LogLine { tick: number; text: string }

/** A deterministic scripted player: economy first, then a standing army, then a push. */
function botCommands(state: GameState, services: SimServices, me: string, enemy: string): Command[] {
  const cmds: Command[] = [];
  const store = state.entities;
  const player = getPlayer(state, me);
  if (!player || player.defeated) return cmds;
  const ownerIdx = store.ownerIndexFor(me);

  // Find my buildings.
  let sanctum = -1;
  let spire = -1;
  const circles: number[] = [];
  for (let slot = 0; slot < store.count; slot++) {
    if (store.dead[slot] || store.kind[slot] !== KIND_BUILDING) continue;
    if (store.ownerIndex[slot] !== ownerIdx) continue;
    const defId = store.extras[slot]!.defId;
    if (defId === 'sanctum' && sanctum < 0) sanctum = slot;
    else if (defId === 'attunement_spire' && buildProgressOf(store.extras[slot]!) === undefined) spire = slot;
    else if (defId === 'summoning_circle' && buildProgressOf(store.extras[slot]!) === undefined) circles.push(slot);
  }
  if (sanctum < 0) return cmds;
  const sx = store.posX[sanctum]!;
  const sy = store.posY[sanctum]!;

  // 1. Refinery first — the whole economy depends on it.
  if (spire < 0 && player.mana >= 750) {
    cmds.push({ type: 'build', playerId: me, defId: 'attunement_spire', x: sx + 112, y: sy + 80 });
    return cmds;
  }

  // 2. Power, then a production building.
  const hasLey = (() => {
    for (let slot = 0; slot < store.count; slot++) {
      if (store.dead[slot] || store.kind[slot] !== KIND_BUILDING) continue;
      if (store.ownerIndex[slot] !== ownerIdx) continue;
      if (store.extras[slot]!.defId === 'ley_conduit' && buildProgressOf(store.extras[slot]!) === undefined) return true;
    }
    return false;
  })();
  if (spire >= 0 && !hasLey && player.mana >= 300) {
    cmds.push({ type: 'build', playerId: me, defId: 'ley_conduit', x: sx - 112, y: sy + 80 });
    return cmds;
  }
  if (spire >= 0 && circles.length === 0 && player.mana >= 550) {
    cmds.push({ type: 'build', playerId: me, defId: 'summoning_circle', x: sx + 176, y: sy + 96 });
    return cmds;
  }

  // 3. Keep four harvesters working.
  const wisps: number[] = [];
  const nodes: number[] = [];
  for (let slot = 0; slot < store.count; slot++) {
    if (store.dead[slot]) continue;
    if (store.kind[slot] === KIND_UNIT && store.ownerIndex[slot] === ownerIdx && getHarvester(store.extras[slot]!)) {
      wisps.push(slot);
    } else if (store.extras[slot]!.defId === 'mana_node') {
      nodes.push(slot);
    }
  }
  const nearestNode = (() => {
    let best = -1;
    let bestD = Infinity;
    for (const n of nodes) {
      const d = Math.hypot(store.posX[n]! - sx, store.posY[n]! - sy);
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  })();

  if (spire >= 0 && wisps.length < 4) {
    const q = getProductionQueue(store.extras[spire]!);
    if ((q?.length ?? 0) === 0 && player.mana >= 200) {
      cmds.push({ type: 'produce', playerId: me, buildingId: store.id[spire]!, defId: 'wisp' });
    }
  }
  if (nearestNode >= 0) {
    for (const w of wisps) {
      const ex = store.extras[w]!;
      if (ex.orders.length === 0 && (store.state[w] === 0 || store.state[w] === 3)) {
        cmds.push({ type: 'harvest', playerId: me, entityIds: [store.id[w]!], nodeId: store.id[nearestNode]! });
        break;
      }
    }
  }

  // 4. Build an army from the circle.
  const army: number[] = [];
  for (let slot = 0; slot < store.count; slot++) {
    if (store.dead[slot] || store.kind[slot] !== KIND_UNIT) continue;
    if (store.ownerIndex[slot] !== ownerIdx) continue;
    const d = store.extras[slot]!.defId;
    if (d === 'imp_swarmling' || d === 'arcane_archer' || d === 'stone_golem') army.push(slot);
  }
  for (const c of circles) {
    const q = getProductionQueue(store.extras[c]!);
    if ((q?.length ?? 0) < 2) {
      const want = army.length % 3 === 0 ? 'arcane_archer' : 'imp_swarmling';
      const cost = want === 'arcane_archer' ? 210 : 140;
      if (player.mana >= cost + 100) {
        cmds.push({ type: 'produce', playerId: me, buildingId: store.id[c]!, defId: want });
      }
    }
  }

  // 5. Once there are enough troops, push toward the enemy base.
  if (army.length >= 10) {
    let targetX = 0, targetY = 0, found = false;
    for (let slot = 0; slot < store.count; slot++) {
      if (store.dead[slot] || store.kind[slot] !== KIND_BUILDING) continue;
      const o = store.ownerId(store.ownerIndex[slot]!);
      if (o === me) continue;
      if (state.relations[me]?.[o] !== 'enemy') continue;
      targetX = store.posX[slot]!; targetY = store.posY[slot]!;
      found = true;
      break;
    }
    if (found) {
      // Only re-issue when idle, so units do not thrash.
      const idle = army.filter((s) => store.extras[s]!.orders.length === 0);
      if (idle.length > 0) {
        cmds.push({ type: 'attackMove', playerId: me, entityIds: idle.map((s) => store.id[s]!), x: targetX, y: targetY });
      }
    }
  }
  return cmds;
}

export function runDemo(maxTicks: number, seed: number) {
  const reg = getRegistry();
  const { state, services } = initMatch(reg, {
    mapId: 'duel_glade',
    seed,
    players: [
      { id: 'player0', controller: 'ai', team: 0, color: '#4f9dff', startIndex: 0, factionId: 'arcane' },
      { id: 'player1', controller: 'ai', team: 1, color: '#ff5d5d', startIndex: 3, factionId: 'arcane' },
    ],
  });

  const log: LogLine[] = [];
  let lastReport = -1;
  const counts = () => {
    let u0 = 0, u1 = 0, b0 = 0, b1 = 0;
    const store = state.entities;
    for (let slot = 0; slot < store.count; slot++) {
      if (store.dead[slot]) continue;
      const o = store.ownerIndex[slot]!;
      if (store.kind[slot] === KIND_UNIT) { if (o === 0) u0++; else if (o === 1) u1++; }
      else if (store.kind[slot] === KIND_BUILDING) { if (o === 0) b0++; else if (o === 1) b1++; }
    }
    return { u0, u1, b0, b1 };
  };

  while (state.tick < maxTicks && !state.ended) {
    const p0 = state.players[0]!, p1 = state.players[1]!;
    const cmds = [
      ...(p0.defeated ? [] : botCommands(state, services, 'player0', 'player1')),
      ...(p1.defeated ? [] : botCommands(state, services, 'player1', 'player0')),
    ];
    const res = stepSimulation(state, services, cmds);
    for (const ev of res.events) {
      if (ev.type === 'playerDefeated') log.push({ tick: state.tick, text: \`DEFEATED \${ev.playerId}\` });
      if (ev.type === 'matchEnded') log.push({ tick: state.tick, text: \`MATCH ENDED winner=team \${ev.winnerTeam}\` });
    }
    const minute = Math.floor(state.tick / 1200);
    if (minute !== lastReport) {
      lastReport = minute;
      const c = counts();
      log.push({
        tick: state.tick,
        text: \`t=\${minute}m  mana \${Math.floor(p0.mana)}/\${Math.floor(p1.mana)}  units \${c.u0}/\${c.u1}  buildings \${c.b0}/\${c.b1}  entities \${state.entities.liveCount()}\`,
      });
    }
  }

  return {
    seed,
    ticks: state.tick,
    simMinutes: +(state.tick / 1200).toFixed(2),
    ended: state.ended,
    winnerTeam: state.winnerTeam,
    hash: hashState(state),
    entities: state.entities.liveCount(),
    log,
  };
}
`;

try {
  writeFileSync(entry, entrySource);
  execFileSync(
    'npx',
    ['esbuild', entry, '--bundle', '--platform=node', '--format=esm', `--outfile=${bundle}`, '--log-level=error'],
    { cwd: v2Root, stdio: 'inherit' },
  );
  const mod = await import(pathToFileURL(bundle).href);
  const result = mod.runDemo(MAX_TICKS, SEED);

  const lines = [
    '# Phase 2 headless match log',
    '',
    `Generated by \`node v2/scripts/demo-headless-match.mjs --ticks ${MAX_TICKS} --seed ${SEED}\``,
    '',
    `- seed: ${result.seed}`,
    `- ticks simulated: ${result.ticks} (${result.simMinutes} sim-minutes)`,
    `- ended: ${result.ended}`,
    `- winner team: ${result.winnerTeam}`,
    `- live entities at end: ${result.entities}`,
    `- final state hash: \`${result.hash}\``,
    '',
    '## Timeline',
    '',
    '```',
    ...result.log.map((l) => `[${String(l.tick).padStart(6)}] ${l.text}`),
    '```',
    '',
  ].join('\n');

  writeFileSync(join(outDir, 'headless-match-log.md'), lines);
  console.log(lines);
} finally {
  for (const f of [entry, bundle]) rmSync(f, { force: true });
}
