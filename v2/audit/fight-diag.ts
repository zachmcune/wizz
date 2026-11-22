// IS THE COLLAPSE A LOST FIGHT, OR AN ECONOMY FAILURE?
//
// p1 loses all workers around minute 10 on seed 1035. If its army was already beaten, the worker wipe is a consequence of losing,
// not a cause — and fixing the flee would not change the outcome. This separates the two.
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
let deathLog: string[] = [];
const seen = new Set<number>();

for (let t = 0; t < 12 * 60 * 20 && !state.ended; t++) {
  const before = new Map<number, { owner: string; kind: string }>();
  for (let s = 0; s < state.entities.count; s++) {
    if (state.entities.dead[s]) continue;
    if (state.entities.kind[s] !== KIND_UNIT) continue;
    const d = reg.units.get(state.entities.extras[s]!.defId)!;
    before.set(state.entities.id[s]!, {
      owner: state.entities.ownerId(state.entities.ownerIndex[s]!)!,
      kind: d.isHarvester ? 'worker' : d.weapon ? 'army' : 'other',
    });
  }
  stepSimulation(state, services, [], drv.hook);
  for (const [id, info] of before) {
    const slot = state.entities.slotOf(id as never);
    if ((slot < 0 || state.entities.dead[slot]) && !seen.has(id)) {
      seen.add(id);
      deathLog.push(`${Math.floor(state.tick / 1200)}m ${info.owner}/${info.kind}`);
    }
  }
}
const byMinute: Record<string, { army: number; worker: number }> = {};
for (const d of deathLog) {
  const [m, k] = d.split(' ');
  const key = m!;
  byMinute[key] ??= { army: 0, worker: 0 };
  if (k!.includes('army')) byMinute[key]!.army++;
  else if (k!.includes('worker')) byMinute[key]!.worker++;
}
console.log('deaths by minute (both sides):');
for (const m of Object.keys(byMinute).sort((a, b) => parseInt(a) - parseInt(b))) {
  console.log(`  ${m}: army=${byMinute[m]!.army} worker=${byMinute[m]!.worker}`);
}
