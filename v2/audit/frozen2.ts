// WHY CAN A SIDE WITH MANA AND BUILDINGS NOT REBUILD?
import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';

const reg = loadRegistry();
const { state, services } = initMatch(reg, {
  mapId: 'duel_glade', seed: 1000, oneSuperweaponPerPlayer: false,
  players: [
    { id: 'p1', controller: 'ai', aiDifficulty: 'normal', team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: 0 },
    { id: 'p2', controller: 'ai', aiDifficulty: 'normal', team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: 1 },
  ],
} as never);
const drv = new AiDriver(reg, services);
for (let t = 0; t < 18 * 60 * 20 && !state.ended; t++) stepSimulation(state, services, [], drv.hook);

const per = drv.brain('p2')!.perception(state);
console.log('p2 buildings:', per.myBuildings.map((b) => b.defId).join(','));
console.log('p2 mana:', Math.round(per.mana), 'workers:', per.myUnits.filter((u) => reg.units.get(u.defId)?.isHarvester).length);
console.log('p2 notes (last 8):', (drv.notes('p2') as string[]).slice(-8));
console.log('p1 notes (last 6):', (drv.notes('p1') as string[]).slice(-6));
