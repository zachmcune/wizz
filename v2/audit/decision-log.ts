// WHAT DOES THE BRAIN ACTUALLY EMIT? — every decision pass for one player, with the bank at each step.
//
// `audit/production-gate.ts` shows the production gate OPEN on 4127 of 16800 ticks, yet only four combat units ever spawn
// in the match. So the gate opening and a unit arriving are not the same event: something between them discards the
// command. The brain emits the economy's commands and the military's commands in one list, and the sim applies them in
// list order against a single bank. This logs that list per decision pass.
//
//   npx vite-node audit/decision-log.ts [seed] [minutes] [player]

import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { PerceivedWorld } from '../src/ai/perception';
import { profileFor } from '../src/ai/difficulty';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const seed = Number(args[0] ?? 1021);
const minutes = Number(args[1] ?? 14);
const who = args[2] ?? 'p1';

const reg = loadRegistry();
const COLORS = ['#4f9dff', '#ff5d5d', '#5cff8a', '#ffd166'];
const { state, services } = initMatch(reg, {
  mapId: 'duel_glade',
  seed,
  oneSuperweaponPerPlayer: false,
  players: [0, 1, 2, 3].map((i) => ({
    id: `p${i + 1}`,
    controller: 'ai',
    aiDifficulty: 'normal',
    team: i,
    color: COLORS[i]!,
    factionId: 'arcane',
    startIndex: i,
  })),
} as never);

const drv = new AiDriver(reg, services);
const world = new PerceivedWorld(services);
void profileFor('normal');
const cap = minutes * 60 * 20;

const log: string[] = [];
let produced = 0;
let rejected = 0;
const rejectedReasons = new Map<string, number>();

for (let t = 0; t < cap && !state.ended; t++) {
  const per = world.build(state, who);
  const manaBefore = per.mana;
  const cmds = drv.hook(state, services);
  const mine = cmds.filter((c) => c.playerId === who);
  const kinds = mine.map((c) => (c.type === 'produce' || c.type === 'build' ? `${c.type}:${c.defId}` : c.type));
  const spawnsBefore = countArmy();
  const res = stepSimulation(state, services, cmds);
  for (const e of res.events) {
    if (e.type === 'commandRejected' && e.playerId === who) {
      rejected++;
      rejectedReasons.set(e.reason, (rejectedReasons.get(e.reason) ?? 0) + 1);
    }
  }
  const spawnsAfter = countArmy();
  const combatCmd = kinds.filter((k) => k.startsWith('produce:') && k !== 'produce:wisp');
  if (combatCmd.length > 0) {
    produced++;
    log.push(
      `t=${(t / 20).toFixed(0)}s mana=${Math.round(manaBefore)} army=${spawnsBefore}->${spawnsAfter} ` +
        `cmds=[${kinds.join(' ')}]`,
    );
  }
}

function countArmy(): number {
  const per = world.build(state, who);
  return per.myUnits.filter((u) => u.weapon && !reg.units.get(u.defId)?.isHarvester).length;
}

console.log(`${who}: decision passes that emitted a COMBAT produce: ${produced}`);
console.log(`rejections for ${who}: ${rejected} ${JSON.stringify([...rejectedReasons])}`);
console.log('\nfirst 30 such passes:');
for (const l of log.slice(0, 30)) console.log('  ' + l);
console.log('\nlast 10:');
for (const l of log.slice(-10)) console.log('  ' + l);
