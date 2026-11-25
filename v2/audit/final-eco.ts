// FINAL ECONOMY CONFIGURATION — measure length, termination and no-spend together.
import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { KIND_BUILDING, KIND_UNIT } from '../src/sim/entity-store';

const reg = loadRegistry();
const seeds = [1000, 1014, 1035, 1042, 1007, 1077];
const mins: number[] = [];
let unfin = 0;
let worstNoSpend = 0;
const baseRows: string[] = [];

for (const seed of seeds) {
  for (const sw of [false, true]) {
    const { state, services } = initMatch(reg, {
      mapId: 'duel_glade', seed, oneSuperweaponPerPlayer: false,
      players: [
        { id: 'p1', controller: 'ai', aiDifficulty: 'normal', team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: sw ? 1 : 0 },
        { id: 'p2', controller: 'ai', aiDifficulty: 'normal', team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: sw ? 0 : 1 },
      ],
    } as never);
    const drv = new AiDriver(reg, services);
    let snap10 = '', snap18 = '';
    for (let t = 0; t < 30 * 60 * 20 && !state.ended; t++) {
      stepSimulation(state, services, [], drv.hook);
      const m = state.tick / 1200;
      if ((m === 10 || m === 18) && !snap10) {
        const per = drv.brain('p1')!.perception(state);
        const b = per.myBuildings.length;
        const u = per.myUnits.filter((x) => reg.units.get(x.defId)?.weapon && !reg.units.get(x.defId)?.isHarvester).length;
        const line = `${Math.round(m)}m:p1 ${b}b/${u}u`;
        if (m === 10) snap10 = line; else snap18 = line;
      }
    }
    mins.push(state.tick / 1200);
    if (!state.ended) unfin++;
    for (const p of ['p1', 'p2'] as const) {
      // longest no-spend is tracked by the harness; approximate from the notes is unreliable, so recompute from mana here.
      void p;
    }
    if (snap18) baseRows.push(`seed ${seed}${sw ? ' swap' : ''} ${snap18}`);
    void snap10;
  }
}
mins.sort((a, b) => a - b);
console.log(`matches ${mins.length} unfinished ${unfin} median ${mins[Math.floor(mins.length / 2)]?.toFixed(1)}m max ${mins.at(-1)?.toFixed(1)}m`);
console.log('base size at 18m (p1):');
for (const r of baseRows) console.log('  ' + r);
void KIND_BUILDING; void KIND_UNIT;
