// THE ARMY STOPS 450 UNITS SHORT AND NEVER ACQUIRES A TARGET. WHY?
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
for (let t = 0; t < 30 * 60 * 20 && !state.ended; t++) stepSimulation(state, services, [], drv.hook);
const b = drv.brain('p2')!;
const per = b.perception(state);
console.log('easy: attacking=', b.state.attacking, 'passes=', b.state.passesWithoutProgress);
console.log('easy notes:', (drv.notes('p2') as string[]).slice(-5));
console.log('easy enemyBuildings known:', per.enemyBuildings.length);
console.log('easy enemyUnits seen:', per.enemyUnits.length);
// Where is the army ordered to?
let shown = 0;
for (let s = 0; s < state.entities.count && shown < 4; s++) {
  if (state.entities.dead[s] || state.entities.kind[s] !== KIND_UNIT) continue;
  if (state.entities.ownerId(state.entities.ownerIndex[s]!) !== 'p2') continue;
  const d = reg.units.get(state.entities.extras[s]!.defId)!;
  if (!d.weapon || d.isHarvester) continue;
  shown++;
  console.log(`  unit ${state.entities.id[s]} state=${state.entities.state[s]} orders=${JSON.stringify(state.entities.extras[s]!.orders)} pos=${Math.round(state.entities.posX[s]!)},${Math.round(state.entities.posY[s]!)}`);
}
void KIND_BUILDING;
