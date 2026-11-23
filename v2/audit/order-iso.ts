// SEPARATE creation order from entity id: give the same corner the SAME id in both runs, but change which index it occupies.
import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';

const reg = loadRegistry();
function play(seed: number, cornerOfP1: number, p1First: boolean): number | null {
  const p1 = { id: 'p1', controller: 'ai' as const, aiDifficulty: 'normal' as const, team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: cornerOfP1 };
  const p2 = { id: 'p2', controller: 'ai' as const, aiDifficulty: 'normal' as const, team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: cornerOfP1 === 0 ? 1 : 0 };
  const players = p1First ? [p1, p2] : [p2, p1];
  const { state, services } = initMatch(reg, { mapId: 'duel_glade', seed, oneSuperweaponPerPlayer: false, players } as never);
  const drv = new AiDriver(reg, services);
  for (let t = 0; t < 34 * 60 * 20 && !state.ended; t++) stepSimulation(state, services, [], drv.hook);
  return state.ended ? state.winnerTeam : null;
}
for (const p1First of [true, false]) {
  let p1w = 0, n = 0;
  for (const seed of [1000, 1014, 1035, 1042]) {
    // p1 always in corner 0; only the creation order changes.
    const r = play(seed, 0, p1First);
    if (r === 0) p1w++;
    n++;
  }
  console.log(`p1 in corner0, created ${p1First ? 'FIRST' : 'SECOND'}: p1 won ${p1w}/${n}`);
}
