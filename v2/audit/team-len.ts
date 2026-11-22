import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';

const reg = loadRegistry();
async function play(label: string, players: {id:string;team:number;start:number;diff:'easy'|'normal'|'hard'}[], seed: number, max: number) {
  const { state, services } = initMatch(reg, {
    mapId: 'duel_glade', seed, oneSuperweaponPerPlayer: false,
    players: players.map((p, i) => ({ id: p.id, controller: 'ai' as const, aiDifficulty: p.diff, team: p.team,
      color: ['#4f9dff','#ff5d5d','#5dff8f','#ffd166'][i]!, factionId: 'arcane', startIndex: p.start })),
  } as never);
  const drv = new AiDriver(reg, services);
  for (let t = 0; t < max * 60 * 20 && !state.ended; t++) stepSimulation(state, services, [], drv.hook);
  console.log(`${label} seed ${seed}: ended=${state.ended} winner=${state.winnerTeam} at ${(state.tick/1200).toFixed(1)} min`);
}
await play('2v2', [
  {id:'a1',team:0,start:0,diff:'hard'},{id:'a2',team:0,start:1,diff:'easy'},
  {id:'b1',team:1,start:2,diff:'normal'},{id:'b2',team:1,start:3,diff:'normal'}], 9091, 60);
await play('FFA4', [
  {id:'f0',team:0,start:0,diff:'normal'},{id:'f1',team:1,start:1,diff:'normal'},
  {id:'f2',team:2,start:2,diff:'normal'},{id:'f3',team:3,start:3,diff:'normal'}], 9092, 60);
