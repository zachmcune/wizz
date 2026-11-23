// IS THE CORNER ADVANTAGE MAP GEOMETRY OR SIM ORDERING?
//
// Team 0 won 12/12 from corner 0 and 5/12 from corner 1. Terrain around all four starts is identical (57 blocked, 24 ramps, 760
// walkable in a 29x29 window), so this isolates the cause by swapping WHICH ID/ORDER each corner gets.
import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';

const reg = loadRegistry();
function play(seed: number, s1: number, s2: number, idOrder: 'normal' | 'reversed'): number | null {
  const players = idOrder === 'normal'
    ? [{ id: 'p1', team: 0, startIndex: s1, color: '#4f9dff' }, { id: 'p2', team: 1, startIndex: s2, color: '#ff5d5d' }]
    : [{ id: 'zz', team: 0, startIndex: s1, color: '#4f9dff' }, { id: 'aa', team: 1, startIndex: s2, color: '#ff5d5d' }];
  const { state, services } = initMatch(reg, {
    mapId: 'duel_glade', seed, oneSuperweaponPerPlayer: false,
    players: players.map((p) => ({ ...p, controller: 'ai' as const, aiDifficulty: 'normal' as const, factionId: 'arcane' })),
  } as never);
  const drv = new AiDriver(reg, services);
  for (let t = 0; t < 34 * 60 * 20 && !state.ended; t++) stepSimulation(state, services, [], drv.hook);
  return state.ended ? state.winnerTeam : null;
}

for (const order of ['normal', 'reversed'] as const) {
  let c0 = 0, c1 = 0;
  for (const seed of [1000, 1014, 1035, 1042]) {
    // team 0 in corner 0
    const a = play(seed, 0, 1, order);
    if (a === 0) c0++;
    // team 0 in corner 1
    const b = play(seed, 1, 0, order);
    if (b === 0) c1++;
  }
  console.log(`ids=${order}: team0 in corner0 won ${c0}/4, in corner1 won ${c1}/4`);
}
