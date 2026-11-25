// DO THE SEEDED OPENING VARIANTS DIFFER IN STRENGTH?
import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { AiBrain } from '../src/ai/brain';

const reg = loadRegistry();
for (const variant of [0, 1, 2]) {
  let w = 0, l = 0;
  for (const seed of [1000, 1014, 1035, 1042]) for (const sw of [false, true]) {
    const { state, services } = initMatch(reg, {
      mapId: 'duel_glade', seed, oneSuperweaponPerPlayer: false,
      players: [
        { id: 'p1', controller: 'ai', aiDifficulty: 'normal', team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: sw ? 1 : 0 },
        { id: 'p2', controller: 'ai', aiDifficulty: 'normal', team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: sw ? 0 : 1 },
      ],
    } as never);
    const drv = new AiDriver(reg, services);
    // Force p1's variant, leave p2 at its natural one.
    stepSimulation(state, services, [], drv.hook);
    (drv.brain('p1') as unknown as { openingVariant: number }).openingVariant = variant;
    for (let t = 0; t < 34 * 60 * 20 && !state.ended; t++) stepSimulation(state, services, [], drv.hook);
    if (state.winnerTeam === 0) w++; else if (state.winnerTeam === 1) l++;
  }
  console.log(`p1 forced variant ${variant}: ${w}-${l}`);
}
void AiBrain;
