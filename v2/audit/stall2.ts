import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { KIND_UNIT } from '../src/sim/entity-store';

const reg = loadRegistry();
const workerCost = reg.unit('wisp').cost;
const { state, services } = initMatch(reg, {
  mapId: 'duel_glade', seed: 1000, oneSuperweaponPerPlayer: false,
  players: [
    { id: 'p1', controller: 'ai', aiDifficulty: 'normal', team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: 0 },
    { id: 'p2', controller: 'ai', aiDifficulty: 'normal', team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: 1 },
  ],
} as never);
const drv = new AiDriver(reg, services);
const stuckSince: Record<string, number> = { p1: -1, p2: -1 };
for (let t = 0; t < 30 * 60 * 20 && !state.ended; t++) {
  stepSimulation(state, services, [], drv.hook);
  for (const pid of ['p1', 'p2']) {
    const p = state.players.find((x) => x.id === pid)!;
    if (p.defeated) continue;
    let w = 0;
    for (let s = 0; s < state.entities.count; s++) {
      if (state.entities.dead[s] || state.entities.kind[s] !== KIND_UNIT) continue;
      if (state.entities.ownerId(state.entities.ownerIndex[s]!) !== pid) continue;
      if (reg.units.get(state.entities.extras[s]!.defId)?.isHarvester) w++;
    }
    const dead = w === 0 && p.mana < workerCost;
    if (dead && stuckSince[pid]! < 0) stuckSince[pid] = state.tick;
    if (!dead && stuckSince[pid]! >= 0) {
      const dur = (state.tick - stuckSince[pid]!) / 20;
      if (dur > 30) {
        const per = drv.brain(pid)!.perception(state);
        console.log(`${pid} stuck ${dur.toFixed(0)}s (${(stuckSince[pid]!/1200).toFixed(1)}m-${(state.tick/1200).toFixed(1)}m) manaNow=${Math.round(p.mana)} blds=[${per.myBuildings.map(b=>b.defId).join(',')}]`);
      }
      stuckSince[pid] = -1;
    }
  }
}
console.log('ended', state.ended, 'at', (state.tick/1200).toFixed(1), 'min');
