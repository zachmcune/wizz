import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { countBases, bestExpansionSite } from '../src/ai/economy';

const reg = loadRegistry();
const { state, services } = initMatch(reg, {
  mapId: 'duel_glade', seed: 1000, oneSuperweaponPerPlayer: false,
  players: [
    { id: 'p1', controller: 'ai', aiDifficulty: 'normal', team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: 0 },
    { id: 'p2', controller: 'ai', aiDifficulty: 'easy', team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: 1 },
  ],
} as never);
const drv = new AiDriver(reg, services);
for (let t = 0; t < 4 * 60 * 20; t++) stepSimulation(state, services, [], drv.hook);
const brain = drv.brain('p1')!;
const b = brain as unknown as { profile: { targetBases: number; expandAfterSeconds: number } };
const per = brain.perception(state);
console.log('profile targetBases=', b.profile.targetBases, 'expandAfter=', b.profile.expandAfterSeconds);
console.log('bases=', countBases(per, reg));
console.log('site=', JSON.stringify(bestExpansionSite(per, reg, services)));
console.log('nodes in sight with mana:', per.nodes.filter((n) => n.remaining > 0).length);
const home = per.myBuildings[0]!;
for (const n of per.nodes.filter((x) => x.remaining > 0).slice(0, 4)) {
  const d = Math.hypot(n.x - home.x, n.y - home.y);
  const covered = per.myBuildings.some((bb) => Math.hypot(bb.x - n.x, bb.y - n.y) < 32 * 12);
  console.log(`  node ${Math.round(n.x)},${Math.round(n.y)} d=${Math.round(d)} covered=${covered} reachable=${d <= 32 * 16}`);
  for (const bb of per.myBuildings) {
    const dd = Math.hypot(bb.x - n.x, bb.y - n.y);
    if (dd < 400) console.log(`      ${bb.defId} at ${Math.round(dd)} from node`);
  }
}
