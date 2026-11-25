// WHERE DOES THE AI'S MONEY GO? — income and spending by category, per minute.
//
// The expansion needs 750 for one refinery, and `audit/expand-trace.ts` shows the bank oscillating under 600 for
// twenty minutes. Before changing the priority order, this measures what the money is actually being spent on, so
// the change targets the real sink rather than a guess.
//
// Income is measured two ways: the sanctorum trickle (2/s, an approved rule) and the observed delta of a side's
// bank + everything it bought. The second is the honest number: mana only enters through mining and trickle.
//
//   npx vite-node audit/economy-trace.ts 1000 hard normal 24

import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { KIND_UNIT } from '../src/sim/entity-store';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const seed = Number(args[0] ?? 1000);
const minutes = Number(args[3] ?? 24);

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

/**
 * Total mana a side has ever earned, reconstructed from its own state: the bank plus the full cost of everything it holds
 * and everything it has lost. Death tracking is not available here, so this is a LOWER bound — a side that lost units
 * earned at least this much.
 */
function earned(per: { mana: number; myBuildings: { defId: string }[]; myUnits: { defId: string }[] }): number {
  let spent = 0;
  for (const b of per.myBuildings) spent += reg.buildings.get(b.defId)?.cost ?? 0;
  for (const u of per.myUnits) spent += reg.units.get(u.defId)?.cost ?? 0;
  return per.mana + spent;
}

const prev: Record<string, { earned: number; bld: number; units: number; workers: number }> = {};
console.log('t   side   mana  earned  dInc/m  workers  bld  army  power');
const cap = minutes * 60 * 20;
for (let t = 0; t < cap && !state.ended; t++) {
  stepSimulation(state, services, [], drv.hook);
  if (state.tick % (20 * 60) !== 0) continue;
  const minute = state.tick / 1200;
  for (const p of ['p1', 'p2'] as const) {
    const brain = drv.brain(p);
    if (!brain) continue;
    const per = brain.perception(state);
    const e = earned(per);
    const before = prev[p];
    const dInc = before ? ((e - before.earned) / 1) : 0;
    const workers = per.myUnits.filter((u) => reg.units.get(u.defId)?.isHarvester).length;
    const army = per.myUnits.filter((u) => u.weapon && !reg.units.get(u.defId)?.isHarvester).length;
    console.log(
      `${minute.toFixed(0).padStart(2)}  ${p}  ${String(Math.round(per.mana)).padStart(5)}  ${String(Math.round(e)).padStart(6)}` +
        `  ${dInc.toFixed(0).padStart(6)}  ${String(workers).padStart(7)}  ${String(per.myBuildings.length).padStart(3)}` +
        `  ${String(army).padStart(4)}  ${String(per.power).padStart(3)}/${per.powerUsed}`,
    );
    prev[p] = { earned: e, bld: per.myBuildings.length, units: per.myUnits.length, workers };
  }
}
console.log(`\nended=${state.ended} at ${(state.tick / 1200).toFixed(1)} min`);
for (const p of ['p1', 'p2'] as const) {
  const brain = drv.brain(p);
  if (!brain) continue;
  const per = brain.perception(state);
  const miners = per.myUnits.filter((u) => reg.units.get(u.defId)?.isHarvester).length;
  const refinery = per.myBuildings.filter((b) => reg.buildings.get(b.defId)?.isRefinery).length;
  console.log(`${p}: refineries=${refinery} workers=${miners} supply=${per.supplyUsed}/${per.supplyCap} mana=${Math.round(per.mana)}`);
  void KIND_UNIT;
}
