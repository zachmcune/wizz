// p1 trickles its army on search sweeps while p2 masses. Count how many decision passes each spends searching
// with a small army, and how large its army ever gets.
import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';

const reg = loadRegistry();
const stats: Record<string, { search: number; attack: number; mass: number; peakArmy: number; sweepSizes: number[] }> = {};
const { state, services } = initMatch(reg, {
  mapId: 'duel_glade', seed: 1000, oneSuperweaponPerPlayer: false,
  players: [
    { id: 'p1', controller: 'ai', aiDifficulty: 'normal', team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: 0 },
    { id: 'p2', controller: 'ai', aiDifficulty: 'normal', team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: 1 },
  ],
} as never);
const st = state.entities;
const armyOf = (id: string) => Array.from({ length: st.count }, (_, s) => s)
  .filter((s) => !st.dead[s] && st.kind[s] === 0 && st.ownerId(st.ownerIndex[s]!) === id)
  .filter((s) => { const u = reg.units.get(st.extras[s]!.defId); return !!u?.weapon && !u.isHarvester; }).length;

const drv = new AiDriver(reg, services, {
  onDecision: (p, _t, notes) => {
    const s = (stats[p] ??= { search: 0, attack: 0, mass: 0, peakArmy: 0, sweepSizes: [] });
    const joined = notes.join(' ');
    if (joined.includes('searching')) { s.search++; s.sweepSizes.push(armyOf(p)); }
    else if (joined.includes('wave of')) s.attack++;
    else if (joined.includes('massing')) s.mass++;
    s.peakArmy = Math.max(s.peakArmy, armyOf(p));
  },
});
for (let t = 0; t < 20 * 60 * 20 && !state.ended; t++) stepSimulation(state, services, [], drv.hook);
for (const id of ['p1', 'p2']) {
  const s = stats[id]!;
  const avgSweep = s.sweepSizes.length ? s.sweepSizes.reduce((a, b) => a + b, 0) / s.sweepSizes.length : 0;
  console.log(`${id}: search passes ${s.search} (avg army during sweep ${avgSweep.toFixed(1)}), mass passes ${s.mass}, wave passes ${s.attack}, peak army ${s.peakArmy}`);
}
console.log(`winner=${state.winnerTeam} at ${(state.tick / 1200).toFixed(1)}m`);
