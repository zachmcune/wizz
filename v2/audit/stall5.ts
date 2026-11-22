import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { KIND_BUILDING, KIND_UNIT } from '../src/sim/entity-store';

const reg = loadRegistry();
const { state, services } = initMatch(reg, {
  mapId: 'duel_glade', seed: 1000, oneSuperweaponPerPlayer: false,
  players: [
    { id: 'p1', controller: 'ai', aiDifficulty: 'hard', team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: 1 },
    { id: 'p2', controller: 'ai', aiDifficulty: 'easy', team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: 0 },
  ],
} as never);
const drv = new AiDriver(reg, services);
for (let t = 0; t < 45 * 60 * 20 && !state.ended; t++) {
  stepSimulation(state, services, [], drv.hook);
  if (state.tick % (1200 * 5) === 0) {
    let a = 0, far = 0;
    for (let s = 0; s < state.entities.count; s++) {
      if (state.entities.dead[s] || state.entities.kind[s] !== KIND_UNIT) continue;
      if (state.entities.ownerId(state.entities.ownerIndex[s]!) !== 'p2') continue;
      const d = reg.units.get(state.entities.extras[s]!.defId)!;
      if (!d.weapon || d.isHarvester) continue;
      a++;
      if (state.entities.posX[s]! > 2500) far++;
    }
    let hb = 0;
    for (let s = 0; s < state.entities.count; s++) {
      if (state.entities.dead[s] || state.entities.kind[s] !== KIND_BUILDING) continue;
      if (state.entities.ownerId(state.entities.ownerIndex[s]!) !== 'p1') continue;
      hb++;
    }
    console.log(`${state.tick / 1200}m: easy army=${a} advanced(x>2500)=${far} hardBuildings=${hb} ended=${state.ended}`);
  }
}
console.log('final:', state.ended, 'winner', state.winnerTeam, 'at', (state.tick / 1200).toFixed(1), 'min');
