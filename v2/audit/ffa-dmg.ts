import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { KIND_BUILDING } from '../src/sim/entity-store';

const reg = loadRegistry();
const { state, services } = initMatch(reg, {
  mapId: 'duel_glade', seed: 9092, oneSuperweaponPerPlayer: false,
  players: ['f0', 'f1', 'f2', 'f3'].map((id, i) => ({
    id, controller: 'ai' as const, aiDifficulty: 'normal' as const, team: i,
    color: ['#4f9dff', '#ff5d5d', '#5dff8f', '#ffd166'][i]!, factionId: 'arcane', startIndex: i,
  })),
} as never);
const drv = new AiDriver(reg, services);
let prevHp: Record<number, number> = {};
let dmgToF1 = 0;
for (let t = 0; t < 32 * 60 * 20 && !state.ended; t++) {
  stepSimulation(state, services, [], drv.hook);
  for (let s = 0; s < state.entities.count; s++) {
    if (state.entities.dead[s] || state.entities.kind[s] !== KIND_BUILDING) continue;
    if (state.entities.ownerId(state.entities.ownerIndex[s]!) !== 'f1') continue;
    const id = state.entities.id[s]!, hp = state.entities.hp[s]!;
    const p = prevHp[id];
    if (p !== undefined && hp < p) dmgToF1 += p - hp;
    prevHp[id] = hp;
  }
}
let f1b = 0;
for (let s = 0; s < state.entities.count; s++) {
  if (state.entities.dead[s] || state.entities.kind[s] !== KIND_BUILDING) continue;
  if (state.entities.ownerId(state.entities.ownerIndex[s]!) === 'f1') f1b++;
}
console.log(`damage dealt to f1 buildings over 32 min: ${Math.round(dmgToF1)}; f1 buildings left: ${f1b}`);
