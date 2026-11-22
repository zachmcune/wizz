import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { countBases, bestExpansionSite } from '../src/ai/economy';

const reg = loadRegistry();
const { state, services } = initMatch(reg, {
  mapId: 'duel_glade', seed: 1000, oneSuperweaponPerPlayer: false,
  players: [
    { id: 'p1', controller: 'ai', aiDifficulty: 'hard', team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: 0 },
    { id: 'p2', controller: 'ai', aiDifficulty: 'easy', team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: 1 },
  ],
} as never);
const drv = new AiDriver(reg, services);
for (let t = 0; t < 14 * 60 * 20 && !state.ended; t++) stepSimulation(state, services, [], drv.hook);
const per = drv.brain('p1')!.perception(state);
console.log('site:', JSON.stringify(bestExpansionSite(per, reg, services)));
console.log('bases:', countBases(per, reg));
for (const b of per.myBuildings) console.log(`  ${b.defId} @ ${Math.round(b.x)},${Math.round(b.y)}`);
