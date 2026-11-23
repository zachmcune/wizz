// WHY DOES A 2v2 STOP SPENDING? Track each player's mana, income and unit counts every 2 sim-minutes.
import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';

const seed = Number(process.argv[2] ?? 2005);
const reg = loadRegistry();
const { state, services } = initMatch(reg, {
  mapId: 'duel_glade', seed, oneSuperweaponPerPlayer: false,
  players: [
    { id: 'a1', controller: 'ai', aiDifficulty: 'normal', team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: 0 },
    { id: 'a2', controller: 'ai', aiDifficulty: 'normal', team: 0, color: '#5dff8f', factionId: 'arcane', startIndex: 2 },
    { id: 'b1', controller: 'ai', aiDifficulty: 'normal', team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: 1 },
    { id: 'b2', controller: 'ai', aiDifficulty: 'normal', team: 1, color: '#ffd166', factionId: 'arcane', startIndex: 3 },
  ],
} as never);
const drv = new AiDriver(reg, services);
let lastMana: Record<string, number> = {};
for (let t = 0; t < 32 * 60 * 20 && !state.ended; t++) {
  stepSimulation(state, services, [], drv.hook);
  if (t % (120 * 20) === 0) {
    const cells = state.players.map((p) => {
      const units = state.entities.count ? Array.from({ length: state.entities.count }, (_, s) => s).filter((s) => !state.entities.dead[s] && state.entities.ownerId(state.entities.ownerIndex[s]!) === p.id) : [];
      const army = units.filter((s) => state.entities.kind[s] === 1).length;
      const bld = units.filter((s) => state.entities.kind[s] === 0).length;
      const spend = (lastMana[p.id] ?? p.mana) - p.mana;
      return `${p.id}:${Math.round(p.mana)}m/${army}u/${bld}b`;
    });
    console.log(`t=${(t / 1200).toFixed(0).padStart(2)}m ${cells.join(' ')} ended=${state.ended}`);
    for (const p of state.players) lastMana[p.id] = p.mana;
  }
}
// Nodes remaining
let nodeMan = 0;
for (let s = 0; s < state.entities.count; s++) if (!state.entities.dead[s] && state.entities.kind[s] === 3) nodeMan += state.entities.hp[s]!;
console.log(`final: ended=${state.ended} winner=${state.winnerTeam} nodeHP remaining=${Math.round(nodeMan)}`);
