// WHY IS A CORNER-2 OR CORNER-3 AI INERT? Run one AI at each start and print its own decision notes.
import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';

const reg = loadRegistry();
for (const start of [0, 1, 2, 3]) {
  const notes: string[] = [];
  const { state, services } = initMatch(reg, {
    mapId: 'duel_glade', seed: 2005, oneSuperweaponPerPlayer: false,
    players: [
      { id: 'solo', controller: 'ai', aiDifficulty: 'normal', team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: start },
    ],
  } as never);
  const drv = new AiDriver(reg, services, { onDecision: (_p, _t, n) => { for (const x of n) if (notes.length < 400) notes.push(x); } });
  for (let t = 0; t < 6 * 60 * 20 && !state.ended; t++) stepSimulation(state, services, [], drv.hook);
  const mine = Array.from({ length: state.entities.count }, (_, s) => s).filter((s) => !state.entities.dead[s]);
  const units = mine.filter((s) => state.entities.kind[s] === 1).length;
  const blds = mine.filter((s) => state.entities.kind[s] === 0).length;
  const p = state.players[0]!;
  const uniq = [...new Set(notes)];
  console.log(`\n=== start ${start}: after 6 min -> mana ${Math.round(p.mana)} units ${units} buildings ${blds}`);
  console.log(`  distinct notes (${uniq.length}): ${uniq.slice(0, 10).join(' | ') || '(none)'}`);
}
