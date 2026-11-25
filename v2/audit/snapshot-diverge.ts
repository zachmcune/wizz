// WHY DOES A RESTORED STATE DIVERGE AFTER ONE TICK?
//
// `tests/sim/snapshot.test.ts` shows a restored snapshot hashing identically at the moment of restore but
// differing one tick later. That means something the hash covers is equal, but something the STEP depends on
// is not. This harness steps both worlds once and diffs every field so the missing piece is named.
import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { hashState } from '../src/sim/hash';
import { encodeSnapshot, restoreState } from '../src/sim/snapshot';
import { AiDriver } from '../src/ai/driver';

const reg = loadRegistry();
const { state, services } = initMatch(reg, {
  mapId: 'duel_glade',
  seed: 1035,
  oneSuperweaponPerPlayer: false,
  players: [
    { id: 'p1', controller: 'ai', aiDifficulty: 'hard', team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: 0 },
    { id: 'p2', controller: 'ai', aiDifficulty: 'normal', team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: 1 },
  ],
} as never);
const drv = new AiDriver(reg, services);
for (let t = 0; t < 5 * 60 * 20 && !state.ended; t++) stepSimulation(state, services, [], drv.hook);

const snap = encodeSnapshot(state);
const restored = restoreState(reg, snap);
console.log('hash before step: original', hashState(state), 'restored', hashState(restored.state));

// Diff the PRE-STEP state field by field.
const A = state.entities;
const B = restored.state.entities;
console.log('count', A.count, B.count, 'nextEntityId', state.nextEntityId, restored.state.nextEntityId);
const COLS = ['posX', 'posY', 'velX', 'velY', 'facing', 'hp', 'maxHp', 'radius', 'amount', 'amountMax'] as const;
let diffs = 0;
for (let i = 0; i < Math.min(A.count, B.count); i++) {
  for (const c of COLS) {
    if (A[c][i] !== B[c][i]) {
      if (diffs < 10) console.log(`  slot ${i} ${A.extras[i]!.defId} ${c}: ${A[c][i]} vs ${B[c][i]}`);
      diffs++;
    }
  }
  if (A.id[i] !== B.id[i] || A.state[i] !== B.state[i] || A.stance[i] !== B.stance[i] || A.dead[i] !== B.dead[i]) {
    if (diffs < 10) console.log(`  slot ${i} scalar: id ${A.id[i]}/${B.id[i]} state ${A.state[i]}/${B.state[i]} stance ${A.stance[i]}/${B.stance[i]} dead ${A.dead[i]}/${B.dead[i]}`);
    diffs++;
  }
  const ea = A.extras[i]!, eb = B.extras[i]!;
  if (JSON.stringify(ea.orders) !== JSON.stringify(eb.orders)) {
    if (diffs < 10) console.log(`  slot ${i} orders: ${JSON.stringify(ea.orders)} vs ${JSON.stringify(eb.orders)}`);
    diffs++;
  }
  if (JSON.stringify(ea.caps) !== JSON.stringify(eb.caps)) {
    if (diffs < 10) console.log(`  slot ${i} caps: ${JSON.stringify(ea.caps)} vs ${JSON.stringify(eb.caps)}`);
    diffs++;
  }
  if (JSON.stringify(ea.cooldowns) !== JSON.stringify(eb.cooldowns)) {
    if (diffs < 10) console.log(`  slot ${i} cooldowns: ${JSON.stringify(ea.cooldowns)} vs ${JSON.stringify(eb.cooldowns)}`);
    diffs++;
  }
}
console.log('pre-step field differences:', diffs);
console.log('  capacity original', A.capacity, 'restored', B.capacity);
console.log('  players equal:', JSON.stringify(state.players) === JSON.stringify(restored.state.players));

// Now step both with FRESH drivers (as the test does) and compare.
const da = new AiDriver(reg, services);
const db = new AiDriver(reg, restored.services);
const ca = da.hook(state, services);
const cb = db.hook(restored.state, restored.services);
console.log('AI commands identical:', JSON.stringify(ca) === JSON.stringify(cb), 'counts', ca.length, cb.length);
if (JSON.stringify(ca) !== JSON.stringify(cb)) {
  console.log('  first differing command:');
  for (let i = 0; i < Math.max(ca.length, cb.length); i++) {
    if (JSON.stringify(ca[i]) !== JSON.stringify(cb[i])) {
      console.log('   orig:', JSON.stringify(ca[i]));
      console.log('   rest:', JSON.stringify(cb[i]));
      break;
    }
  }
}

stepSimulation(state, services, [], da.hook);
stepSimulation(restored.state, restored.services, [], db.hook);
console.log('hash after 1 step: original', hashState(state), 'restored', hashState(restored.state));
