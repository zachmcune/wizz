import { describe, it } from 'vitest';
import { getRegistry } from './helpers';
import { initMatch, spawnEntity } from '../src/sim/factory';
import { createSimulation } from '../src/app/create-simulation';
import { ownedBy } from '../src/sim/queries';
import type { MatchConfig } from '../src/sim/types';

const reg = getRegistry();

describe('econ rate', () => {
  it('measures actual mana/sec from one wisp', () => {
    const cfg: MatchConfig = {
      mapId: 'duel_glade', seed: 1,
      players: [
        { id: 'p0', controller: 'human', team: 0, color: '#4f9dff', startIndex: 0 },
        { id: 'p1', controller: 'ai', team: 1, color: '#ff5d5d', startIndex: 3, aiDifficulty: 'easy' },
      ],
    };
    const { state, services } = initMatch(reg, cfg);
    const sim = createSimulation(state, services, { aiEnabled: false });
    const p = state.players[0]!;
    p.mana = 0;
    // Give the player a spire instantly so deposits land.
    const sanctum = ownedBy(state, 'p0').find(e => e.kind === 'building')!;
    const spire = spawnEntity(state, services, null, 'attunement_spire', 'p0', sanctum.pos.x + 128, sanctum.pos.y + 128);
    (spire as any).buildProgress = undefined;

    const node = [...state.entities.values()].find(e => e.kind === 'resource_node' && e.amount > 0)!;
    const wisps = ownedBy(state, 'p0').filter(e => e.kind === 'unit' && e.defId === 'wisp');
    for (const w of wisps) sim.enqueueNow([{ type: 'harvest', playerId: 'p0', entityIds: [w.id], nodeId: node.id }]);
    // only let one wisp work
    wisps[1] && sim.enqueueNow([{ type: 'move', playerId: 'p0', entityIds: [wisps[1].id], x: 200, y: 200 }]);

    const t0 = state.tick;
    for (let i = 0; i < 20 * 60; i++) sim.step();
    const mins = (state.tick - t0) / 20 / 60;
    console.log('ECON', JSON.stringify({
      totalManaAfter60s: Math.floor(p.mana),
      manaPerSecOneWisp: +(p.mana / (mins * 60)).toFixed(2),
      wispCarry: reg.units.get('wisp')!.carry,
      siphonPerSecondConfigured: reg.balance.siphonPerSecond,
      spireToNodeDist: Math.round(Math.hypot(node.pos.x - spire.pos.x, node.pos.y - spire.pos.y)),
    }));
  }, 300000);
});
