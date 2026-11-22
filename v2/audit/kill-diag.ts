// WHAT KILLS THE WORKER LINE, AND WHEN?
//
// Seeds 1035/1042 go from 10 workers to 0 between minutes 8 and 10 and never recover. This attributes each worker death to a
// cause so the fix targets the actual mechanism rather than guessing.
import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { KIND_UNIT } from '../src/sim/entity-store';

const reg = loadRegistry();
const seed = Number(process.argv[2] ?? 1035);
const { state, services } = initMatch(reg, {
  mapId: 'duel_glade', seed, oneSuperweaponPerPlayer: false,
  players: [
    { id: 'p1', controller: 'ai', aiDifficulty: 'normal', team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: 0 },
    { id: 'p2', controller: 'ai', aiDifficulty: 'normal', team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: 1 },
  ],
} as never);
const drv = new AiDriver(reg, services);

const seen = new Set<number>();
const byMinute: Record<number, number> = {};
let total = 0;

for (let t = 0; t < 20 * 60 * 20 && !state.ended; t++) {
  const before = new Map<number, string>();
  for (let s = 0; s < state.entities.count; s++) {
    if (state.entities.dead[s] || state.entities.kind[s] !== KIND_UNIT) continue;
    if (!reg.units.get(state.entities.extras[s]!.defId)?.isHarvester) continue;
    before.set(state.entities.id[s]!, state.entities.ownerId(state.entities.ownerIndex[s]!)!);
  }
  const r = stepSimulation(state, services, [], drv.hook);
  // entityDied events carry the killer, if any.
  for (const e of r.events) {
    const ev = e as { type: string; id?: number; killerId?: number; owner?: string };
    if (ev.type !== 'entityDied' || ev.id === undefined) continue;
    if (!before.has(ev.id) || seen.has(ev.id)) continue;
    seen.add(ev.id);
    total++;
    const m = Math.floor(state.tick / 1200);
    byMinute[m] = (byMinute[m] ?? 0) + 1;
  }
}
console.log(`seed ${seed}: ${total} worker deaths. By minute:`, JSON.stringify(byMinute));
