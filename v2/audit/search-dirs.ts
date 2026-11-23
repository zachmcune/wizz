// What search objective does each side pick, and where does it send the detachment?
import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';

const reg = loadRegistry();
const first: Record<string, string[]> = { p1: [], p2: [] };
const { state, services } = initMatch(reg, {
  mapId: 'duel_glade', seed: 1000, oneSuperweaponPerPlayer: false,
  players: [
    { id: 'p1', controller: 'ai', aiDifficulty: 'normal', team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: 0 },
    { id: 'p2', controller: 'ai', aiDifficulty: 'normal', team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: 1 },
  ],
} as never);
const drv = new AiDriver(reg, services, {
  onDecision: (p, t, notes) => {
    for (const n of notes) if (n.startsWith('searching')) { if (first[p]!.length < 14) first[p]!.push(`t=${(t/1200).toFixed(1)}m ${n.replace(/^searching: /, '')}`); }
  },
});
for (let t = 0; t < 18 * 60 * 20 && !state.ended; t++) stepSimulation(state, services, [], drv.hook);
for (const id of ['p1', 'p2']) { console.log(`\n== ${id} search destinations`); console.log(first[id]!.join('\n')); }
