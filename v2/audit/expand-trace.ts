// WHY DOES THE AI STOP EXPANDING? — per-pass trace of the expansion branch.
//
// The regression under investigation: `docs/proof/phase-5/ai/phase6-fairness.md` §2 records that every refinery and
// construction-yard position across a whole match stays inside the starting cluster, on both difficulties. The
// expansion code is still present, so something upstream of the commands must be refusing.
//
// This harness re-derives every input the expansion branch reads, from the same `Perception` the planner sees, and
// prints them together with what the planner actually decided. It does not change behaviour.
//
//   npx vite-node audit/expand-trace.ts                      # default: seed 1000, hard vs normal, 26 min
//   npx vite-node audit/expand-trace.ts 1000 hard normal 34  # seed, d0, d1, minutes

import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { bestExpansionSite, countBases } from '../src/ai/economy';
import { TILE } from '../src/core/constants';
import { profileFor } from '../src/ai/difficulty';
import { BUILD_ZONE_TILES } from '../src/sim/build-zone';
import type { Perception } from '../src/ai/perception';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const seed = Number(args[0] ?? 1000);
const d0 = (args[1] ?? 'hard') as 'easy' | 'normal' | 'hard';
const d1 = (args[2] ?? 'normal') as 'easy' | 'normal' | 'hard';
const minutes = Number(args[3] ?? 26);

const reg = loadRegistry();
const { state, services } = initMatch(reg, {
  mapId: 'duel_glade',
  seed,
  oneSuperweaponPerPlayer: false,
  players: [
    { id: 'p1', controller: 'ai', aiDifficulty: d0, team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: 0 },
    { id: 'p2', controller: 'ai', aiDifficulty: d1, team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: 1 },
  ],
} as never);

const drv = new AiDriver(reg, services);

function numberOrDash(n: number): string {
  return Number.isFinite(n) ? String(Math.round(n)) : '-';
}

/** One line of everything the expansion branch reads, plus what it can decide. */
function describe(per: Perception, diff: string, minute: number): string {
  const prof = profileFor(diff);
  const bases = countBases(per, reg);
  const site = bestExpansionSite(per, reg, services);
  const home = per.myBuildings[0];
  const nearOwn = site
    ? per.myBuildings.reduce((best, b) => Math.min(best, Math.hypot(b.x - site.x, b.y - site.y)), Infinity)
    : 0;
  const siteTiles = site && home ? Math.hypot(site.x - home.x, site.y - home.y) / TILE : 0;
  const maxBridges = site ? Math.min(6, Math.max(2, Math.ceil((siteTiles - BUILD_ZONE_TILES) / 5))) : 0;
  const bridges = per.myBuildings.filter((b) => b.defId === 'stone_wall').length;
  const refineries = per.myBuildings.filter(
    (b) => reg.buildings.get(b.defId)?.isRefinery && b.buildProgress === undefined,
  ).length;
  const armed = site !== null && prof.targetBases > 1 && minute >= prof.expandAfterSeconds;
  return (
    `t=${minute.toFixed(0).padStart(2)}m ${diff.padEnd(6)} mana=${String(Math.round(per.mana)).padStart(5)}` +
    ` bld=${String(per.myBuildings.length).padStart(2)} ref=${refineries} bases=${bases}/${prof.targetBases}` +
    ` site=${site ? `(${Math.round(site.x)},${Math.round(site.y)})` : '-'}` +
    ` nearOwn=${numberOrDash(nearOwn)}/${TILE * 6} dist=${siteTiles.toFixed(1)}t bridges=${bridges}/${maxBridges}` +
    ` armed=${armed ? 'yes' : 'no'}`
  );
}

const brains = ['p1', 'p2'] as const;
const diffs = [d0, d1];
const notesSeen = new Set<string>();

console.log(`expand-trace seed=${seed} ${d0}(p1) vs ${d1}(p2), cap ${minutes} min`);
const ticksPerReport = 20 * 30;
const cap = minutes * 60 * 20;
const lastLine: Record<string, string> = {};
for (let t = 0; t < cap && !state.ended; t++) {
  stepSimulation(state, services, [], drv.hook);
  if (state.tick % ticksPerReport !== 0) continue;
  const minute = state.tick / 1200;
  for (let i = 0; i < brains.length; i++) {
    const brain = drv.brain(brains[i]!);
    if (!brain) continue;
    const per = brain.perception(state);
    const line = describe(per, diffs[i]!, minute);
    const key = line.slice(line.indexOf('mana='));
    if (key !== lastLine[brains[i]!] || state.tick % (ticksPerReport * 6) === 0) console.log(line);
    lastLine[brains[i]!] = key;
  }
  const all = brains.flatMap((p) => (drv.notes(p) as string[]).filter((n) => /EXPAND|bridg|saving to expand/i.test(n)));
  for (const n of all) {
    if (notesSeen.has(n)) continue;
    notesSeen.add(n);
    console.log(`   note t=${minute.toFixed(0)}m: ${n}`);
  }
}

console.log(`\nended=${state.ended} at ${(state.tick / 1200).toFixed(1)} min`);
for (let i = 0; i < brains.length; i++) {
  const brain = drv.brain(brains[i]!);
  if (!brain) continue;
  const per = brain.perception(state);
  const home = per.myBuildings[0];
  const outside = per.myBuildings.filter((b) => (home ? Math.hypot(b.x - home.x, b.y - home.y) > TILE * 12 : false));
  console.log(
    `${diffs[i]} buildings: ` +
      per.myBuildings.map((b) => `${b.defId}@(${Math.round(b.x)},${Math.round(b.y)})`).join(' ') +
      `\n   OUTSIDE START CLUSTER: ${outside.map((b) => b.defId).join(',') || '(none)'}`,
  );
}
