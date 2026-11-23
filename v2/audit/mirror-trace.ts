// WHY DOES CORNER 1 ALWAYS WIN? Trace both sides' key decisions in one mirror game.
import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';

const reg = loadRegistry();
const trace: Record<string, string[]> = { p1: [], p2: [] };
const { state, services } = initMatch(reg, {
  mapId: 'duel_glade', seed: 1000, oneSuperweaponPerPlayer: false,
  players: [
    { id: 'p1', controller: 'ai', aiDifficulty: 'normal', team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: 0 },
    { id: 'p2', controller: 'ai', aiDifficulty: 'normal', team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: 1 },
  ],
} as never);
const drv = new AiDriver(reg, services);
const st = state.entities;
const snap = (tag: string) => {
  for (const p of state.players) {
    const mine = Array.from({ length: st.count }, (_, s) => s).filter((s) => !st.dead[s] && st.ownerId(st.ownerIndex[s]!) === p.id);
    const units = mine.filter((s) => st.kind[s] === 0);
    const blds = mine.filter((s) => st.kind[s] === 1);
    const army = units.filter((s) => { const u = reg.units.get(st.extras[s]!.defId); return !!u?.weapon && !u.isHarvester; });
    const avg = army.length ? army.reduce((a, s) => a + st.posX[s]!, 0) / army.length : 0;
    const avgy = army.length ? army.reduce((a, s) => a + st.posY[s]!, 0) / army.length : 0;
    trace[p.id]!.push(`${tag} mana=${Math.round(p.mana)} bld=${blds.length} workers=${units.length - army.length} army=${army.length}@(${Math.round(avg)},${Math.round(avgy)})`);
  }
};
for (let t = 0; t < 20 * 60 * 20 && !state.ended; t++) {
  stepSimulation(state, services, [], drv.hook);
  if (t % (180 * 20) === 0) snap(`t=${(t / 1200).toFixed(0)}m`);
}
snap(`END t=${(state.tick / 1200).toFixed(1)}m winner=${state.winnerTeam}`);
for (const id of ['p1', 'p2']) {
  console.log(`\n===== ${id} =====`);
  console.log(trace[id]!.join('\n'));
}
