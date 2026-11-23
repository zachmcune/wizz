// DOES THE WINNER FOLLOW THE PLAYER ID, THE PLAYER INDEX, OR THE CORNER?
// Same two corners (0 and 1), same seed, three player configurations:
//   A: [x@0, y@1]   x is index 0 AND corner 0
//   B: [y@0, x@1]   swapping BOTH index and corner
//   C: [y@1, x@0]   reversed INDEX order, corners kept (x still corner 0)
// If x always wins regardless of corner -> id/index effect. If the corner-0 player always wins -> map effect.
import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';

const reg = loadRegistry();
function play(seed: number, order: { id: string; start: number }[]) {
  const { state, services } = initMatch(reg, {
    mapId: 'duel_glade', seed, oneSuperweaponPerPlayer: false,
    players: order.map((o, i) => ({ id: o.id, controller: 'ai', aiDifficulty: 'normal', team: i, color: i ? '#ff5d5d' : '#4f9dff', factionId: 'arcane', startIndex: o.start })),
  } as never);
  const drv = new AiDriver(reg, services);
  for (let t = 0; t < 34 * 60 * 20 && !state.ended; t++) stepSimulation(state, services, [], drv.hook);
  return { w: state.ended ? state.winnerTeam : null, min: state.tick / 1200 };
}
for (const seed of [1000, 1014, 1035, 1042]) {
  const A = play(seed, [{ id: 'x', start: 0 }, { id: 'y', start: 1 }]);
  const B = play(seed, [{ id: 'y', start: 0 }, { id: 'x', start: 1 }]);
  const C = play(seed, [{ id: 'y', start: 1 }, { id: 'x', start: 0 }]);
  const n = (r: { w: number | null }, ids: string[]) => (r.w === null ? 'none' : ids[r.w]);
  console.log(`seed ${seed}: A[x@0,y@1]=${n(A, ['x', 'y'])} ${A.min.toFixed(1)}m | B[y@0,x@1]=${n(B, ['y', 'x'])} ${B.min.toFixed(1)}m | C[y@1,x@0]=${n(C, ['y', 'x'])} ${C.min.toFixed(1)}m`);
}
