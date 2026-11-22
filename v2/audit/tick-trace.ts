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
// Pick a frozen unit and trace 6 ticks closely.
let target = -1;
for (let s = 0; s < state.entities.count; s++) {
  if (state.entities.dead[s] || state.entities.kind[s] !== KIND_UNIT) continue;
  if (state.entities.ownerId(state.entities.ownerIndex[s]!) !== 'p1') continue;
  const d = reg.units.get(state.entities.extras[s]!.defId)!;
  if (!d.weapon || d.isHarvester) continue;
  target = s; break;
}
const id = state.entities.id[target]!;
console.log('radius', state.entities.radius[target], 'speed', reg.units.get(state.entities.extras[target]!.defId)!.speed);
// How many units are piled within its radius*3?
let pile = 0;
for (let s = 0; s < state.entities.count; s++) {
  if (state.entities.dead[s] || s === target || state.entities.kind[s] !== KIND_UNIT) continue;
  const d = Math.hypot(state.entities.posX[s]! - state.entities.posX[target]!, state.entities.posY[s]! - state.entities.posY[target]!);
  if (d < state.entities.radius[target]! * 3) pile++;
}
console.log('units within 3x radius:', pile);
// total friendlies alive
let n = 0;
for (let s = 0; s < state.entities.count; s++) if (!state.entities.dead[s] && state.entities.kind[s] === KIND_UNIT) n++;
console.log('total units alive:', n);
for (let k = 0; k < 6; k++) {
  const before = { x: state.entities.posX[target]!, y: state.entities.posY[target]!, st: state.entities.state[target]!, vx: state.entities.velX[target]! };
  stepSimulation(state, services, [], drv.hook);
  const slot = state.entities.slotOf(id as never);
  console.log(
    `t${k}: st ${before.st}->${state.entities.state[slot]} orders=${JSON.stringify(state.entities.extras[slot]!.orders)} ` +
      `vel ${before.vx.toFixed(1)}->${state.entities.velX[slot]!.toFixed(1)}`,
  );
}
