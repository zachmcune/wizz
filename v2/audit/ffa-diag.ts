// WHY DOES THE 4-PLAYER FFA NO LONGER FINISH?
import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { KIND_BUILDING, KIND_UNIT } from '../src/sim/entity-store';

const reg = loadRegistry();
const { state, services } = initMatch(reg, {
  mapId: 'duel_glade', seed: 9092, oneSuperweaponPerPlayer: false,
  players: ['f0', 'f1', 'f2', 'f3'].map((id, i) => ({
    id, controller: 'ai' as const, aiDifficulty: 'normal' as const, team: i,
    color: ['#4f9dff', '#ff5d5d', '#5dff8f', '#ffd166'][i]!, factionId: 'arcane', startIndex: i,
  })),
} as never);
const drv = new AiDriver(reg, services);
for (let t = 0; t < 55 * 60 * 20 && !state.ended; t++) {
  stepSimulation(state, services, [], drv.hook);
  if (state.tick % (1200 * 4) === 0) {
    const parts: string[] = [];
    for (const pid of ['f0', 'f1', 'f2', 'f3']) {
      let u = 0, a = 0, b = 0;
      for (let s = 0; s < state.entities.count; s++) {
        if (state.entities.dead[s]) continue;
        if (state.entities.ownerId(state.entities.ownerIndex[s]!) !== pid) continue;
        if (state.entities.kind[s] === KIND_UNIT) { u++; const d = reg.units.get(state.entities.extras[s]!.defId)!; if (d.weapon && !d.isHarvester) a++; }
        else if (state.entities.kind[s] === KIND_BUILDING) b++;
      }
      parts.push(`${pid}[u${u} a${a} b${b}]`);
    }
    console.log(`${state.tick / 1200}m ${parts.join(' ')}`);
  }
}
console.log('ended=', state.ended, 'winner=', state.winnerTeam, 'at', (state.tick / 1200).toFixed(1), 'min');
const b3 = drv.brain('f3')!;
const per3 = b3.perception(state);
console.log('f3 attacking=', b3.state.attacking, 'passes=', b3.state.passesWithoutProgress, 'knownEnemyBld=', per3.enemyBuildings.length, 'anchor=', JSON.stringify(b3.state.enemyAnchor));
console.log('f3 notes:', (drv.notes('f3') as string[]).slice(-5));
let shown = 0;
for (let s = 0; s < state.entities.count && shown < 3; s++) {
  if (state.entities.dead[s] || state.entities.kind[s] !== KIND_UNIT) continue;
  if (state.entities.ownerId(state.entities.ownerIndex[s]!) !== 'f3') continue;
  const d = reg.units.get(state.entities.extras[s]!.defId)!;
  if (!d.weapon || d.isHarvester) continue;
  shown++;
  console.log('  f3 unit state=' + state.entities.state[s] + ' orders=' + JSON.stringify(state.entities.extras[s]!.orders) + ' pos=' + Math.round(state.entities.posX[s]!) + ',' + Math.round(state.entities.posY[s]!));
}
