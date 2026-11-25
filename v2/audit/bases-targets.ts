// BASE-GROWTH TARGETS PER DIFFICULTY, across seeds, with the match length reported.
import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { countBases } from '../src/ai/economy';
import { KIND_UNIT } from '../src/sim/entity-store';

const reg = loadRegistry();
const seeds = [1035, 1056, 1077];
console.log('diff   seed  10m[bld/bases/wk/army]  18m[bld/bases/wk/army]  end[min]');
for (const diff of ['normal', 'hard'] as const) {
  for (const seed of seeds) {
    const { state, services } = initMatch(reg, {
      mapId: 'duel_glade', seed, oneSuperweaponPerPlayer: false,
      players: [
        { id: 'p1', controller: 'ai', aiDifficulty: diff, team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: 0 },
        { id: 'p2', controller: 'ai', aiDifficulty: diff, team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: 1 },
      ],
    } as never);
    const drv = new AiDriver(reg, services);
    const snap = (pid: string) => {
      const per = drv.brain(pid)!.perception(state);
      let wk = 0, army = 0;
      for (let s = 0; s < state.entities.count; s++) {
        if (state.entities.dead[s] || state.entities.kind[s] !== KIND_UNIT) continue;
        if (state.entities.ownerId(state.entities.ownerIndex[s]!) !== pid) continue;
        const d = reg.units.get(state.entities.extras[s]!.defId)!;
        if (d.isHarvester) wk++; else if (d.weapon) army++;
      }
      return `${per.myBuildings.length}/${countBases(per, reg)}/${wk}/${army}`;
    };
    let s10 = '-', s18 = '-';
    for (let t = 0; t < 30 * 60 * 20 && !state.ended; t++) {
      stepSimulation(state, services, [], drv.hook);
      const m = state.tick / 1200;
      if (m === 10) s10 = snap('p1');
      if (m === 18) s18 = snap('p1');
    }
    console.log(`${diff.padEnd(6)} ${seed}  ${s10.padEnd(20)}  ${s18.padEnd(20)}  ${(state.tick / 1200).toFixed(1)}`);
  }
}
