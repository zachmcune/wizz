import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';

const reg = loadRegistry();
const { state, services } = initMatch(reg, {
  mapId: 'duel_glade', seed: 1000, oneSuperweaponPerPlayer: false,
  players: [
    { id: 'p1', controller: 'ai', aiDifficulty: 'normal', team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: 0 },
    { id: 'p2', controller: 'ai', aiDifficulty: 'normal', team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: 1 },
  ],
} as never);
const drv = new AiDriver(reg, services);
for (let t = 0; t < 30 * 60 * 20 && !state.ended; t++) stepSimulation(state, services, [], drv.hook);
console.log('ended=', state.ended, 'winner=', state.winnerTeam, (state.tick / 1200).toFixed(1), 'min');
for (const pid of ['p1', 'p2']) {
  const b = drv.brain(pid)!;
  console.log(`${pid}: attacking=${b.state.attacking} passes=${b.state.passesWithoutProgress} lastWave=${b.state.lastWaveSize} regroup=${b.state.regroupUntil} anchor=${b.state.enemyAnchor ? 'y' : 'n'}`);
  console.log('  notes:', (drv.notes(pid) as string[]).slice(-6).join(' // '));
}
