// TRACE A SINGLE UNIT THROUGH THE TICKS SURROUNDING A MIRROR DIVERGENCE.
//
// `audit/mirror-first-diverge.ts` says WHEN a mirror stops being symmetric. This says WHY: it follows one
// entity on each side, tick by tick, printing position, velocity, state and the pathing decision, so a
// "positions differ by 3.6 units at tick 34" becomes a named mechanism instead of a guess.
//
// Usage: npx vite-node audit/mirror-trace-unit.ts [seed] [defId]
import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { TILE } from '../src/core/constants';

const argv = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const seed = Number(argv[0] ?? '1000');
const wantDef = argv[1] ?? 'wisp';

const reg = loadRegistry();
const map = reg.maps.get('duel_glade')!;
const W = map.tileW * TILE;
const { state, services } = initMatch(reg, {
  mapId: 'duel_glade',
  seed,
  oneSuperweaponPerPlayer: false,
  players: [
    { id: 'p1', controller: 'ai', aiDifficulty: 'normal', team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: 0 },
    { id: 'p2', controller: 'ai', aiDifficulty: 'normal', team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: 1 },
  ],
} as never);
const drv = new AiDriver(reg, services);
const st = state.entities;

/** The slots of the first `n` entities of a def for one owner. */
function slotsOf(owner: string, defId: string, n: number): number[] {
  const out: number[] = [];
  for (let s = 0; s < st.count; s++) {
    if (st.dead[s]) continue;
    if (st.ownerId(st.ownerIndex[s]!) !== owner) continue;
    if (st.extras[s]!.defId !== defId) continue;
    out.push(s);
    if (out.length >= n) break;
  }
  return out;
}

let a: number[] = [];
let b: number[] = [];
for (let t = 0; t < 80; t++) {
  if (t === 0) {
    a = slotsOf('p1', wantDef, 2);
    b = slotsOf('p2', wantDef, 2);
    console.log(`tracking ${wantDef}: p1 slots ${a.join(',')} | p2 slots ${b.join(',')}`);
  }
  const line: string[] = [];
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const sa = a[i]!;
    const sb = b[i]!;
    const ax = st.posX[sa]!;
    const ay = st.posY[sa]!;
    const bx = st.posX[sb]!;
    const by = st.posY[sb]!;
    const mx = W - bx;
    const d = Math.hypot(ax - mx, ay - by);
    line.push(
      `#${i} p1(${ax.toFixed(2)},${ay.toFixed(2)}) p2m(${mx.toFixed(2)},${by.toFixed(2)}) d=${d.toFixed(3)}`,
    );
  }
  console.log(`t=${String(t).padStart(2)} ${line.join('  ')}`);
  stepSimulation(state, services, [], drv.hook);
}
