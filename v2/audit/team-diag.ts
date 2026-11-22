import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { KIND_BUILDING, KIND_UNIT } from '../src/sim/entity-store';

const reg = loadRegistry();
const { state, services } = initMatch(reg, {
  mapId: 'duel_glade', seed: 9091, oneSuperweaponPerPlayer: false,
  players: [
    { id: 'a1', controller: 'ai', aiDifficulty: 'hard', team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: 0 },
    { id: 'a2', controller: 'ai', aiDifficulty: 'easy', team: 0, color: '#5dff8f', factionId: 'arcane', startIndex: 2 },
    { id: 'b1', controller: 'ai', aiDifficulty: 'normal', team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: 1 },
    { id: 'b2', controller: 'ai', aiDifficulty: 'normal', team: 1, color: '#ffd166', factionId: 'arcane', startIndex: 3 },
  ],
} as never);
const drv = new AiDriver(reg, services);
for (let t = 0; t < 40 * 60 * 20 && !state.ended; t++) {
  stepSimulation(state, services, [], drv.hook);
  if (state.tick % (1200 * 5) === 0) {
    const parts: string[] = [];
    for (const pid of ['a1', 'a2', 'b1', 'b2']) {
      let u = 0, a = 0, b = 0;
      for (let s = 0; s < state.entities.count; s++) {
        if (state.entities.dead[s]) continue;
        if (state.entities.ownerId(state.entities.ownerIndex[s]!) !== pid) continue;
        if (state.entities.kind[s] === KIND_UNIT) { u++; const d = reg.units.get(state.entities.extras[s]!.defId)!; if (d.weapon && !d.isHarvester) a++; }
        if (state.entities.kind[s] === KIND_BUILDING) b++;
      }
      parts.push(`${pid}[u${u} a${a} b${b}]`);
    }
    console.log(`${state.tick / 1200}m ${parts.join(' ')}`);
  }
}
console.log('ended=', state.ended, 'winner=', state.winnerTeam, (state.tick / 1200).toFixed(1));
for (const pid of ['a1','b1']) {
  const b = drv.brain(pid)!;
  const per = b.perception(state);
  console.log(pid, 'atk=' + b.state.attacking, 'passes=' + b.state.passesWithoutProgress, 'lastWave=' + b.state.lastWaveSize, 'regroup=' + b.state.regroupUntil, 'anchor=' + (b.state.enemyAnchor ? 'y':'n'), 'knownEnemyBld=' + per.enemyBuildings.length);
  console.log('  explored:', per.exploredTiles.size, '/', per.mapW*per.mapH); console.log('  anchorAt:', JSON.stringify(b.state.enemyAnchor), 'knownBlds:', per.enemyBuildings.map(x => x.defId + '@' + Math.round(x.x) + ',' + Math.round(x.y)).join(' '));
  console.log('  ', (drv.notes(pid) as string[]).slice(-3).join(' // '));
}
