// WHY CAN 17 UNITS NOT DESTROY 7 BUILDINGS?
import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { KIND_BUILDING, KIND_UNIT } from '../src/sim/entity-store';
import { isVisibleTo } from '../src/sim/fog';

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

// Hard's buildings: HP, position, visibility to easy.
const hard: number[] = [];
for (let s = 0; s < state.entities.count; s++) {
  if (state.entities.dead[s] || state.entities.kind[s] !== KIND_BUILDING) continue;
  if (state.entities.ownerId(state.entities.ownerIndex[s]!) !== 'p1') continue;
  hard.push(s);
}
console.log('hard buildings:', hard.map((s) => `${state.entities.extras[s]!.defId} hp${Math.round(state.entities.hp[s]!)}@${Math.round(state.entities.posX[s]!)},${Math.round(state.entities.posY[s]!)}`).join(' | '));
console.log('easy can see:', hard.map((s) => isVisibleTo(state, 'p2', s, services.nav)).join(','));

// Easy's army distance to the nearest hard building.
let best = Infinity, armyN = 0;
for (let s = 0; s < state.entities.count; s++) {
  if (state.entities.dead[s] || state.entities.kind[s] !== KIND_UNIT) continue;
  if (state.entities.ownerId(state.entities.ownerIndex[s]!) !== 'p2') continue;
  const d = reg.units.get(state.entities.extras[s]!.defId)!;
  if (!d.weapon || d.isHarvester) continue;
  armyN++;
  for (const b of hard) best = Math.min(best, Math.hypot(state.entities.posX[s]! - state.entities.posX[b]!, state.entities.posY[s]! - state.entities.posY[b]!));
}
console.log(`easy army=${armyN}, closest to a hard building: ${Math.round(best)} units`);
const a = reg.units.get('imp_swarmling')!;
console.log(`imp: dmg ${a.weapon!.damage} vs building ${a.weapon!.vs.building} cd ${a.weapon!.cooldownTicks} range ${a.weapon!.range}`);
console.log(`=> one imp does ${(a.weapon!.damage * a.weapon!.vs.building).toFixed(1)} per ${a.weapon!.cooldownTicks / 20}s = ${(a.weapon!.damage * a.weapon!.vs.building * (20 / a.weapon!.cooldownTicks)).toFixed(1)} dps`);
