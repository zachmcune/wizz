// WHAT DOES `bestExpansionSite` SEE, AND WHY DOES IT RETURN NULL?
//
// `audit/expand-spot-probe.ts` proved a legal refinery tile exists 51 units from the target node, so the remaining
// questions are about SELECTION, not placement: which nodes the perception carries, how far each is, and which
// income building (if any) is claiming it.
//
//   npx vite-node audit/expand-nodes.ts 1000 22

import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { bestExpansionSite } from '../src/ai/economy';
import { TILE } from '../src/core/constants';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const seed = Number(args[0] ?? 1000);
const minutes = Number(args[1] ?? 22);

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
const cap = minutes * 60 * 20;
for (let t = 0; t < cap && !state.ended; t++) stepSimulation(state, services, [], drv.hook);

const CLUSTER = TILE * 12;
const REACHABLE = TILE * 34;
for (const p of ['p1', 'p2'] as const) {
  const brain = drv.brain(p);
  if (!brain) continue;
  const per = brain.perception(state);
  const home = per.myBuildings[0];
  const anchors = per.myBuildings.filter((b) => {
    const d = reg.buildings.get(b.defId);
    return !!d?.isRefinery || !!d?.isConstructionYard;
  });
  console.log(`\n${p} mana=${Math.round(per.mana)} home=(${Math.round(home?.x ?? 0)},${Math.round(home?.y ?? 0)})`);
  console.log(`  income anchors: ` + anchors.map((a) => `${a.defId}@(${Math.round(a.x)},${Math.round(a.y)})`).join(' '));
  console.log(`  nodes seen: ${per.nodes.length}`);
  for (const n of per.nodes) {
    const d = home ? Math.hypot(n.x - home.x, n.y - home.y) : NaN;
    const cov = anchors.filter((a) => Math.hypot(a.x - n.x, a.y - n.y) < CLUSTER);
    const why =
      n.remaining <= 0
        ? 'EMPTY'
        : cov.length > 0
          ? `covered by ${cov.map((c) => c.defId).join(',')}`
          : d > REACHABLE
            ? `too far (${(d / TILE).toFixed(1)}t > ${(REACHABLE / TILE).toFixed(0)}t)`
            : 'ELIGIBLE';
    console.log(`   node(${Math.round(n.x)},${Math.round(n.y)}) rem=${Math.round(n.remaining)} d=${(d / TILE).toFixed(1)}t  ${why}`);
  }
  console.log(`  bestExpansionSite -> ${JSON.stringify(bestExpansionSite(per, reg, services))}`);
  console.log(
    `  all buildings: ` +
      per.myBuildings
        .map((b) => `${b.defId}@(${Math.round(b.x)},${Math.round(b.y)})${b.buildProgress !== undefined ? '*' : ''}`)
        .join(' '),
  );
}
