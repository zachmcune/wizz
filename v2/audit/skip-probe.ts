import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { KIND_UNIT, STATE_GARRISONED } from '../src/sim/entity-store';
import { garrisonedInId } from '../src/sim/capabilities';
import { hasMorph } from '../src/sim/systems/morph';
import { isChanneling } from '../src/sim/capabilities';

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
const store = state.entities;
const ex = store.extras[target]!;
console.log('unit', store.id[target], 'def', ex.defId);
console.log('state==GARRISONED:', store.state[target] === STATE_GARRISONED);
console.log('garrisonedInId:', garrisonedInId(ex));
console.log('hasMorph:', hasMorph(ex));
console.log('isChanneling:', isChanneling(ex));
console.log('morph cap:', JSON.stringify(ex.caps.morph));
console.log('orders:', JSON.stringify(ex.orders));
// Call movementSystem directly and see if this unit moves.
import { movementSystem } from '../src/sim/systems/movement';
import { newStepContext } from '../src/sim/context';
const before = { x: store.posX[target]!, y: store.posY[target]! };
const ctx2 = newStepContext(services);
movementSystem(state, ctx2);
const mid = { x: store.posX[target]!, y: store.posY[target]! };
import { combatSystem } from '../src/sim/systems/combat';
combatSystem(state, ctx2);
console.log('after combatSystem:', Math.round(store.posX[target]!), Math.round(store.posY[target]!), 'delta', Math.hypot(store.posX[target]!-mid.x, store.posY[target]!-mid.y).toFixed(2));
console.log('after direct movementSystem:', Math.round(store.posX[target]!), Math.round(store.posY[target]!), 'moved', Math.hypot(store.posX[target]!-before.x, store.posY[target]!-before.y).toFixed(2));
console.log('vel now', store.velX[target]);
