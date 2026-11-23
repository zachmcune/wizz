// Does the starting sanctum survive at each corner?
import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';

const reg = loadRegistry();
for (const start of [0, 1, 2, 3]) {
  const { state, services } = initMatch(reg, {
    mapId: 'duel_glade', seed: 2005, oneSuperweaponPerPlayer: false,
    players: [{ id: 'solo', controller: 'ai', aiDifficulty: 'normal', team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: start }],
  } as never);
  const drv = new AiDriver(reg, services);
  const st = state.entities;
  const count = () => Array.from({ length: st.count }, (_, s) => s).filter((s) => !st.dead[s] && st.kind[s] === 0).length;
  const before = count();
  for (let t = 0; t < 20 * 60 * 20; t++) {
    stepSimulation(state, services, [], drv.hook);
    if (state.ended) break;
  }
  const sanctum = Array.from({ length: st.count }, (_, s) => s).filter((s) => !st.dead[s] && st.kind[s] === 0 && st.extras[s]!.defId === 'sanctum').length;
  console.log(`start ${start}: buildings at t=1s ${before} -> after ${(state.tick / 1200).toFixed(1)}m ${count()} (sanctums ${sanctum}) ended=${state.ended} winner=${state.winnerTeam}`);
}
