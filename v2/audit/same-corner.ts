// Two players at the SAME corner: a pure slot-order contest with zero map asymmetry.
import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
const reg = loadRegistry();
for (const corner of [0, 1]) {
  let t0 = 0, t1 = 0, n = 0;
  for (const seed of [1000, 1014, 1035, 1042]) {
    const { state, services } = initMatch(reg, {
      mapId: 'duel_glade', seed, oneSuperweaponPerPlayer: false,
      players: [
        { id: 'p1', controller: 'ai', aiDifficulty: 'normal', team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: corner },
        { id: 'p2', controller: 'ai', aiDifficulty: 'normal', team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: corner },
      ],
    } as never);
    const drv = new AiDriver(reg, services);
    for (let t = 0; t < 30 * 60 * 20 && !state.ended; t++) stepSimulation(state, services, [], drv.hook);
    if (state.winnerTeam === 0) t0++; else if (state.winnerTeam === 1) t1++;
    n++;
  }
  console.log(`both at corner ${corner}: p1 ${t0}, p2 ${t1} (of ${n})`);
}
