// ARE PRODUCE COMMANDS ACTUALLY REJECTED? — command rejections by reason, per player, in the 4-way seed.
//
// `audit/production-probe.ts` shows passes where `spendable > threshold` and army is still zero, which means the AI DID
// issue a `produce` and the sim refused it. `commandRejected` events carry the reason, so this counts them instead of
// guessing at the cause.
//
//   npx vite-node audit/rejection-probe.ts

import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';

const reg = loadRegistry();
const COLORS = ['#4f9dff', '#ff5d5d', '#5cff8a', '#ffd166'];
const { state, services } = initMatch(reg, {
  mapId: 'duel_glade',
  seed: 1021,
  oneSuperweaponPerPlayer: false,
  players: [0, 1, 2, 3].map((i) => ({
    id: `p${i + 1}`,
    controller: 'ai',
    aiDifficulty: 'normal',
    team: i,
    color: COLORS[i]!,
    factionId: 'arcane',
    startIndex: i,
  })),
} as never);

const drv = new AiDriver(reg, services);
const cap = 14 * 60 * 20;
const counts = new Map<string, number>();
const produceIssued = new Map<string, number>();
const produceBy = new Map<string, number>();
const amBySize = new Map<string, number>();
const amArmy = new Map<string, number>();
let lastEventIndex = 0;

for (let t = 0; t < cap && !state.ended; t++) {
  const cmds = drv.hook(state, services);
  for (const c of cmds) {
    if (c.type === 'produce') {
      produceIssued.set(c.playerId, (produceIssued.get(c.playerId) ?? 0) + 1);
      produceBy.set(`${c.playerId} ${c.defId}`, (produceBy.get(`${c.playerId} ${c.defId}`) ?? 0) + 1);
    }
    if (c.type === 'attackMove' && c.playerId === 'p1') {
      const meP = state.players.find((p) => p.id === 'p1')!;
      let armyN = 0;
      for (let s2 = 0; s2 < state.entities.count; s2++) {
        if (state.entities.dead[s2]) continue;
        if (state.entities.ownerId(state.entities.ownerIndex[s2]!) !== 'p1') continue;
        if (state.entities.kind[s2] !== 0) continue;
        const ud = reg.units.get(state.entities.extras[s2]!.defId);
        if (ud?.weapon && !ud.isHarvester) armyN++;
      }
      void meP;
      amArmy.set(`army=${armyN} n=${c.entityIds.length}`, (amArmy.get(`army=${armyN} n=${c.entityIds.length}`) ?? 0) + 1);
    }
    if (c.type === 'attackMove') {
      amBySize.set(`${c.playerId} n=${c.entityIds.length}`, (amBySize.get(`${c.playerId} n=${c.entityIds.length}`) ?? 0) + 1);
    }
  }
  const res = stepSimulation(state, services, cmds);
  for (let i = 0; i < res.events.length; i++) {
    const e = res.events[i]!;
    if (e.type === 'entityDied' && e.defId !== 'wisp') {
      counts.set(`${e.owner} DIED ${e.defId}`, (counts.get(`${e.owner} DIED ${e.defId}`) ?? 0) + 1);
    }
    if (e.type === 'commandRejected') {
      const k = `${e.playerId} REJECT ${e.reason}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    } else if (e.type === 'entitySpawned') {
      const k = `${e.owner} SPAWN ${e.defId}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  lastEventIndex = 0;
}
console.log('produce commands issued:');
for (const [k, v] of [...produceIssued.entries()].sort()) console.log(`   ${k}: ${v}`);
console.log('\nproduce by unit:');
for (const [k, v] of [...produceBy.entries()].sort((a,b)=>b[1]-a[1])) console.log(`   ${String(v).padStart(4)}  ${k}`);
console.log('\nattackMove commands by squad SIZE:');
for (const [k, v] of [...amBySize.entries()].sort((a,b)=>b[1]-a[1])) console.log(`   ${String(v).padStart(4)}  ${k}`);
console.log('\narmy count at each attackMove (p1 only):');
for (const [k, v] of [...amArmy.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10)) console.log(`   ${String(v).padStart(4)}  ${k}`);
console.log('\nrejections by player+reason:');
for (const [k, v] of [...counts.entries()].sort((a, b) => b[1] - a[1])) console.log(`   ${String(v).padStart(4)}  ${k}`);
console.log(`\nended=${state.ended} tick=${state.tick}`);
