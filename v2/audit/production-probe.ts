// WHY IS THERE NO ARMY? — the production decision's own inputs, per decision pass.
//
// `audit/jitter-command-tally.ts` found the same shape on both the shipped build and the expansion build: a peer holds a
// summoning circle and a bank of 300-750 mana, and fields ZERO army units for the whole match. `planMilitary` then reports
// `massing: 0/7` every pass, so nothing moves and the command stream is nearly empty.
//
// The production gate in `brain.ts` is three separate conditions (a producer, `spendable` above a threshold, and army below
// target). This harness prints all three every pass, beside the reserve the economy planner returned, so the binding one
// is visible instead of inferred:
//
//   npx vite-node audit/production-probe.ts            # seed 1021, four normal AIs, 14 min
//   npx vite-node audit/production-probe.ts 1021 14 normal

import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { planEconomy, cheapestCombatUnit } from '../src/ai/economy';
import { PerceivedWorld, type Perception } from '../src/ai/perception';
import { profileFor } from '../src/ai/difficulty';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const seed = Number(args[0] ?? 1021);
const minutes = Number(args[1] ?? 14);
const diff = (args[2] ?? 'normal') as 'easy' | 'normal' | 'hard';

const reg = loadRegistry();
const COLORS = ['#4f9dff', '#ff5d5d', '#5cff8a', '#ffd166'];
const { state, services } = initMatch(reg, {
  mapId: 'duel_glade',
  seed,
  oneSuperweaponPerPlayer: false,
  players: [0, 1, 2, 3].map((i) => ({
    id: `p${i + 1}`,
    controller: 'ai',
    aiDifficulty: diff,
    team: i,
    color: COLORS[i]!,
    factionId: 'arcane',
    startIndex: i,
  })),
} as never);

const drv = new AiDriver(reg, services);
const world = new PerceivedWorld(services);
const prof = profileFor(diff);
const cap = minutes * 60 * 20;
const SAMPLE = 15 * 20;

function producersOf(per: Perception): Perception['myBuildings'] {
  return per.myBuildings.filter((b) => {
    if (b.buildProgress !== undefined) return false;
    return !!reg.buildings.get(b.defId)?.producesUnits?.length;
  });
}

for (let t = 0; t < cap && !state.ended; t++) {
  if (t > 0 && t % SAMPLE === 0) {
    const secs = Math.floor(t / 20);
    const per = world.build(state, 'p1');
    const econ = planEconomy(state, per, reg, services, prof, diff, secs, 0);
    const spendable = Math.max(0, per.mana - econ.reservedForBuild);
    const producers = producersOf(per);
    const target = cheapestCombatUnit(reg, per, producers);
    const threshold = target ? Math.max(150, target.cost * 2) : 0;
    const armyNow = per.myUnits.filter(
      (u) => u.weapon && !reg.units.get(u.defId)?.isHarvester,
    ).length;
    const armyTarget = prof.minWaveSize * 2 + (prof.id === 'easy' ? 0 : prof.id === 'normal' ? 8 : 16);
    const owned = per.myUnits.map((u) => u.defId).reduce<Record<string, number>>((a, k) => {
      a[k] = (a[k] ?? 0) + 1;
      return a;
    }, {});
    console.log(
      `t=${String(secs).padStart(3)}s p1 mana=${Math.round(per.mana)} reserve=${Math.round(econ.reservedForBuild)} ` +
        `spendable=${Math.round(spendable)} | producers=${producers.length} ` +
        `target=${target ? `${target.id}@${target.cost}` : '-'} threshold=${threshold} ` +
        `spendable>threshold=${spendable > threshold} army=${armyNow}/${armyTarget} ` +
        `supply=${per.supplyUsed}/${per.supplyCap} | ${econ.notes[0] ?? ''} | units=${JSON.stringify(owned)}`,
    );
  }
  const cmds = drv.hook(state, services);
  stepSimulation(state, services, cmds);
}
console.log(`\nended=${state.ended} tick=${state.tick}`);
