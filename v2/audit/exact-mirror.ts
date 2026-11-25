import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';

const reg = loadRegistry();
function play(seed: number, s1: number, s2: number): { w: number | null; min: number } {
  const { state, services } = initMatch(reg, {
    mapId: 'duel_glade', seed, oneSuperweaponPerPlayer: false,
    players: [
      { id: 'p1', controller: 'ai', aiDifficulty: 'normal', team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: s1 },
      { id: 'p2', controller: 'ai', aiDifficulty: 'normal', team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: s2 },
    ],
  } as never);
  const drv = new AiDriver(reg, services);
  for (let t = 0; t < 34 * 60 * 20 && !state.ended; t++) stepSimulation(state, services, [], drv.hook);
  return { w: state.ended ? state.winnerTeam : null, min: state.tick / 1200 };
}
// Exactly what the tournament does: same seed, both corner assignments, team0 always p1.
for (const seed of [1000, 1014, 1035]) {
  const a = play(seed, 0, 1);
  const b = play(seed, 1, 0);
  console.log(`seed ${seed}: p1@0 vs p2@1 -> winner ${a.w} (${a.min.toFixed(1)}m) | p1@1 vs p2@0 -> winner ${b.w} (${b.min.toFixed(1)}m)`);
}
