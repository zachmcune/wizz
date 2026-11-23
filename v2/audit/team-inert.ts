// WHY ARE THE CORNER-2/3 PLAYERS INERT IN A 2v2 BUT FINE SOLO?
import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';

const reg = loadRegistry();
const notesById: Record<string, string[]> = {};
for (const n of ['a1', 'a2', 'b1', 'b2']) notesById[n] = [];
const { state, services } = initMatch(reg, {
  mapId: 'duel_glade', seed: 2005, oneSuperweaponPerPlayer: false,
  players: [
    { id: 'a1', controller: 'ai', aiDifficulty: 'normal', team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: 0 },
    { id: 'a2', controller: 'ai', aiDifficulty: 'normal', team: 0, color: '#5dff8f', factionId: 'arcane', startIndex: 2 },
    { id: 'b1', controller: 'ai', aiDifficulty: 'normal', team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: 1 },
    { id: 'b2', controller: 'ai', aiDifficulty: 'normal', team: 1, color: '#ffd166', factionId: 'arcane', startIndex: 3 },
  ],
} as never);
const drv = new AiDriver(reg, services, { onDecision: (p, _t, n) => { const a = notesById[p]!; if (a.length < 200) for (const x of n) a.push(x); } });
for (let t = 0; t < 4 * 60 * 20 && !state.ended; t++) stepSimulation(state, services, [], drv.hook);
for (const p of state.players) {
  const u = Array.from({ length: state.entities.count }, (_, s) => s).filter((s) => !state.entities.dead[s] && state.entities.ownerId(state.entities.ownerIndex[s]!) === p.id);
  const uniq = [...new Set(notesById[p.id]!)];
  console.log(`\n${p.id} (start ${p.startIndex}, team ${p.team}): mana ${Math.round(p.mana)} units ${u.filter((s)=>state.entities.kind[s]===1).length} bld ${u.filter((s)=>state.entities.kind[s]===0).length}`);
  console.log(`  notes: ${uniq.slice(0, 12).join(' | ') || '(NONE)'}`);
}
