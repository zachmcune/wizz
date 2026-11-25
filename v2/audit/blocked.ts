import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { KIND_UNIT } from '../src/sim/entity-store';
import { makePathContext, moveTowardGoal } from '../src/sim/pathing';

const reg = loadRegistry();
const { state, services } = initMatch(reg, {
  mapId: 'duel_glade', seed: 1000, oneSuperweaponPerPlayer: false,
  players: [
    { id: 'p1', controller: 'ai', aiDifficulty: 'hard', team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: 1 },
    { id: 'p2', controller: 'ai', aiDifficulty: 'easy', team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: 0 },
  ],
} as never);
const drv = new AiDriver(reg, services);
for (let t = 0; t < 20 * 60 * 20 && !state.ended; t++) stepSimulation(state, services, [], drv.hook);

let target = -1;
for (let s = 0; s < state.entities.count; s++) {
  if (state.entities.dead[s] || state.entities.kind[s] !== KIND_UNIT) continue;
  if (state.entities.ownerId(state.entities.ownerIndex[s]!) !== 'p1') continue;
  const d = reg.units.get(state.entities.extras[s]!.defId)!;
  if (!d.weapon || d.isHarvester) continue;
  target = s; break;
}
const udef = reg.units.get(state.entities.extras[target]!.defId)!;
const ctx = makePathContext(services.nav, services.flow, state.relations, 'p1');
const x = state.entities.posX[target]!, y = state.entities.posY[target]!;
const r = moveTowardGoal(x, y, ctx, { x: 464, y: 464 }, udef.speed, 1 / 20, state.entities.radius[target]!);
console.log('unit at', Math.round(x), Math.round(y), 'speed', udef.speed);
console.log('moveTowardGoal toward base:', JSON.stringify(r.result));
// how many friendly units overlap it?
let overlap = 0;
for (let s = 0; s < state.entities.count; s++) {
  if (state.entities.dead[s] || state.entities.kind[s] !== KIND_UNIT) continue;
  if (state.entities.ownerId(state.entities.ownerIndex[s]!) !== 'p1') continue;
  if (s === target) continue;
  const d = Math.hypot(state.entities.posX[s]! - x, state.entities.posY[s]! - y);
  if (d < state.entities.radius[s]! + state.entities.radius[target]!) overlap++;
}
console.log('friendly units overlapping it:', overlap);
// Where is the nearest enemy, and can we move toward IT?
let bestEnemy = -1, bestD = Infinity;
for (let s = 0; s < state.entities.count; s++) {
  if (state.entities.dead[s]) continue;
  if (state.entities.ownerId(state.entities.ownerIndex[s]!) === 'p1') continue;
  const d = Math.hypot(state.entities.posX[s]! - x, state.entities.posY[s]! - y);
  if (d < bestD) { bestD = d; bestEnemy = s; }
}
console.log('nearest enemy dist', Math.round(bestD), 'kind', state.entities.kind[bestEnemy], 'def', state.entities.extras[bestEnemy]!.defId);
const r2 = moveTowardGoal(x, y, ctx, { x: state.entities.posX[bestEnemy]!, y: state.entities.posY[bestEnemy]! }, udef.speed, 1/20, state.entities.radius[target]!);
console.log('moveTowardGoal toward enemy:', JSON.stringify(r2.result));
console.log('unit state', state.entities.state[target], 'orders', JSON.stringify(state.entities.extras[target]!.orders));
