// DOES THE AI FINISH AN EXPANSION? — outcome-only scan across seeds and matchups.
//
// `audit/expand-trace.ts` explains ONE match decision by decision. This one answers the question the brief actually
// asks — per-match counts of buildings OUTSIDE the starting cluster, by difficulty — across a sample, so a fix can be
// judged on more than the seed that suggested it.
//
// A building is "outside the starting cluster" when it is more than 12 tiles from the side's own sanctum, which is the
// same radius `countBases` clusters with. That definition is deliberately the strict one: a chain link counts, so a run
// that laid walls and never reached the node is visible as walls-with-no-refinery rather than as a success.
//
//   npx vite-node audit/expand-outcomes.ts 1000,1001,1002 hard,normal 30
//      seeds, comma-separated matchups d0>d1, cap minutes

import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { TILE } from '../src/core/constants';
import type { Perception } from '../src/ai/perception';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const seeds = (args[0] ?? '1000').split(',').map(Number);
const matchups = (args[1] ?? 'hard>normal').split(',').map((m) => m.split('>') as [string, string]);
const minutes = Number(args[2] ?? 30);
const cap = minutes * 60 * 20;

const reg = loadRegistry();

interface Row {
  seed: number;
  matchup: string;
  slot: string;
  diff: string;
  minutes: number;
  ended: boolean;
  buildings: number;
  refineries: number;
  outside: number;
  outsideRefineries: number;
  outsideKinds: string;
  walls: number;
  bases: number;
}

const rows: Row[] = [];

/** Buildings more than 12 tiles from this side's own sanctum, i.e. genuinely away from home. */
function outsideCluster(per: Perception): Perception['myBuildings'] {
  const CLUSTER = TILE * 12;
  const home = per.myBuildings.find((b) => reg.buildings.get(b.defId)?.isConstructionYard) ?? per.myBuildings[0];
  if (!home) return [];
  return per.myBuildings.filter((b) => Math.hypot(b.x - home.x, b.y - home.y) > CLUSTER);
}

for (const [d0, d1] of matchups) {
  for (const seed of seeds) {
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
    for (let t = 0; t < cap && !state.ended; t++) stepSimulation(state, services, [], drv.hook);

    for (const [slot, diff] of [
      ['p1', d0],
      ['p2', d1],
    ] as const) {
      const brain = drv.brain(slot);
      if (!brain) continue;
      const per = brain.perception(state);
      const out = outsideCluster(per);
      const refs = per.myBuildings.filter(
        (b) => reg.buildings.get(b.defId)?.isRefinery && b.buildProgress === undefined,
      );
      rows.push({
        seed,
        matchup: `${d0}>${d1}`,
        slot,
        diff,
        minutes: Number((state.tick / 1200).toFixed(1)),
        ended: state.ended,
        buildings: per.myBuildings.length,
        refineries: refs.length,
        outside: out.length,
        outsideRefineries: out.filter(
          (b) => reg.buildings.get(b.defId)?.isRefinery && b.buildProgress === undefined,
        ).length,
        outsideKinds: out.map((b) => b.defId).join('+'),
        walls: per.myBuildings.filter((b) => b.defId === 'stone_wall').length,
        bases: per.myBuildings.filter((b) => {
          const d = reg.buildings.get(b.defId);
          return d?.isRefinery || d?.isConstructionYard;
        }).length,
      });
    }
  }
}

const pad = (s: unknown, n: number): string => String(s).padEnd(n);
console.log(
  pad('seed', 6) + pad('matchup', 14) + pad('slot', 5) + pad('diff', 8) + pad('min', 7) + pad('ended', 7) +
    pad('bld', 5) + pad('ref', 5) + pad('walls', 6) + pad('outside', 9) + 'outsideKinds',
);
for (const r of rows) {
  console.log(
    pad(r.seed, 6) + pad(r.matchup, 14) + pad(r.slot, 5) + pad(r.diff, 8) + pad(r.minutes, 7) + pad(r.ended, 7) +
      pad(r.buildings, 5) + pad(r.refineries, 5) + pad(r.walls, 6) + pad(`${r.outside}(${r.outsideRefineries}ref)`, 9) +
      (r.outsideKinds || '-'),
  );
}

console.log('\nsummary by difficulty');
for (const diff of ['easy', 'normal', 'hard']) {
  const mine = rows.filter((r) => r.diff === diff);
  if (mine.length === 0) continue;
  const withOut = mine.filter((r) => r.outside > 0).length;
  const withOutRef = mine.filter((r) => r.outsideRefineries > 0).length;
  const sum = mine.reduce(
    (a, r) => ({ outside: a.outside + r.outside, refs: a.refs + r.outsideRefineries, walls: a.walls + r.walls }),
    { outside: 0, refs: 0, walls: 0 },
  );
  console.log(
    `${diff.padEnd(7)} n=${mine.length}  expansions(w/ outside refinery)=${withOutRef}  any-outside-building=${withOut}` +
      `  outside-buildings=${sum.outside}  outside-refineries=${sum.refs}  walls=${sum.walls}`,
  );
}
