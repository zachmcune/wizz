// DOES THE AI ACTUALLY EXPAND, AND DOES DIFFICULTY CHANGE IT?
import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { countBases } from '../src/ai/economy';
import { KIND_UNIT } from '../src/sim/entity-store';

const reg = loadRegistry();
for (const diff of ['normal', 'hard'] as const) {
  const { state, services } = initMatch(reg, {
    mapId: 'duel_glade', seed: 1000, oneSuperweaponPerPlayer: false,
    players: [
      { id: 'p1', controller: 'ai', aiDifficulty: diff, team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: 0 },
      { id: 'p2', controller: 'ai', aiDifficulty: 'easy', team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: 1 },
    ],
  } as never);
  const drv = new AiDriver(reg, services);
  const trail: string[] = [];
  for (let t = 0; t < 26 * 60 * 20 && !state.ended; t++) {
    stepSimulation(state, services, [], drv.hook);
    const m = state.tick / 1200;
    if (m === 10 || m === 18 || m === 24) {
      const per = drv.brain('p1')!.perception(state);
      const bases = countBases(per, reg);
      const workers = per.myUnits.filter((u) => reg.units.get(u.defId)?.isHarvester).length;
      const army = per.myUnits.filter((u) => reg.units.get(u.defId)?.weapon && !reg.units.get(u.defId)?.isHarvester).length;
      trail.push(`${m}m bld=${per.myBuildings.length} bases=${bases} wk=${workers} army=${army}`);
    }
  }
  console.log(`${diff}: ${trail.join(' | ')}`);
  console.log(`  notes: ${(drv.notes('p1') as string[]).filter((n) => /EXPAND|Wagon|DEPLOY|forward/i.test(n)).slice(-4).join(' // ') || '(no expansion notes)'}`);
  const per = drv.brain('p1')!.perception(state);
  const forge = per.myBuildings.some((b) => b.defId === 'golem_forge' && b.buildProgress === undefined);
  console.log('  forge=' + forge + ' blds=[' + per.myBuildings.map((b) => b.defId).join(',') + '] mana=' + Math.round(per.mana));
  void KIND_UNIT;
}
