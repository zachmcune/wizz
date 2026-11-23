// Is the map's mana budget big enough for a match to END rather than stalemate?
import { loadRegistry } from '../src/data/loader';
const reg = loadRegistry();
const map = reg.maps.get('duel_glade')!;
const cap = reg.balance.manaNodeCapacity;
const authored = map.manaNodes.reduce((a, n) => a + n.amount, 0);
const capped = map.manaNodes.reduce((a, n) => a + Math.min(n.amount, cap), 0);
console.log(`nodes ${map.manaNodes.length}  authored ${authored}  capped at ${cap} -> ${capped}`);
const perPlayer = capped / 2;
console.log(`per player in a 1v1: ${perPlayer}`);
// What does a full base + army cost?
const units = [...(reg.units as unknown as Iterable<[string, any]>)];
const blds = [...(reg.buildings as unknown as Iterable<[string, any]>)];
const cheapUnit = units.filter(([, u]) => u.weapon && !u.isHarvester).sort((a, b) => a[1].cost - b[1].cost)[0]!;
console.log(`cheapest combat unit: ${cheapUnit[0]} ${cheapUnit[1].cost}`);
const totalBld = blds.reduce((a, [, b]) => a + b.cost, 0);
console.log(`sum of ALL building costs: ${totalBld}`);
// Workers: 200 each
console.log(`\nA 20-min game at 10 workers, 2 refineries:`);
console.log(`  10 workers = 2000, buildings ~ 8000, leaving ${perPlayer - 10000} for army`);
console.log(`  at ${cheapUnit[1].cost}/unit that is ${Math.floor((perPlayer - 10000) / cheapUnit[1].cost)} units total across the whole match`);
