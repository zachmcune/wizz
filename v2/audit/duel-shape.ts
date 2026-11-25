// ONE SEED, BOTH SIDES, EVERY 30 s — the shape of a real 1v1 with the current AI.
//
// The fairness and ladder measurements are all 1v1; the four-way seed used by the latency-jitter gate is a crowded map
// where every side is squeezed against three neighbours. This prints the 1v1 economy and army so a change can be judged
// on the game the ladder actually measures before any long run is started.
//
//   npx vite-node audit/duel-shape.ts [seed] [minutes] [d0] [d1]

import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { PerceivedWorld, type Perception } from '../src/ai/perception';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const seed = Number(args[0] ?? 1000);
const minutes = Number(args[1] ?? 30);
const d0 = (args[2] ?? 'normal') as 'easy' | 'normal' | 'hard';
const d1 = (args[3] ?? 'normal') as 'easy' | 'normal' | 'hard';

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
const world = new PerceivedWorld(services);
const cap = minutes * 60 * 20;

function stats(per: Perception): string {
  let army = 0;
  let harv = 0;
  for (const u of per.myUnits) {
    if (reg.units.get(u.defId)?.isHarvester) harv++;
    else if (reg.units.get(u.defId)?.weapon) army++;
  }
  const refs = per.myBuildings.filter((b) => reg.buildings.get(b.defId)?.isRefinery).length;
  return `army=${String(army).padStart(2)} harv=${String(harv).padStart(2)} bld=${String(per.myBuildings.length).padStart(2)} ref=${refs} mana=${String(Math.round(per.mana)).padStart(5)}`;
}

for (let t = 0; t < cap && !state.ended; t++) {
  if (t > 0 && t % (30 * 20) === 0) {
    console.log(
      `t=${String(Math.floor(t / 20)).padStart(3)}s  p1[${stats(world.build(state, 'p1'))}]  ` +
        `p2[${stats(world.build(state, 'p2'))}]`,
    );
  }
  const cmds = drv.hook(state, services);
  stepSimulation(state, services, cmds);
}
console.log(
  `\nended=${state.ended} winner=${state.winnerTeam === 0 ? 'p1' : state.winnerTeam === 1 ? 'p2' : '-'} ` +
    `at ${(state.tick / 20 / 60).toFixed(1)} min`,
);
