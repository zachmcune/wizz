// WHY NO REFINERY AT THE CHAIN'S END? — legal-spot probe at the expansion site.
//
// `audit/expand-trace.ts` shows the AI walking a three-link chain until the site is 128 units away (inside the 192-unit
// "close enough" threshold) and then never placing the refinery, with the bank oscillating far below 750. Two possible
// causes, and they need different fixes: (a) the bank never reaches the cost, or (b) `findBuildSpot` cannot find a legal
// tile even when it does.
//
// This probe answers (b) directly at a real chain end. It runs one match with the economy planner's build spot search
// made callable, then reports every candidate the search considers and why each is rejected.
//
//   npx vite-node audit/expand-spot-probe.ts 1000 hard normal 22

import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { bestExpansionSite, findBuildSpot } from '../src/ai/economy';
import { TILE } from '../src/core/constants';
import { BUILD_ZONE_TILES } from '../src/sim/build-zone';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const seed = Number(args[0] ?? 1000);
const minutes = Number(args[3] ?? 22);

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

for (const p of ['p1', 'p2'] as const) {
  const brain = drv.brain(p);
  if (!brain) continue;
  const per = brain.perception(state);
  const site = bestExpansionSite(per, reg, services);
  const home = per.myBuildings[0];
  console.log(`\n${p} t=${(state.tick / 1200).toFixed(1)}m mana=${Math.round(per.mana)} site=${JSON.stringify(site)}`);
  console.log(
    `  buildings: ` + per.myBuildings.map((b) => `${b.defId}@(${Math.round(b.x)},${Math.round(b.y)})`).join(' '),
  );
  if (!site || !home) continue;
  const nearOwn = per.myBuildings.reduce((best, b) => Math.min(best, Math.hypot(b.x - site.x, b.y - site.y)), Infinity);
  console.log(`  nearOwn=${Math.round(nearOwn)} (threshold ${TILE * 6}) siteTiles=${(Math.hypot(site.x - home.x, site.y - home.y) / TILE).toFixed(1)}`);
  const def = reg.buildings.get('attunement_spire');
  if (!def) continue;
  const spot = findBuildSpot(state, per, services, reg, def, { x: site.x, y: site.y });
  console.log(`  findBuildSpot(attunement_spire, toward site) -> ${JSON.stringify(spot)}`);
  if (spot) {
    console.log(`    distance from site: ${Math.round(Math.hypot(spot.x - site.x, spot.y - site.y))}`);
  }
  // Enumerate the raw legality of a grid of candidate points around the site, to see whether ANY tile is legal.
  const half = (def.footprint * TILE) / 2;
  const legal: string[] = [];
  const reasons = new Map<string, number>();
  for (let dy = -6; dy <= 6; dy++) {
    for (let dx = -6; dx <= 6; dx++) {
      const px = site.x + dx * TILE;
      const py = site.y + dy * TILE;
      const tx = Math.floor((px - half) / TILE);
      const ty = Math.floor((py - half) / TILE);
      const nav = services.nav.canPlace(tx, ty, def.footprint);
      if (!nav) {
        reasons.set('terrain/node', (reasons.get('terrain/node') ?? 0) + 1);
        continue;
      }
      const nearBase = per.myBuildings.some((b) => {
        const bd = reg.buildings.get(b.defId);
        if (!bd) return false;
        const atx = Math.floor((b.x - (bd.footprint * TILE) / 2) / TILE);
        const aty = Math.floor((b.y - (bd.footprint * TILE) / 2) / TILE);
        let inside = true;
        for (let fy = 0; fy < def.footprint && inside; fy++) {
          for (let fx = 0; fx < def.footprint && inside; fx++) {
            const cdx = tx + fx < atx ? atx - (tx + fx) : tx + fx >= atx + bd.footprint ? tx + fx - (atx + bd.footprint - 1) : 0;
            const cdy = ty + fy < aty ? aty - (ty + fy) : ty + fy >= aty + bd.footprint ? ty + fy - (aty + bd.footprint - 1) : 0;
            if (Math.max(cdx, cdy) > BUILD_ZONE_TILES) inside = false;
          }
        }
        return inside;
      });
      if (!nearBase) {
        reasons.set('outside build zone', (reasons.get('outside build zone') ?? 0) + 1);
        continue;
      }
      legal.push(`(${Math.round(px)},${Math.round(py)})`);
    }
  }
  console.log(`  raw-legal candidates around the site: ${legal.length}  ${legal.slice(0, 8).join(' ')}`);
  console.log(`  rejected: ${[...reasons.entries()].map(([k, v]) => `${k}=${v}`).join(' ')}`);
}
