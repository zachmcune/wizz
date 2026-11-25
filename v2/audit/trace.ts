// DOES A UNIT IN state=2 WITH AN attackMove ORDER EVER MOVE?
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
for (let t = 0; t < 30 * 60 * 20 && !state.ended; t++) stepSimulation(state, services, [], drv.hook);

// Pick one of easy's stuck units and watch it for 200 ticks.
let target = -1;
for (let s = 0; s < state.entities.count; s++) {
  if (state.entities.dead[s] || state.entities.kind[s] !== KIND_UNIT) continue;
  if (state.entities.ownerId(state.entities.ownerIndex[s]!) !== 'p2') continue;
  const d = reg.units.get(state.entities.extras[s]!.defId)!;
  if (!d.weapon || d.isHarvester) continue;
  if (state.entities.state[s] === 2) { target = s; break; }
}
if (target < 0) { console.log('no state=2 unit found'); process.exit(0); }
console.log(`watching unit ${state.entities.id[target]} def=${state.entities.extras[target]!.defId} stance=${state.entities.stance[target]}`);
let prev = { x: state.entities.posX[target]!, y: state.entities.posY[target]! };
for (let k = 0; k < 8; k++) {
  for (let i = 0; i < 25; i++) stepSimulation(state, services, [], drv.hook);
  const x = state.entities.posX[target]!, y = state.entities.posY[target]!;
  const moved = Math.hypot(x - prev.x, y - prev.y);
  console.log(
    `+${(k + 1) * 25} ticks: pos=${Math.round(x)},${Math.round(y)} moved=${moved.toFixed(1)} state=${state.entities.state[target]} ` +
      `orders=${JSON.stringify(state.entities.extras[target]!.orders)}`,
  );
  prev = { x, y };
}
