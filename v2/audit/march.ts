import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { KIND_UNIT } from '../src/sim/entity-store';

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

// Track a single army unit's position for 200 ticks.
let target = -1;
for (let s = 0; s < state.entities.count; s++) {
  if (state.entities.dead[s] || state.entities.kind[s] !== KIND_UNIT) continue;
  if (state.entities.ownerId(state.entities.ownerIndex[s]!) !== 'p1') continue;
  const d = reg.units.get(state.entities.extras[s]!.defId)!;
  if (!d.weapon || d.isHarvester) continue;
  target = s;
  break;
}
console.log('watching', state.entities.id[target], 'state=', state.entities.state[target], 'orders=', JSON.stringify(state.entities.extras[target]!.orders));
// Is there an enemy near this unit (which would give combat a target every tick)?
for (let s = 0; s < state.entities.count; s++) {
  if (state.entities.dead[s]) continue;
  if (state.entities.ownerId(state.entities.ownerIndex[s]!) === 'p1') continue;
  const d = Math.hypot(state.entities.posX[s]! - state.entities.posX[target]!, state.entities.posY[s]! - state.entities.posY[target]!);
  if (d < 400) console.log('  nearby enemy', state.entities.extras[s]!.defId, 'at', Math.round(d));
}
let prev = { x: state.entities.posX[target]!, y: state.entities.posY[target]! };
for (let k = 0; k < 5; k++) {
  for (let i = 0; i < 40; i++) stepSimulation(state, services, [], drv.hook);
  const x = state.entities.posX[target]!, y = state.entities.posY[target]!;
  console.log(`+${(k + 1) * 40} ticks moved=${Math.hypot(x - prev.x, y - prev.y).toFixed(1)} state=${state.entities.state[target]} pos=${Math.round(x)},${Math.round(y)}`);
  prev = { x, y };
}
