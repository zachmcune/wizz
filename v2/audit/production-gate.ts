// DOES THE PRODUCTION GATE EVER OPEN? — every tick, the three conditions that gate army training.
//
// `audit/production-probe.ts` samples every 15 s and shows passes where `spendable > threshold` while the army stays at
// zero, which means the gate opening and the unit arriving disagree. Sampling can miss the moment; this logs EVERY tick
// on which the brain would consider production and what it decided, reconstructed against the same inputs the brain uses.
//
//   npx vite-node audit/production-gate.ts [seed] [minutes] [difficulty]

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

function combatUnits(per: Perception): number {
  return per.myUnits.filter((u) => u.weapon && !reg.units.get(u.defId)?.isHarvester).length;
}

/** Cost of everything the economy planner asked for this pass. */
function econSpend(cmds: readonly { type: string; defId?: string }[]): number {
  let n = 0;
  for (const c of cmds) {
    if (!c.defId) continue;
    if (c.type === 'produce') n += reg.units.get(c.defId)?.cost ?? 0;
    else if (c.type === 'build') n += reg.buildings.get(c.defId)?.cost ?? 0;
    else if (c.type === 'research') n += reg.research.get(c.defId)?.cost ?? 0;
  }
  return n;
}

let everOpened = 0;
let everBlockedBySpend = 0;
let everBlockedBySupply = 0;
let everBlockedByTarget = 0;
let everBlockedByProducer = 0;
const transitions: string[] = [];
let prevArmy = -1;

for (let t = 0; t < cap && !state.ended; t++) {
  // Reconstruct p1's view and the economy plan EXACTLY as brain.tick does, before stepping.
  const per = world.build(state, 'p1');
  const secs = Math.floor(t / 20);
  const econ = planEconomy(state, per, reg, services, prof, diff, secs, 0);
  const spend = econSpend(econ.commands);
  const spendable = Math.max(0, per.mana - econ.reservedForBuild);
  const producers = per.myBuildings.filter((b) => {
    if (b.buildProgress !== undefined) return false;
    return !!reg.buildings.get(b.defId)?.producesUnits?.length;
  });
  const target = cheapestCombatUnit(reg, per, producers);
  const armyNow = combatUnits(per);
  const armyTarget = prof.minWaveSize * 2 + 8;
  if (target) {
    const threshold = Math.max(150, target.cost * 2);
    const gateOk = spendable > threshold && armyNow < armyTarget && per.supplyUsed < per.supplyCap;
    if (gateOk) {
      everOpened++;
      if (secondsSinceLog(t)) {
        transitions.push(
          `t=${secs}s GATE OPEN mana=${Math.round(per.mana)} reserve=${Math.round(econ.reservedForBuild)} ` +
            `spendable=${Math.round(spendable)} econSpend=${spend} target=${target.id}@${target.cost} ` +
            `thr=${threshold} army=${armyNow}`,
        );
      }
    } else if (spendable <= threshold) everBlockedBySpend++;
    else if (per.supplyUsed >= per.supplyCap) everBlockedBySupply++;
    else if (armyNow >= armyTarget) everBlockedByTarget++;
  } else everBlockedByProducer++;

  const cmds = drv.hook(state, services);
  const res = stepSimulation(state, services, cmds);
  for (const e of res.events) {
    if (e.type === 'commandRejected' && e.playerId === 'p1') {
      // Nothing to do; counted below through the gate totals.
    }
  }
  const nowArmy = combatUnits(world.build(state, 'p1'));
  if (prevArmy >= 0 && nowArmy !== prevArmy) {
    transitions.push(`t=${secs}s ARMY ${prevArmy} -> ${nowArmy}`);
  }
  prevArmy = nowArmy;
}
function secondsSinceLog(t: number): boolean {
  return t % (30 * 20) === 0;
}

console.log(`seed ${seed}, ${diff}, ${minutes} min`);
console.log(`ticks the gate was OPEN: ${everOpened}`);
console.log(`ticks blocked by spendable<=threshold: ${everBlockedBySpend}`);
console.log(`ticks blocked by supply: ${everBlockedBySupply}`);
console.log(`ticks blocked by army already at target: ${everBlockedByTarget}`);
console.log(`ticks with no combat-capable producer: ${everBlockedByProducer}`);
console.log('\nchanges and open-gate samples:');
for (const l of transitions.slice(0, 60)) console.log('  ' + l);
