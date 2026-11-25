import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { findBuildSpot } from '../src/ai/economy';

const reg = loadRegistry();
const { state, services } = initMatch(reg, {
  mapId: 'duel_glade', seed: 1000, oneSuperweaponPerPlayer: false,
  players: [
    { id: 'p1', controller: 'ai', aiDifficulty: 'hard', team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: 0 },
    { id: 'p2', controller: 'ai', aiDifficulty: 'easy', team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: 1 },
  ],
} as never);
const drv = new AiDriver(reg, services);
for (let t = 0; t < 5 * 60 * 20; t++) stepSimulation(state, services, [], drv.hook);
const per = drv.brain('p1')!.perception(state);
const wall = reg.buildings.get('stone_wall')!;
const target = { x: 656, y: 1424 };
console.log('nearest building to target:', JSON.stringify(per.myBuildings.map(b=>({d: Math.round(Math.hypot(b.x-target.x,b.y-target.y)), id: b.defId})).sort((a,b)=>a.d-b.d)[0]));
// Step point from the nearest structure toward the target.
const near = per.myBuildings.reduce((b, x) => (Math.hypot(x.x-target.x,x.y-target.y) < Math.hypot(b.x-target.x,b.y-target.y) ? x : b), per.myBuildings[0]!);
const d = Math.hypot(target.x-near.x, target.y-near.y);
const step = { x: near.x + (target.x-near.x)/d*32*6, y: near.y + (target.y-near.y)/d*32*6 };
console.log('step point:', JSON.stringify({x:Math.round(step.x),y:Math.round(step.y)}));
const spot = findBuildSpot(state, per, services, reg, wall, step);
console.log('findBuildSpot(prefer=target):', JSON.stringify(spot));
if (spot) console.log('  dist from target:', Math.round(Math.hypot(spot.x-target.x, spot.y-target.y)));
const spotNo = findBuildSpot(state, per, services, reg, wall);
console.log('findBuildSpot(no prefer):', JSON.stringify(spotNo));
