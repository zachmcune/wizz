// IS THE EXPANSION BLOCKED BY `countBases`, OR BY THE CHAIN ITSELF?
//
// Hypothesis under test: `countBases` clusters buildings by distance from a RUNNING CENTROID with a 12-tile
// radius, so the first 40-mana chain link laid toward an expansion — which is by construction ~6 tiles beyond
// the base's existing footprint — registers as a SECOND BASE. `bases < profile.targetBases` then reads
// `2 < 2` and the expansion branch is skipped for the rest of the match.
//
// The experiment: hold everything else fixed and lift `targetBases` well above any count the map can produce.
// If the expansion then completes, the gate is the counter, not the chain.
//
//   npx vite-node audit/expand-gate.ts 1000 hard normal 30 2 10
//      seed d0 d1 minutes targetBases0 targetBases1

import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { bestExpansionSite, countBases } from '../src/ai/economy';
import { TILE } from '../src/core/constants';
import type { Perception } from '../src/ai/perception';
import type { AiBrain } from '../src/ai/brain';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--')).map(Number);
const seed = args[0] ?? 1000;
const minutes = args[3] ?? 30;
const tb0 = args[4] ?? 2;
const tb1 = args[5] ?? 2;

const reg = loadRegistry();
const { state, services } = initMatch(reg, {
  mapId: 'duel_glade',
  seed,
  oneSuperweaponPerPlayer: false,
  players: [
    { id: 'p1', controller: 'ai', aiDifficulty: 'hard', team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: 0 },
    { id: 'p2', controller: 'ai', aiDifficulty: 'normal', team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: 1 },
  ],
} as never);

const drv = new AiDriver(reg, services, {
  profileOverrides: { p1: { targetBases: tb0 }, p2: { targetBases: tb1 } },
});

/** Clusters that contain at least one refinery or the yard — a base that actually mines. */
function functionalBases(per: Perception): number {
  const CLUSTER = TILE * 12;
  const anchors = per.myBuildings.filter((b) => {
    const d = reg.buildings.get(b.defId);
    return !!d?.isRefinery || !!d?.isConstructionYard;
  });
  const used = new Set<number>();
  let n = 0;
  for (const a of anchors) {
    if (used.has(a.id)) continue;
    n++;
    for (const b of anchors) if (Math.hypot(b.x - a.x, b.y - a.y) <= CLUSTER) used.add(b.id);
  }
  return n;
}

const brainOf = (p: string): AiBrain | undefined => drv.brain(p);
const notesSeen = new Set<string>();
console.log(`expand-gate seed=${seed} ${minutes}min  targetBases p1=${tb0} p2=${tb1}`);
const cap = minutes * 60 * 20;
for (let t = 0; t < cap && !state.ended; t++) {
  stepSimulation(state, services, [], drv.hook);
  if (state.tick % (20 * 60) !== 0) continue;
  const minute = state.tick / 1200;
  const parts: string[] = [];
  for (const p of ['p1', 'p2'] as const) {
    const b = brainOf(p);
    if (!b) continue;
    const per = b.perception(state);
    const site = bestExpansionSite(per, reg, services);
    const nearOwn = site
      ? per.myBuildings.reduce((best, x) => Math.min(best, Math.hypot(x.x - site.x, x.y - site.y)), Infinity)
      : NaN;
    parts.push(
      `${p} bases=${countBases(per, reg)} fn=${functionalBases(per)} bld=${per.myBuildings.length}` +
        ` site=${site ? `${Math.round(nearOwn)}` : '-'} mana=${Math.round(per.mana)}`,
    );
  }
  console.log(`t=${minute.toFixed(0).padStart(2)}m ` + parts.join(' | '));
  for (const p of ['p1', 'p2'] as const) {
    for (const n of drv.notes(p) as string[]) {
      if (!/EXPAND/i.test(n) || notesSeen.has(p + n)) continue;
      notesSeen.add(p + n);
      console.log(`   ${p} note t=${minute.toFixed(0)}m: ${n}`);
    }
  }
}

console.log(`\nended=${state.ended} at ${(state.tick / 1200).toFixed(1)} min`);
for (const p of ['p1', 'p2'] as const) {
  const b = brainOf(p);
  if (!b) continue;
  const per = b.perception(state);
  const home = per.myBuildings[0];
  const outside = per.myBuildings.filter((x) => (home ? Math.hypot(x.x - home.x, x.y - home.y) > TILE * 12 : false));
  console.log(
    `${p} buildings: ` + per.myBuildings.map((x) => `${x.defId}@(${Math.round(x.x)},${Math.round(x.y)})`).join(' '),
  );
  console.log(`   OUTSIDE START CLUSTER: ${outside.map((x) => x.defId).join(',') || '(none)'}`);
}
