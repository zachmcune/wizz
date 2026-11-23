// Mirror: same seed, both corner assignments, p1 and p2 identical profiles.
// Reports p1 win rate both ways and corner-0 vs corner-1 win rate (slot-corrected).
import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';

const reg = loadRegistry();
function play(seed: number, s1: number, s2: number) {
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
const seeds = [1000, 1014, 1035, 1042, 1051, 1063, 1077, 1088, 1094, 1109, 1116, 1123];
let p1w = 0, c0w = 0, c1w = 0, n = 0, len = 0;
for (const seed of seeds) {
  const a = play(seed, 0, 1);   // p1 in corner0
  const b = play(seed, 1, 0);   // p1 in corner1
  n += 2; len += a.min + b.min;
  if (a.w === 0) { p1w++; c0w++; } if (b.w === 0) { p1w++; c1w++; }
  if (a.w === null || b.w === null) console.log(`  !! seed ${seed} unfinished a=${a.min.toFixed(1)} b=${b.min.toFixed(1)}`);
  console.log(`seed ${seed}: p1@0 -> t${a.w} ${a.min.toFixed(1)}m | p1@1 -> t${b.w} ${b.min.toFixed(1)}m`);
}
const wilson = (k: number, m: number) => {
  const p = k / m, z = 1.96, d = 1 + (z*z)/m;
  const c = (p + (z*z)/(2*m)) / d, h = (z*Math.sqrt(p*(1-p)/m + (z*z)/(4*m*m))) / d;
  return [Math.max(0, c-h), Math.min(1, c+h)];
};
const ci = wilson(p1w, n), ci0 = wilson(c0w, n/2), ci1 = wilson(c1w, n/2);
console.log(`\np1 win rate ${p1w}/${n} = ${(100*p1w/n).toFixed(1)}%  95% CI ${(100*ci[0]).toFixed(1)}-${(100*ci[1]).toFixed(1)}%  contains 50%: ${ci[0] <= 0.5 && 0.5 <= ci[1]}`);
console.log(`corner0 ${c0w}/${n/2} = ${(100*c0w/(n/2)).toFixed(1)}%  CI ${(100*ci0[0]).toFixed(1)}-${(100*ci0[1]).toFixed(1)}%`);
console.log(`corner1 ${c1w}/${n/2} = ${(100*c1w/(n/2)).toFixed(1)}%  CI ${(100*ci1[0]).toFixed(1)}-${(100*ci1[1]).toFixed(1)}%`);
console.log(`median-ish mean length ${(len/n).toFixed(1)}m`);
