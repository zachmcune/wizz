// Are the build-spot CANDIDATE SETS mirrored between the two bases?
import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { PerceivedWorld } from '../src/ai/perception';
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
// Run 1 tick so the match exists, then inspect the perception of each side pre-placement.
stepSimulation(state, services, [], drv.hook);
const world = new PerceivedWorld(services);
const spire = reg.buildings.get('attunement_spire')!;
const half = (spire.footprint * TILE) / 2;
for (const id of ['p1', 'p2']) {
  const per = world.build(state, id);
  const yard = per.myBuildings.find((b) => reg.buildings.get(b.defId)?.isConstructionYard) ?? per.myBuildings[0];
  if (!yard) { console.log(`${id}: no yard`); continue; }
  const yardH = Math.floor(yard.y / TILE); // height via services
  const gh = (x: number, y: number) => services.nav.groundHeight ? 0 : 0;
  void gh; void yardH;
  // Enumerate ring-1 and ring-2 candidates that the sim says are legal.
  const legal: string[] = [];
  for (let ring = 1; ring <= 3; ring++) {
    for (let dy = -ring; dy <= ring; dy++) for (let dx = -ring; dx <= ring; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
      const x = yard.x + dx * TILE, y = yard.y + dy * TILE;
      if (x - half < TILE || y - half < TILE) continue;
      const tx = Math.floor((x - half) / TILE), ty = Math.floor((y - half) / TILE);
      if (!services.nav.canPlace(tx, ty, spire.footprint)) continue;
      legal.push(`ring${ring}:(${x},${y})->mir(${Math.round(W - x)},${y})`);
    }
  }
  console.log(`\n${id} yard (${yard.x},${yard.y}); legal spire spots at ring 1-3:`);
  console.log('  ' + legal.join('\n  '));
}
