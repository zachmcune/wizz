// WHY DO THE TWO WISPS TURN DIFFERENTLY AT THE SAME TICK?
//
// `audit/mirror-trace-unit.ts` shows both sides' workers moving in lockstep for 33 ticks and then making
// DIFFERENT turns on tick 34. This harness reproduces the decision that tick for real: it prints, for each of
// the four starting workers, the goal it is steering at, the steer vector, the slide result and whether the
// "nearest passable" nudge fired.
//
// The nudge is the prime suspect: `NavGrid.nearestPassableFor` scans candidates in a fixed raster order
// (`oy` from -range upward, then `ox`) and keeps the first on a distance tie, which prefers UP and LEFT. A
// reflected situation does not have a reflected preference, so the same nudge resolves differently at the two
// bases. This prints the evidence rather than asserting it.
//
// Usage: npx vite-node audit/mirror-move-decision.ts [seed]
import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { TILE } from '../src/core/constants';
import { makePathContext, steerToGoal } from '../src/sim/pathing';

const seed = Number(process.argv.slice(2).find((a) => !a.startsWith('--')) ?? '1000');
const reg = loadRegistry();
const map = reg.maps.get('duel_glade')!;
const W = map.tileW * TILE;
const { state, services } = initMatch(reg, {
  mapId: 'duel_glade',
  seed,
  oneSuperweaponPerPlayer: false,
  players: [
    { id: 'p1', controller: 'ai', aiDifficulty: 'normal', team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: 0 },
    { id: 'p2', controller: 'ai', aiDifficulty: 'normal', team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: 1 },
  ],
} as never);
const drv = new AiDriver(reg, services);
const st = state.entities;

const TARGET_TICK = Number(process.argv.slice(2)[1] ?? '34');

for (let t = 0; t < TARGET_TICK + 1; t++) {
  if (t === TARGET_TICK) {
    console.log(`=== DECISIONS AT TICK ${t} ===`);
    for (let s = 0; s < st.count; s++) {
      if (st.dead[s] || st.kind[s] !== 0) continue;
      const def = st.extras[s]!.defId;
      if (def !== 'wisp') continue;
      const owner = st.ownerId(st.ownerIndex[s]!);
      const order = st.extras[s]!.orders[0] as { type?: string; nodeId?: number } | undefined;
      const nodeSlot = order?.nodeId !== undefined ? st.slotOf(order.nodeId) : -1;
      const goal = nodeSlot >= 0 ? { x: st.posX[nodeSlot]!, y: st.posY[nodeSlot]! } : null;
      const pathCtx = makePathContext(services.nav, services.flow, state.relations, owner, false);
      const steer = goal ? steerToGoal(pathCtx, { x: st.posX[s]!, y: st.posY[s]! }, goal) : { x: 0, y: 0 };
      const mx = W - st.posX[s]!;
      console.log(
        `${owner} slot${s} id${st.id[s]} pos(${st.posX[s]!.toFixed(2)},${st.posY[s]!.toFixed(3)}) ` +
          `mirrorX=${mx.toFixed(2)} st${st.state[s]} order=${order?.type ?? '-'} ` +
          `goal=${goal ? `(${goal.x.toFixed(0)},${goal.y.toFixed(0)})` : '-'} ` +
          `steer=(${steer.x.toFixed(4)},${steer.y.toFixed(4)}) ` +
          `blockedSelf=${services.nav.isBlockedDiscFor(st.posX[s]!, st.posY[s]!, st.radius[s]!, owner, state.relations, st.posX[s]!, st.posY[s]!)}`,
      );
    }
  }
  stepSimulation(state, services, [], drv.hook);
}
