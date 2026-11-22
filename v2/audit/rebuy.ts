import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { KIND_UNIT } from '../src/sim/entity-store';

const reg = loadRegistry();
const { state, services } = initMatch(reg, {
  mapId: 'duel_glade', seed: 1000, oneSuperweaponPerPlayer: false,
  players: [
    { id: 'p1', controller: 'ai', aiDifficulty: 'normal', team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: 0 },
    { id: 'p2', controller: 'ai', aiDifficulty: 'normal', team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: 1 },
  ],
} as never);
const drv = new AiDriver(reg, services);
let buys = 0;
let prevW = -1;
for (let t = 0; t < 18 * 60 * 20 && !state.ended; t++) {
  stepSimulation(state, services, [], drv.hook);
  let w = 0;
  for (let s = 0; s < state.entities.count; s++) {
    if (state.entities.dead[s] || state.entities.kind[s] !== KIND_UNIT) continue;
    if (state.entities.ownerId(state.entities.ownerIndex[s]!) !== 'p1') continue;
    if (reg.units.get(state.entities.extras[s]!.defId)?.isHarvester) w++;
  }
  if (prevW >= 0 && w > prevW) buys++;
  prevW = w;
}
console.log(`p1 worker-count increases (buys) over 18 min: ${buys}`);
