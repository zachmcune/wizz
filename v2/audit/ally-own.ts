// In a 2v2, does a brain see its ALLY's buildings as its own? That would make it try to build on top of its
// teammate's base and to harvest nodes it does not own.
import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { PerceivedWorld } from '../src/ai/perception';

const reg = loadRegistry();
const { state, services } = initMatch(reg, {
  mapId: 'duel_glade', seed: 2005, oneSuperweaponPerPlayer: false,
  players: [
    { id: 'a1', controller: 'ai', aiDifficulty: 'normal', team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: 0 },
    { id: 'a2', controller: 'ai', aiDifficulty: 'normal', team: 0, color: '#5dff8f', factionId: 'arcane', startIndex: 2 },
    { id: 'b1', controller: 'ai', aiDifficulty: 'normal', team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: 1 },
    { id: 'b2', controller: 'ai', aiDifficulty: 'normal', team: 1, color: '#ffd166', factionId: 'arcane', startIndex: 3 },
  ],
} as never);
const drv = new AiDriver(reg, services);
for (let t = 0; t < 10 * 20; t++) stepSimulation(state, services, [], drv.hook);
const world = new PerceivedWorld(services);
const per = world.build(state, 'a2');
const owners = new Map<string, number>();
for (const b of per.myBuildings) owners.set(b.owner, (owners.get(b.owner) ?? 0) + 1);
console.log(`a2 sees ${per.myBuildings.length} "my" buildings, by owner: ${[...owners.entries()].map(([o, n]) => `${o}:${n}`).join(' ')}`);
const uowners = new Map<string, number>();
for (const u of per.myUnits) uowners.set(u.owner, (uowners.get(u.owner) ?? 0) + 1);
console.log(`a2 sees ${per.myUnits.length} "my" units, by owner: ${[...uowners.entries()].map(([o, n]) => `${o}:${n}`).join(' ')}`);
console.log(`a2's own actual buildings: ${Array.from({length: state.entities.count}, (_, s) => s).filter(s => !state.entities.dead[s] && state.entities.kind[s] === 0 && state.entities.ownerId(state.entities.ownerIndex[s]!) === 'a2').length}`);
