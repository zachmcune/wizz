// IS THE PRODUCER'S QUEUE FULL? — per-producer queue depth and what is in it, every 60 s.
//
// The production gate can be open and still produce nothing if every producer is holding a full queue. `MAX_PRODUCTION_QUEUE`
// is 5 and `handleProduce` silently returns when the queue is full, so a side that queues five wisps sat idle for the
// build time of all five with a large bank. This prints the depth per producer so that is measured rather than assumed.
//
//   npx vite-node audit/queue-probe.ts [seed] [minutes] [player]

import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { productionReadout } from '../src/app/rules';
import { PerceivedWorld } from '../src/ai/perception';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const seed = Number(args[0] ?? 1021);
const minutes = Number(args[1] ?? 14);
const who = args[2] ?? 'p1';

const reg = loadRegistry();
const COLORS = ['#4f9dff', '#ff5d5d', '#5cff8a', '#ffd166'];
const { state, services } = initMatch(reg, {
  mapId: 'duel_glade',
  seed,
  oneSuperweaponPerPlayer: false,
  players: [0, 1, 2, 3].map((i) => ({
    id: `p${i + 1}`,
    controller: 'ai',
    aiDifficulty: 'normal',
    team: i,
    color: COLORS[i]!,
    factionId: 'arcane',
    startIndex: i,
  })),
} as never);

const drv = new AiDriver(reg, services);
const world = new PerceivedWorld(services);
const cap = minutes * 60 * 20;

for (let t = 0; t < cap && !state.ended; t++) {
  if (t > 0 && t % (60 * 20) === 0) {
    const per = world.build(state, who);
    const producers = per.myBuildings.filter(
      (b) => b.buildProgress === undefined && !!reg.buildings.get(b.defId)?.producesUnits?.length,
    );
    const desc = producers.map((b) => {
      const r = productionReadout(state, reg, b.id);
      return `${b.defId}[active=${r.active?.defId ?? '-'} frac=${(r.fraction ?? 0).toFixed(2)} q=${r.queue.map((q) => q.defId).join(',') || '-'}]`;
    });
    console.log(`t=${String(Math.floor(t / 20)).padStart(3)}s mana=${String(Math.round(per.mana)).padStart(4)} ${desc.join(' ')}`);
  }
  const cmds = drv.hook(state, services);
  stepSimulation(state, services, cmds);
}
