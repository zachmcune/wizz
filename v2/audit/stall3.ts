import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { KIND_BUILDING, KIND_UNIT } from '../src/sim/entity-store';

const reg = loadRegistry();
const { state, services } = initMatch(reg, {
  mapId: 'duel_glade', seed: 1000, oneSuperweaponPerPlayer: false,
  players: [
    { id: 'p1', controller: 'ai', aiDifficulty: 'hard', team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: 1 },
    { id: 'p2', controller: 'ai', aiDifficulty: 'easy', team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: 0 },
  ],
} as never);
const drv = new AiDriver(reg, services);
for (let t = 0; t < 32 * 60 * 20 && !state.ended; t++) stepSimulation(state, services, [], drv.hook);
const per = drv.brain('p2')!.perception(state);
console.log('easy(p2) army:', per.myUnits.filter((u) => reg.units.get(u.defId)?.weapon && !reg.units.get(u.defId)?.isHarvester).length);
console.log('easy known enemy buildings:', per.enemyBuildings.length, 'anchor:', JSON.stringify(drv.brain('p2')!.state.enemyAnchor));
console.log('easy notes:', (drv.notes('p2') as string[]).slice(-6));
const perH = drv.brain('p1')!.perception(state);
console.log('hard buildings:', perH.myBuildings.map((b) => b.defId).join(','));
const b2 = drv.brain('p2')!;
console.log('easy attacking:', b2.state.attacking, 'lastWave:', b2.state.lastWaveSize, 'regroup:', b2.state.regroupUntil, 'passes:', b2.state.passesWithoutProgress);
console.log('easy army size:', per.myUnits.filter((u) => reg.units.get(u.defId)?.weapon && !reg.units.get(u.defId)?.isHarvester).length);
console.log('easy anchor:', b2.state.enemyAnchor);
