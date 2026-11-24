// IS THE EXPANSION RESERVE ACTUALLY BINDING? — per-pass view of the bank, the reserve and the refinery gap.
//
// The planner now computes an expansion reserve before any spender runs and subtracts it from the worker, producer,
// turret and float-dump gates. This harness checks whether that reserve is non-zero when it matters, and whether the
// remaining "spendable" figure is what keeps the bank under the 750 the refinery needs.
//
//   npx vite-node audit/expand-reserve-probe.ts 1000 24

import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { bestExpansionSite, countBases } from '../src/ai/economy';
import { profileFor } from '../src/ai/difficulty';
import { TILE } from '../src/core/constants';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const seed = Number(args[0] ?? 1000);
const minutes = Number(args[1] ?? 24);

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
const drv = new AiDriver(reg, services);
const cap = minutes * 60 * 20;
const seen = new Set<string>();
for (let t = 0; t < cap && !state.ended; t++) {
  stepSimulation(state, services, [], drv.hook);
  if (state.tick % (20 * 10) !== 0) continue;
  const minute = state.tick / 1200;
  if (state.tick % (20 * 60) === 0) {
    for (const p of ['p1', 'p2'] as const) {
      const brain = drv.brain(p);
      if (!brain) continue;
      const per = brain.perception(state);
      const prof = profileFor(brain.difficultyId);
      // The shipped build has no `expansionGoal` helper (that lived in the reverted change), so the gate is spelled
      // out here exactly as the proposed version computed it. This keeps the probe runnable against the shipped code.
      const armed =
        prof.targetBases > 1 && minute >= prof.expandAfterSeconds && minute <= prof.expandAfterSeconds + 300;
      const goal = armed ? bestExpansionSite(per, reg, services) : null;
      const spire = reg.buildings.get('attunement_spire')!;
      const gap = Math.max(0, spire.cost - per.mana);
      const share = gap > spire.cost * 0.5 ? 0.35 : 0.6;
      const reserve = goal
        ? Math.max(0, Math.min(Math.floor(per.mana * share), Math.max(0, per.mana - 260)))
        : 0;
      const near = goal
        ? Math.round(per.myBuildings.reduce((b, x) => Math.min(b, Math.hypot(x.x - goal.x, x.y - goal.y)), Infinity))
        : -1;
      console.log(
        `t=${minute.toFixed(0).padStart(2)}m ${p} mana=${String(Math.round(per.mana)).padStart(5)}` +
          ` reserve=${String(reserve).padStart(4)} spendable=${String(Math.max(0, Math.round(per.mana) - reserve)).padStart(5)}` +
          ` bases=${countBases(per, reg)}/${prof.targetBases} goal=${goal ? `(${Math.round(goal.x)},${Math.round(goal.y)})` : 'null'}` +
          ` near=${near} walls=${per.myBuildings.filter((w) => w.defId === 'stone_wall').length}`,
      );
    }
  }
  for (const p of ['p1', 'p2'] as const) {
    for (const n of drv.notes(p) as string[]) {
      if (!/EXPAND|saving to expand/i.test(n) || seen.has(p + n)) continue;
      seen.add(p + n);
      if (seen.size < 40) console.log(`   ${p} t=${minute.toFixed(0)}m: ${n}`);
    }
  }
}
console.log(`\nended=${state.ended} at ${(state.tick / 1200).toFixed(1)} min`);
void TILE;
