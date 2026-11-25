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
const x = state.entities.posX[target]!, y = state.entities.posY[target]!;
const udef = reg.units.get(state.entities.extras[target]!.defId)!;
const ctx = makePathContext(services.nav, services.flow, state.relations, 'p1');
// Simulate what chase would do toward the nearest enemy.
let be = -1, bd = Infinity;
for (let s = 0; s < state.entities.count; s++) {
  if (state.entities.dead[s]) continue;
  if (state.entities.ownerId(state.entities.ownerIndex[s]!) === 'p1') continue;
  const d = Math.hypot(state.entities.posX[s]! - x, state.entities.posY[s]! - y);
  if (d < bd) { bd = d; be = s; }
}
console.log('unit', state.entities.id[target], 'state', state.entities.state[target], 'orders', JSON.stringify(state.entities.extras[target]!.orders));
console.log('nearest enemy at', Math.round(bd));
const r = moveTowardGoal(x, y, ctx, { x: state.entities.posX[be]!, y: state.entities.posY[be]! }, udef.speed, 1/20, state.entities.radius[target]!);
console.log('chase would move:', JSON.stringify(r.result));
// Is the unit INSIDE a building footprint / blocked tile?
const tx = Math.floor(x / 32), ty = Math.floor(y / 32);
console.log('tile', tx, ty, 'canPlace(1):', services.nav.canPlace(tx, ty, 1));
import { acquireTarget, sightOfSlot, inWeaponBand } from '../src/sim/systems/combat';
import { newStepContext } from '../src/sim/context';
const c2 = newStepContext(services);
const sight = sightOfSlot(reg, state.entities, target);
const tgt = acquireTarget(state, c2, target, sight, udef.weapon);
console.log('sight', sight, 'acquired', tgt, tgt >= 0 ? 'dist ' + Math.round(Math.hypot(state.entities.posX[tgt]!-x, state.entities.posY[tgt]!-y)) + ' inBand ' + inWeaponBand(state, c2, target, tgt, udef.weapon!, true) : 'none');
