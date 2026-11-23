// WHICH CORNER PAIRINGS FAVOUR WHICH SIDE?
import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';

const reg = loadRegistry();
function play(seed: number, s1: number, s2: number): number | null {
  const { state, services } = initMatch(reg, {
    mapId: 'duel_glade', seed, oneSuperweaponPerPlayer: false,
    players: [
      { id: 'p1', controller: 'ai', aiDifficulty: 'normal', team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: s1 },
      { id: 'p2', controller: 'ai', aiDifficulty: 'normal', team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: s2 },
    ],
  } as never);
  const drv = new AiDriver(reg, services);
  for (let t = 0; t < 34 * 60 * 20 && !state.ended; t++) stepSimulation(state, services, [], drv.hook);
  return state.ended ? state.winnerTeam : null;
}
for (const [a, b] of [[0, 1], [1, 0], [0, 2], [2, 0], [0, 3], [3, 0]] as const) {
  let w = 0, n = 0;
  for (const seed of [1000, 1014]) {
    const r = play(seed, a, b);
    if (r === 0) w++;
    n++;
  }
  console.log(`p1@corner${a} vs p2@corner${b}: p1 won ${w}/${n}`);
}
