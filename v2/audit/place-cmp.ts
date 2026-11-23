// Compare the FIRST placement each side makes, and the candidate scores that produced it.
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
const firstBuild: Record<string, string> = {};
const st = state.entities;
const seen = new Set<number>();
// Watch spawnBuildingAt results by diffing the building set each tick.
for (let t = 0; t < 40 * 20; t++) {
  stepSimulation(state, services, [], drv.hook);
  for (let s = 0; s < st.count; s++) {
    if (st.dead[s] || st.kind[s] !== 1 || seen.has(s)) continue;
    seen.add(s);
    const owner = st.ownerId(st.ownerIndex[s]!);
    const defId = st.extras[s]!.defId;
    if (defId === 'sanctum') continue;
    const key = owner;
    if (firstBuild[key]) continue;
    const mx = W - st.posX[s]!;
    firstBuild[key] = `${defId} at (${st.posX[s]!.toFixed(0)},${st.posY[s]!.toFixed(0)})`;
    console.log(`t=${(t/20).toFixed(1)}s ${owner} first build: ${firstBuild[key]}  [mirrored x = ${mx.toFixed(0)}]`);
  }
  if (firstBuild['p1'] && firstBuild['p2']) break;
}
// Sanctum positions
for (const p of ['p1','p2']) {
  for (let s = 0; s < st.count; s++) if (!st.dead[s] && st.kind[s]===1 && st.extras[s]!.defId==='sanctum' && st.ownerId(st.ownerIndex[s]!)===p)
    console.log(`${p} sanctum (${st.posX[s]},${st.posY[s]})  mirrored x=${W-st.posX[s]!}`);
}
