// WHERE DOES THE MIRROR BREAK, EXACTLY?
//
// `symmetry-break.ts` reports at 1-second granularity; this walks tick by tick and prints the first tick at which
// the two sides stop being mirror images of each other, with the entity that differs and its full motion state.
//
// Usage: npx vite-node audit/mirror-first-diverge.ts [seed]
import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { TILE } from '../src/core/constants';

const seed = Number(process.argv.slice(2).find((a) => !a.startsWith('--')) ?? '1000');
const reg = loadRegistry();
const W = reg.maps.get('duel_glade')!.tileW * TILE;
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

/** Multiset of (defId, mirrored x, y, hp, state, facing) for one player. */
function fingerprint(ownerId: string, mirror: boolean): string[] {
  const out: string[] = [];
  for (let s = 0; s < st.count; s++) {
    if (st.dead[s]) continue;
    if (st.ownerId(st.ownerIndex[s]!) !== ownerId) continue;
    if (st.kind[s] === 3) continue;
    const x = mirror ? W - st.posX[s]! : st.posX[s]!;
    out.push(
      `${st.extras[s]!.defId}@${x.toFixed(1)},${st.posY[s]!.toFixed(1)}` +
        ` hp${st.hp[s]!.toFixed(0)} st${st.state[s]} f${st.facing[s]!.toFixed(2)}`,
    );
  }
  return out.sort();
}

/** Per-owner, per-def entity lists with orders, for the diverging tick. */
function dump(label: string): void {
  for (const id of ['p1', 'p2']) {
    console.log(`  ${label} ${id}:`);
    for (let s = 0; s < st.count; s++) {
      if (st.dead[s]) continue;
      if (st.ownerId(st.ownerIndex[s]!) !== id) continue;
      if (st.kind[s] === 3) continue;
      const ex = st.extras[s]!;
      const orders = (ex.orders as { type?: string; x?: number; y?: number; targetId?: number }[])
        .map((o) => `${o.type}(${o.x !== undefined ? Math.round(o.x) : ''}${o.targetId !== undefined ? `#${o.targetId}` : ''})`)
        .join(',');
      console.log(
        `    slot${s} id${st.id[s]} ${ex.defId} pos(${st.posX[s]!.toFixed(1)},${st.posY[s]!.toFixed(1)})` +
          ` vel(${st.velX[s]!.toFixed(2)},${st.velY[s]!.toFixed(2)}) st${st.state[s]} orders[${orders}]`,
      );
    }
  }
}

for (let t = 0; t < 20 * 60; t++) {
  const a = fingerprint('p1', false);
  const b = fingerprint('p2', true);
  if (a.join('|') !== b.join('|')) {
    console.log(`FIRST DIVERGENCE at tick ${t} (t=${(t / 20).toFixed(2)}s)`);
    console.log(`  p1      : ${a.join('\n            ')}`);
    console.log(`  p2 mirror: ${b.join('\n            ')}`);
    dump('raw');
    break;
  }
  if (t === 0) {
    console.log('tick 0 fingerprints match');
    dump('tick0');
  }
  stepSimulation(state, services, [], drv.hook);
}
