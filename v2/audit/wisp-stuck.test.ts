// Is the wisp STUCK? Trace its position/velocity over the harvest cycle.
import { describe, it } from 'vitest';
import { getRegistry } from './helpers';
import { initMatch, spawnEntity } from '../src/sim/factory';
import { createSimulation } from '../src/app/create-simulation';
import { ownedBy } from '../src/sim/queries';
import { getHarvester } from '../src/sim/capabilities';
import type { MatchConfig } from '../src/sim/types';

const reg = getRegistry();

describe('wisp stuck forensics', () => {
  it('traces position, state, carry, and reachability', () => {
    const cfg: MatchConfig = {
      mapId: 'duel_glade',
      seed: 1,
      players: [
        { id: 'p0', controller: 'human', team: 0, color: '#4f9dff', startIndex: 0 },
        { id: 'p1', controller: 'ai', team: 1, color: '#ff5d5d', startIndex: 3, aiDifficulty: 'easy' },
      ],
    };
    const { state, services } = initMatch(reg, cfg);
    const sim = createSimulation(state, services, { aiEnabled: false });
    const p = state.players[0]!;
    p.mana = 0;

    const sanctum = ownedBy(state, 'p0').find((e) => e.kind === 'building')!;
    const spire = spawnEntity(state, services, null, 'attunement_spire', 'p0', sanctum.pos.x + 128, sanctum.pos.y + 64);
    if (spire.kind === 'building') spire.buildProgress = undefined;

    const node = [...state.entities.values()]
      .filter((e) => e.kind === 'resource_node' && e.amount > 0)
      .sort((a, b) => Math.hypot(a.pos.x - spire.pos.x, a.pos.y - spire.pos.y) - Math.hypot(b.pos.x - spire.pos.x, b.pos.y - spire.pos.y))[0]!;

    const wisps = ownedBy(state, 'p0').filter((e) => e.kind === 'unit' && e.defId === 'wisp');
    if (wisps[1]) sim.enqueueNow([{ type: 'move', playerId: 'p0', entityIds: [wisps[1].id], x: 100, y: 100 }]);
    const w = wisps[0]!;
    sim.enqueueNow([{ type: 'harvest', playerId: 'p0', entityIds: [w.id], nodeId: node.id }]);

    const trace: unknown[] = [];
    for (let i = 0; i < 20 * 60; i++) {
      sim.step();
      if (state.tick % 20 === 0) {
        trace.push({
          t: +(state.tick / 20).toFixed(0),
          st: (w as { state: string }).state,
          carry: +((getHarvester(w)?.carry ?? 0)).toFixed(2),
          x: +w.pos.x.toFixed(1),
          y: +w.pos.y.toFixed(1),
          dNode: +Math.hypot(w.pos.x - node.pos.x, w.pos.y - node.pos.y).toFixed(1),
          dSpire: +Math.hypot(w.pos.x - spire.pos.x, w.pos.y - spire.pos.y).toFixed(1),
          ord: w.orders.map((o) => o.type).join('+'),
          vel: +Math.hypot(w.vel.x, w.vel.y).toFixed(1),
        });
      }
    }
    // eslint-disable-next-line no-console
    console.log('WISP ' + JSON.stringify({
      nodePos: { x: node.pos.x, y: node.pos.y, r: node.radius },
      spirePos: { x: spire.pos.x, y: spire.pos.y, r: spire.radius },
      wispRadius: w.radius,
      reachNeeded: +(node.radius + w.radius + 4).toFixed(1),
      trace: trace.slice(0, 62),
    }, null, 1));
  }, 300_000);
});
