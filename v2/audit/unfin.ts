import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { KIND_BUILDING, KIND_UNIT } from '../src/sim/entity-store';

const reg = loadRegistry();
const { state, services } = initMatch(reg, {
  mapId: 'duel_glade', seed: 1035, oneSuperweaponPerPlayer: false,
  players: [
    { id: 'p1', controller: 'ai', aiDifficulty: 'hard', team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: 1 },
    { id: 'p2', controller: 'ai', aiDifficulty: 'easy', team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: 0 },
  ],
} as never);
const drv = new AiDriver(reg, services);
for (let t = 0; t < 32 * 60 * 20 && !state.ended; t++) {
  stepSimulation(state, services, [], drv.hook);
  if (state.tick % (1200 * 6) === 0) {
    const parts: string[] = [];
    for (const pid of ['p1', 'p2']) {
      const per = drv.brain(pid)!.perception(state);
      let a = 0, w = 0, b = 0;
      for (let s = 0; s < state.entities.count; s++) {
        if (state.entities.dead[s]) continue;
        if (state.entities.ownerId(state.entities.ownerIndex[s]!) !== pid) continue;
        if (state.entities.kind[s] === KIND_UNIT) { const d = reg.units.get(state.entities.extras[s]!.defId)!; if (d.isHarvester) w++; else if (d.weapon) a++; }
        if (state.entities.kind[s] === KIND_BUILDING) b++;
      }
      parts.push(`${pid}[b${b} w${w} a${a} m${Math.round(per.mana)}]`);
    }
    console.log(`${state.tick / 1200}m ${parts.join(' ')}`);
  }
}
console.log('ended=', state.ended, 'at', (state.tick / 1200).toFixed(1));
for (const pid of ['p1', 'p2']) {
  const b = drv.brain(pid)!;
  console.log(pid, 'atk=' + b.state.attacking, 'passes=' + b.state.passesWithoutProgress, 'lastWave=' + b.state.lastWaveSize, 'regroup=' + b.state.regroupUntil, 'anchor=' + (b.state.enemyAnchor ? 'y' : 'n'), 'waveAge=' + b.state.waveAge);
  console.log('  ', (drv.notes(pid) as string[]).slice(-3).join(' // '));
}
let shown = 0;
for (let s = 0; s < state.entities.count && shown < 5; s++) {
  if (state.entities.dead[s] || state.entities.kind[s] !== KIND_UNIT) continue;
  if (state.entities.ownerId(state.entities.ownerIndex[s]!) !== 'p1') continue;
  const d = reg.units.get(state.entities.extras[s]!.defId)!;
  if (!d.weapon || d.isHarvester) continue;
  shown++;
  console.log('  p1 unit state=' + state.entities.state[s] + ' orders=' + JSON.stringify(state.entities.extras[s]!.orders) + ' pos=' + Math.round(state.entities.posX[s]!) + ',' + Math.round(state.entities.posY[s]!));
}
