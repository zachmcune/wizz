// Why does a lone AI at start 2 report "nowhere legal to rebuild attunement_spire"?
import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { TILE } from '../src/core/constants';

const reg = loadRegistry();
const { state, services } = initMatch(reg, {
  mapId: 'duel_glade', seed: 2005, oneSuperweaponPerPlayer: false,
  players: [{ id: 'solo', controller: 'ai', aiDifficulty: 'normal', team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: 2 }],
} as never);
const drv = new AiDriver(reg, services);
for (let t = 0; t < 60 * 20; t++) stepSimulation(state, services, [], drv.hook);

const st = state.entities;
const blds = Array.from({ length: st.count }, (_, s) => s).filter((s) => !st.dead[s] && st.kind[s] === 0);
console.log('buildings:');
for (const s of blds) console.log(`  ${st.extras[s]!.defId} at (${Math.round(st.posX[s]!)},${Math.round(st.posY[s]!)}) tile(${Math.floor(st.posX[s]! / TILE)},${Math.floor(st.posY[s]! / TILE)})`);
const spire = reg.buildings.get('attunement_spire')!;
console.log(`attunement_spire footprint ${spire.footprint}`);
// Scan the whole map for placement legality using the same predicates as the sim.
const def = spire;
const half = (def.footprint * TILE) / 2;
let inZone = 0, placeable = 0, both = 0;
for (let ty = 0; ty < 88; ty++) for (let tx = 0; tx < 128; tx++) {
  if (!services.nav.canPlace(tx, ty, def.footprint)) continue;
  placeable++;
}
console.log(`tiles where canPlace(${def.footprint}) true anywhere on the map: ${placeable}`);
void half; void inZone; void both;
