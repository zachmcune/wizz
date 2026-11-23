// NAN GUARD — does the simulation ever contain a non-finite number?
//
// `audit/mirror-first-diverge.ts` printed `vel(NaN,NaN)` for every harvesting worker, which is a real sim defect: a
// harvesting unit keeps `orders[0] = { type: 'harvest' }`, and `movementSystem` does not exclude that order, so it falls
// into the generic move handler where `order.x` is undefined and `undefined + offset` is NaN.
//
// NaN velocity is invisible in gameplay because nothing reads `vel` for harvesters — but it defeats any consumer that
// does (the renderer's motion streak, a future replay delta, a debug overlay) and it makes a state hash built from
// floats unreliable. This harness scans every numeric column on every tick of a real match and reports the first tick
// any of them is non-finite, so the fix is proven rather than assumed.
//
// Usage: npx vite-node audit/nan-guard.ts [seed]
import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';

const seed = Number(process.argv.slice(2).find((a) => !a.startsWith('--')) ?? '1000');
const reg = loadRegistry();
const { state, services } = initMatch(reg, {
  mapId: 'duel_glade',
  seed,
  oneSuperweaponPerPlayer: false,
  players: [
    { id: 'p1', controller: 'ai', aiDifficulty: 'hard', team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: 0 },
    { id: 'p2', controller: 'ai', aiDifficulty: 'normal', team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: 1 },
  ],
} as never);
const drv = new AiDriver(reg, services);
const st = state.entities;

const COLUMNS = ['posX', 'posY', 'velX', 'velY', 'facing', 'hp', 'maxHp', 'radius', 'amount', 'amountMax'] as const;

let bad = 0;
const firstBad = new Map<string, string>();

function scan(tick: number): void {
  for (const col of COLUMNS) {
    const arr = st[col];
    for (let i = 0; i < st.count; i++) {
      if (st.dead[i]) continue;
      const v = arr[i]!;
      if (!Number.isFinite(v)) {
        bad++;
        const key = `${col}:${st.extras[i]!.defId}`;
        if (!firstBad.has(key)) {
          firstBad.set(key, `tick ${tick} slot ${i} id ${st.id[i]} ${st.extras[i]!.defId} ${col}=${v}`);
        }
      }
    }
  }
  for (const p of state.players) {
    if (!Number.isFinite(p.mana)) {
      bad++;
      if (!firstBad.has(`mana:${p.id}`)) firstBad.set(`mana:${p.id}`, `tick ${tick} ${p.id} mana=${p.mana}`);
    }
  }
}

const MAX = 34 * 60 * 20;
for (let t = 0; t < MAX && !state.ended; t++) {
  scan(state.tick);
  stepSimulation(state, services, [], drv.hook);
}
scan(state.tick);

console.log(`NAN GUARD seed ${seed}: ${state.ended ? 'ended' : 'unfinished'} at ${(state.tick / 1200).toFixed(1)} min`);
console.log(`  non-finite values seen: ${bad}`);
if (bad > 0) {
  for (const [k, v] of firstBad) console.log(`  ${k}: ${v}`);
  process.exitCode = 1;
} else {
  console.log('  all numeric columns finite on every tick');
}
