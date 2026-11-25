// WHERE DO THE RE-TASK attackMoves COME FROM? — every attackMove, attributed to the planner branch that emitted it.
//
// `audit/jitter-command-tally.ts` measured that every attackMove in the committed latency-jitter match is a squad of ONE
// unit. The military planner has three shapes that size: the search sweep, the stuck-unit re-task, and the idle-unit
// re-task. The economy planner has a fourth: `defending expansion with N unit(s)`. They are indistinguishable in a count
// of command types, so this attributes each one by matching the command's destination and squad against those branches.
//
//   npx vite-node audit/attackmove-attribution.ts [seed] [minutes] [player]

import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { countBases, newestBase } from '../src/ai/economy';
import { PerceivedWorld, type Perception } from '../src/ai/perception';
import { TILE } from '../src/core/constants';

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
const cap = minutes * 60 * 20;

const attribution = new Map<string, number>();
const basesSeen = new Map<number, number>();

for (let t = 0; t < cap && !state.ended; t++) {
  const per: Perception = world.build(state, who);
  const bases = countBases(per, reg);
  const newest = newestBase(per, reg);
  basesSeen.set(bases, (basesSeen.get(bases) ?? 0) + 1);
  const cmds = drv.hook(state, services);
  const mine = cmds.filter((c) => c.playerId === who && c.type === 'attackMove');
  for (const c of mine) {
    if (c.type !== 'attackMove') continue;
    const nearestEnemy = per.enemyUnits.length > 0
      ? Math.min(...per.enemyUnits.map((e) => Math.hypot(e.x - c.x, e.y - c.y)))
      : Infinity;
    let label: string;
    if (newest && Math.hypot(c.x - newest.x, c.y - newest.y) < 2) {
      label = `defend-expansion (bases=${bases})`;
    } else if (nearestEnemy < 400) {
      label = 'combat/retask near enemy';
    } else {
      label = `sweep or retask toward ${Math.round(c.x)},${Math.round(c.y)} (bases=${bases})`;
    }
    if (c.entityIds.length === 1) label = 'n=1 ' + label;
    attribution.set(label, (attribution.get(label) ?? 0) + 1);
  }
  void TILE;
  stepSimulation(state, services, cmds);
}

console.log(`${who}: attackMove attribution (seed ${seed}, ${minutes} min)`);
for (const [k, v] of [...attribution.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(v).padStart(4)}  ${k}`);
}
console.log('\ncountBases over the match:');
for (const [k, v] of [...basesSeen.entries()].sort((a, b) => a[0] - b[0])) {
  console.log(`  bases=${k}  ${v} ticks`);
}
