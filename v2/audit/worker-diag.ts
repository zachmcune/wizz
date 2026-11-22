// WHY DO WORKERS REACH ZERO AND NEVER COME BACK?
//
// Seeds 1035 and 1042 freeze with 61,047 mana still on the map and both sides at 0 workers: the map is not dry, the economy is
// dead. This traces the cause — whether production is attempted, whether it is rejected, and what the producer state is.
import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { KIND_BUILDING, KIND_UNIT } from '../src/sim/entity-store';

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
const rej: Record<string, number> = {};

for (let t = 0; t < 20 * 60 * 20 && !state.ended; t++) {
  const r = stepSimulation(state, services, [], drv.hook);
  for (const e of r.events) {
    if (String(e.type) === 'commandRejected') {
      const k = `${(e as { playerId: string }).playerId}:${(e as { reason: string }).reason}`;
      rej[k] = (rej[k] ?? 0) + 1;
    }
  }
  if (state.tick % 1200 === 0) {
    const m = state.tick / 1200;
    if (m !== 6 && m !== 8 && m !== 10 && m !== 12) continue;
    for (const pid of ['p1', 'p2']) {
      let w = 0;
      const blds: string[] = [];
      for (let s = 0; s < state.entities.count; s++) {
        if (state.entities.dead[s]) continue;
        if (state.entities.ownerId(state.entities.ownerIndex[s]!) !== pid) continue;
        if (state.entities.kind[s] === KIND_UNIT && reg.units.get(state.entities.extras[s]!.defId)?.isHarvester) w++;
        if (state.entities.kind[s] === KIND_BUILDING) blds.push(state.entities.extras[s]!.defId);
      }
      const spire = blds.filter((b) => b === 'attunement_spire').length;
      const per = drv.brain(pid)!.perception(state);
      console.log(`${m}m ${pid}: workers=${w} spires=${spire} mana=${Math.round(per.mana)} blds=[${blds.join(',')}]`);
    }
  }
}
console.log('rejections:', JSON.stringify(rej));
