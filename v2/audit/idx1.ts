// index 1 beats index 0 from the SAME corner. Trace both.
import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
const reg = loadRegistry();
const { state, services } = initMatch(reg, {
  mapId: 'duel_glade', seed: 1000, oneSuperweaponPerPlayer: false,
  players: [
    { id: 'p1', controller: 'ai', aiDifficulty: 'normal', team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: 0 },
    { id: 'p2', controller: 'ai', aiDifficulty: 'normal', team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: 0 },
  ],
} as never);
const st = state.entities;
const drv = new AiDriver(reg, services, { onDecision: () => {} });
const snap = (t: number) => {
  const out: string[] = [];
  for (const p of state.players) {
    const mine = Array.from({length: st.count},(_,s)=>s).filter((s)=>!st.dead[s]&&st.ownerId(st.ownerIndex[s]!)===p.id);
    const army = mine.filter((s)=>st.kind[s]===0&&(()=>{const u=reg.units.get(st.extras[s]!.defId);return !!u?.weapon&&!u.isHarvester;})()).length;
    const bld = mine.filter((s)=>st.kind[s]===1).length;
    const work = mine.filter((s)=>st.kind[s]===0).length - army;
    out.push(`${p.id}: mana ${Math.round(p.mana)} bld ${bld} work ${work} army ${army}`);
  }
  console.log(`t=${(t/1200).toFixed(0)}m ${out.join(' | ')}`);
};
for (let t = 0; t < 24 * 60 * 20 && !state.ended; t++) {
  stepSimulation(state, services, [], drv.hook);
  if (t % (180*20) === 0) snap(t);
}
console.log(`END t=${(state.tick/1200).toFixed(1)}m winner=${state.winnerTeam}`);
