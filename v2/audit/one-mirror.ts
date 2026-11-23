import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { hashState } from '../src/sim/hash';

const seed = Number(process.argv.slice(2)[0] ?? '1137');
const reg = loadRegistry();
for (const [c0, c1] of [[0,1],[1,0]] as const) {
  const { state, services } = initMatch(reg, {
    mapId: 'duel_glade', seed, oneSuperweaponPerPlayer: false,
    players: [
      { id: 'p1', controller: 'ai', aiDifficulty: 'normal', team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: c0 },
      { id: 'p2', controller: 'ai', aiDifficulty: 'normal', team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: c1 },
    ],
  } as never);
  const drv = new AiDriver(reg, services);
  while (!state.ended && state.tick < 34*60*20) stepSimulation(state, services, [], drv.hook);
  console.log(`seed ${seed} p1@c${c0}: team${state.winnerTeam} ${(state.tick/1200).toFixed(1)}m hash ${hashState(state)}`);
}
