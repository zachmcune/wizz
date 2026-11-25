// WHAT UNIT DOES THE COUNTER PICKER CHOOSE, AND CAN THE BANK EVER REACH ITS THRESHOLD?
//
// `audit/decision-log.ts` shows the brain emitting a combat `produce` on only FIVE decision passes in a fourteen-minute
// match, while `spendable` clears 260 for long stretches. The production gate is
//
//   aboveReserve = spendable > max(150, target.cost * 2)
//
// so the unit the picker returns decides the threshold. Normal and Hard both run `counters: true`, which selects through
// `bestCounterUnit` rather than `cheapestCombatUnit` — and that function is documented to prefer effective HP, which
// means the most expensive unit in the roster. This prints the pick, its cost and the resulting threshold every 30 s.
//
//   npx vite-node audit/counter-pick-probe.ts [seed] [minutes] [difficulty]

import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { planEconomy, cheapestCombatUnit } from '../src/ai/economy';
import { bestCounterUnit } from '../src/ai/military';
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

const picks = new Map<string, number>();

for (let t = 0; t < cap && !state.ended; t++) {
  if (t > 0 && t % (30 * 20) === 0) {
    const per: Perception = world.build(state, 'p1');
    const econ = planEconomy(state, per, reg, services, prof, diff, Math.floor(t / 20), 0);
    const spendable = Math.max(0, per.mana - econ.reservedForBuild);
    const producers = per.myBuildings.filter(
      (b) => b.buildProgress === undefined && !!reg.buildings.get(b.defId)?.producesUnits?.length,
    );
    const counter = bestCounterUnit(reg, per, producers, per.enemyUnits);
    const cheapest = cheapestCombatUnit(reg, per, producers);
    const thrCost = counter?.cost ?? 0;
    const threshold = Math.max(150, thrCost * 2);
    if (counter) picks.set(`${counter.id}@${counter.cost}`, (picks.get(`${counter.id}@${counter.cost}`) ?? 0) + 1);
    console.log(
      `t=${String(Math.floor(t / 20)).padStart(3)}s mana=${String(Math.round(per.mana)).padStart(4)} ` +
        `spendable=${String(Math.round(spendable)).padStart(4)} | counter=${counter ? `${counter.id}@${counter.cost}` : '-'} ` +
        `cheapest=${cheapest ? `${cheapest.id}@${cheapest.cost}` : '-'} threshold=${threshold} ` +
        `open=${spendable > threshold} | enemyUnits=${per.enemyUnits.length}`,
    );
  }
  const cmds = drv.hook(state, services);
  stepSimulation(state, services, cmds);
}
console.log('\ncounter picks over the match:');
for (const [k, v] of [...picks.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);
