// IS THE WORKER FLEE ACTUALLY FIRING DURING THE RAID THAT WIPES THE LINE?
import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { KIND_UNIT } from '../src/sim/entity-store';

const reg = loadRegistry();
const { state, services } = initMatch(reg, {
  mapId: 'duel_glade', seed: 1035, oneSuperweaponPerPlayer: false,
  players: [
    { id: 'p1', controller: 'ai', aiDifficulty: 'normal', team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: 0 },
    { id: 'p2', controller: 'ai', aiDifficulty: 'normal', team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: 1 },
  ],
} as never);
const drv = new AiDriver(reg, services);

let fleeNotes = 0;
for (let t = 0; t < 12 * 60 * 20 && !state.ended; t++) {
  stepSimulation(state, services, [], drv.hook);
  for (const pid of ['p1', 'p2']) {
    const n = (drv.notes(pid) as string[]).filter((x) => x.includes('pulling')).length;
    if (pid === 'p1' && n > fleeNotes) fleeNotes = n;
  }
  if (state.tick % 1200 === 0 && state.tick <= 1200 * 11) {
    const m = state.tick / 1200;
    const rows: string[] = [];
    for (const pid of ['p1', 'p2']) {
      const per = drv.brain(pid)!.perception(state);
      const w = per.myUnits.filter((u) => reg.units.get(u.defId)?.isHarvester);
      const raiders = per.enemyUnits.filter((e) => e.weapon).length;
      rows.push(`${pid} w=${w.length} raidersSeen=${raiders}`);
    }
    console.log(`${m}m ${rows.join(' | ')}`);
  }
}
console.log('p1 total "pulling worker" notes:', fleeNotes);
