// INCOME AND NODE SATURATION.
//
// The worker line is wiped at minute 7-8 and cannot be rebuilt at 150-190 mana. Before changing any data, measure what the economy
// actually produces: income rate per worker, how many workers a node supports, and how much of the map's mana is reachable.
import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { KIND_RESOURCE_NODE, KIND_UNIT } from '../src/sim/entity-store';

const reg = loadRegistry();
const { state, services } = initMatch(reg, {
  mapId: 'duel_glade', seed: 1000, oneSuperweaponPerPlayer: false,
  players: [
    { id: 'p1', controller: 'ai', aiDifficulty: 'normal', team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: 0 },
    { id: 'p2', controller: 'ai', aiDifficulty: 'normal', team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: 1 },
  ],
} as never);
const drv = new AiDriver(reg, services);

console.log(`siphonPerSecond=${reg.balance.siphonPerSecond} carryMax=${reg.unit('wisp').carry} nodeCap=${reg.balance.manaNodeCapacity}`);

let prevMana = [900, 900];
let spent = [0, 0];
let earned = [0, 0];
for (let t = 0; t < 10 * 60 * 20 && !state.ended; t++) {
  stepSimulation(state, services, [], drv.hook);
  for (let i = 0; i < 2; i++) {
    const m = state.players[i]!.mana;
    if (m < prevMana[i]!) spent[i] += prevMana[i]! - m;
    else earned[i] += m - prevMana[i]!;
    prevMana[i] = m;
  }
  if (state.tick % 2400 === 0) {
    const m = state.tick / 1200;
    const w = [0, 0];
    for (let s = 0; s < state.entities.count; s++) {
      if (state.entities.dead[s] || state.entities.kind[s] !== KIND_UNIT) continue;
      if (!reg.units.get(state.entities.extras[s]!.defId)?.isHarvester) continue;
      const o = state.entities.ownerId(state.entities.ownerIndex[s]!);
      if (o === 'p1') w[0]!++;
      else if (o === 'p2') w[1]!++;
    }
    let nodes = 0;
    for (let s = 0; s < state.entities.count; s++) {
      if (!state.entities.dead[s] && state.entities.kind[s] === KIND_RESOURCE_NODE) nodes++;
    }
    console.log(
      `${m}m workers p1=${w[0]} p2=${w[1]} | cumulative earned p1=${Math.round(earned[0]!)} p2=${Math.round(earned[1]!)} ` +
        `| spent p1=${Math.round(spent[0]!)} p2=${Math.round(spent[1]!)} | live nodes=${nodes}`,
    );
  }
}
