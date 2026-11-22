// BASE GROWTH AT 10 AND 18 MINUTES — the second goal, measured.
import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { KIND_BUILDING, KIND_UNIT } from '../src/sim/entity-store';

const reg = loadRegistry();
const rows: string[] = [];
for (const seed of [1000, 1014, 1035]) {
  const { state, services } = initMatch(reg, {
    mapId: 'duel_glade', seed, oneSuperweaponPerPlayer: false,
    players: [
      { id: 'p1', controller: 'ai', aiDifficulty: 'normal', team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: 0 },
      { id: 'p2', controller: 'ai', aiDifficulty: 'normal', team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: 1 },
    ],
  } as never);
  const drv = new AiDriver(reg, services);
  for (let t = 0; t < 20 * 60 * 20 && !state.ended; t++) {
    stepSimulation(state, services, [], drv.hook);
    const m = state.tick / 1200;
    if (m !== 10 && m !== 18) continue;
    for (const pid of ['p1', 'p2']) {
      const per = drv.brain(pid)!.perception(state);
      let army = 0, workers = 0;
      for (let s = 0; s < state.entities.count; s++) {
        if (state.entities.dead[s] || state.entities.kind[s] !== KIND_UNIT) continue;
        if (state.entities.ownerId(state.entities.ownerIndex[s]!) !== pid) continue;
        const d = reg.units.get(state.entities.extras[s]!.defId)!;
        if (d.isHarvester) workers++; else if (d.weapon) army++;
      }
      const defenses = per.myBuildings.filter((b) => reg.buildings.get(b.defId)?.menuCategory === 'defenses').length;
      const prod = per.myBuildings.filter((b) => (reg.buildings.get(b.defId)?.producesUnits?.length ?? 0) > 0).length;
      rows.push(
        `${seed} ${m}m ${pid}: buildings=${per.myBuildings.length} production=${prod} defenses=${defenses} ` +
          `workers=${workers} army=${army}`,
      );
    }
  }
}
console.log(rows.join('\n'));
