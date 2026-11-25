// IS THE ADVANTAGE PLAYER-CREATION ORDER (the first entry in state.players)?
import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';

const reg = loadRegistry();
/** `first` controls which corner is listed FIRST in the players array, independent of which corner it is. */
function play(seed: number, firstCorner: number, secondCorner: number): number | null {
  const { state, services } = initMatch(reg, {
    mapId: 'duel_glade', seed, oneSuperweaponPerPlayer: false,
    players: [
      // Listed first -> gets player slot 0 and lower entity ids.
      { id: 'p1', controller: 'ai', aiDifficulty: 'normal', team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: firstCorner },
      { id: 'p2', controller: 'ai', aiDifficulty: 'normal', team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: secondCorner },
    ],
  } as never);
  const drv = new AiDriver(reg, services);
  for (let t = 0; t < 34 * 60 * 20 && !state.ended; t++) stepSimulation(state, services, [], drv.hook);
  return state.ended ? state.winnerTeam : null;
}

// Same physical corners, only the LISTING order changes.
let firstWins = 0, firstLosses = 0;
for (const seed of [1000, 1014, 1035, 1042]) {
  const a = play(seed, 0, 1); // corner0 listed first
  if (a === 0) firstWins++; else if (a === 1) firstLosses++;
  const b = play(seed, 1, 0); // corner1 listed first
  if (b === 0) firstWins++; else if (b === 1) firstLosses++;
}
console.log(`FIRST-LISTED player won ${firstWins}, lost ${firstLosses} across 8 mirror games`);
