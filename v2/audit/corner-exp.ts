// DOES THE EXPANSION SITE CHOICE FAVOUR CORNER 0?
import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { countBases, bestExpansionSite } from '../src/ai/economy';

const reg = loadRegistry();
for (const corner of [0, 1, 2, 3]) {
  const { state, services } = initMatch(reg, {
    mapId: 'duel_glade', seed: 1000, oneSuperweaponPerPlayer: false,
    players: [
      { id: 'p1', controller: 'ai', aiDifficulty: 'normal', team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: corner },
      { id: 'p2', controller: 'ai', aiDifficulty: 'easy', team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: (corner + 1) % 4 },
    ],
  } as never);
  const drv = new AiDriver(reg, services);
  for (let t = 0; t < 10 * 60 * 20 && !state.ended; t++) stepSimulation(state, services, [], drv.hook);
  const per = drv.brain('p1')!.perception(state);
  console.log(`corner ${corner}: bases=${countBases(per, reg)} site=${JSON.stringify(bestExpansionSite(per, reg, services))} blds=${per.myBuildings.length}`);
}
