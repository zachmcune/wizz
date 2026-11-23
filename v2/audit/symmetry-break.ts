// WHERE DOES A MIRROR STOP BEING A MIRROR?
// Reflect every entity of p1 (corner 0) through the vertical axis and compare with p2 (corner 1).
// The first tick with a mismatch names the exact mechanism that decides the match.
import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { TILE } from '../src/core/constants';

const reg = loadRegistry();
const W = reg.maps.get('duel_glade')!.tileW * TILE;
const { state, services } = initMatch(reg, {
  mapId: 'duel_glade', seed: 1000, oneSuperweaponPerPlayer: false,
  players: [
    { id: 'p1', controller: 'ai', aiDifficulty: 'normal', team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: 0 },
    { id: 'p2', controller: 'ai', aiDifficulty: 'normal', team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: 1 },
  ],
} as never);
const drv = new AiDriver(reg, services);
const st = state.entities;

function report(tag: string): boolean {
  const mine = (id: string) => Array.from({ length: st.count }, (_, s) => s)
    .filter((s) => !st.dead[s] && st.ownerId(st.ownerIndex[s]!) === id && st.kind[s] !== 3);
  const a = mine('p1'), b = mine('p2');
  const key = (s: number) => `${st.extras[s]!.defId}@${Math.round(st.posX[s]!)}`;
  // Build multisets of (defId, hp) and of mirrored x positions.
  const norm = (list: number[], mirror: boolean) => list.map((s) => {
    const x = mirror ? Math.round(W - st.posX[s]!) : Math.round(st.posX[s]!);
    return `${st.extras[s]!.defId}:${Math.round(x)}:${Math.round(st.posY[s]!)}:${Math.round(st.hp[s]!)}`;
  }).sort().join('|');
  const A = norm(a, false), B = norm(b, true);
  if (A === B) return true;
  // Find the first differing token to describe the divergence.
  const ta = A.split('|'), tb = B.split('|');
  const diffs: string[] = [];
  for (let i = 0; i < Math.max(ta.length, tb.length); i++) {
    if (ta[i] !== tb[i]) { diffs.push(`p1[${ta[i] ?? '-'}] vs p2mirror[${tb[i] ?? '-'}]`); if (diffs.length >= 3) break; }
  }
  console.log(`${tag}: DIVERGED (p1 ${a.length} entities, p2 ${b.length})\n    ${diffs.join('\n    ')}`);
  return false;
}

let brokeAt = -1;
for (let t = 0; t < 30 * 20; t++) {
  if (t === 0 || t % 20 === 0) {
    if (!report(`t=${(t / 20).toFixed(0)}s`)) { brokeAt = t; break; }
  }
  stepSimulation(state, services, [], drv.hook);
}
if (brokeAt < 0) console.log('no divergence in the first 30 s');
