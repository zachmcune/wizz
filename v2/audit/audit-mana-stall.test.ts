// Phase-0: why does AI mana flatline?
import { it, describe } from 'vitest';
import { getRegistry } from './helpers';
import { initMatch } from '../src/sim/factory';
import { createSimulation } from '../src/app/create-simulation';
import { ownedBy } from '../src/sim/queries';
import { getHarvester } from '../src/sim/capabilities';
import type { MatchConfig } from '../src/sim/types';

const reg = getRegistry();

const cfg: MatchConfig = {
  mapId: 'duel_glade',
  seed: 7,
  players: [
    { id: 'player0', controller: 'ai', team: 0, color: '#4f9dff', startIndex: 0, aiDifficulty: 'hard' },
    { id: 'player1', controller: 'ai', team: 1, color: '#ff5d5d', startIndex: 3, aiDifficulty: 'hard' },
  ],
};

describe('v1 AI mana stall', () => {
  it('reports harvester state at the stall', () => {
    const { state, services } = initMatch(reg, cfg);
    const sim = createSimulation(state, services, { aiEnabled: true });
    for (let i = 0; i < 20 * 60 * 5; i++) sim.step(); // 5 sim-minutes

    const wisps: unknown[] = [];
    for (const e of ownedBy(state, 'player0')) {
      if (e.kind !== 'unit') continue;
      const h = getHarvester(e);
      wisps.push({
        id: e.id,
        defId: e.defId,
        state: e.state,
        order: e.orders[0]?.type ?? null,
        nodeId: e.orders[0] && 'nodeId' in e.orders[0] ? e.orders[0].nodeId : null,
        carry: h?.carry,
        pos: { x: Math.round(e.pos.x), y: Math.round(e.pos.y) },
      });
    }

    const nodes: unknown[] = [];
    for (const e of state.entities.values()) {
      if (e.kind !== 'resource_node') continue;
      nodes.push({ id: e.id, amount: Math.round(e.amount), x: Math.round(e.pos.x), y: Math.round(e.pos.y) });
    }

    const spires: unknown[] = [];
    for (const e of ownedBy(state, 'player0')) {
      if (e.kind !== 'building') continue;
      spires.push({ defId: e.defId, x: Math.round(e.pos.x), y: Math.round(e.pos.y), built: e.buildProgress === undefined });
    }

    // eslint-disable-next-line no-console
    console.log('STALL ' + JSON.stringify({ mana: state.players[0]!.mana, wisps, nodes, spires, tick: state.tick }, null, 1));
  }, 300_000);
});
