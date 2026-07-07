import { describe, it, expect } from 'vitest';
import { TILE } from '../src/core/constants';
import { getRegistry } from './helpers';
import { initMatch } from '../src/sim/factory';
import { Simulation } from '../src/sim/simulation';
import { footprintOverlapsNode } from '../src/sim/resource-nodes';

const reg = getRegistry();

describe('building on mana pools', () => {
  it('rejects placement on a mana node tile', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const sim = new Simulation(state, services);
    sim.aiEnabled = false;
    const human = state.players.find((p) => p.controller === 'human')!;
    human.mana = 9999;
    human.unlockedTech.push('attunement_spire');

    const node = [...state.entities.values()].find((e) => e.kind === 'resource_node')!;
    const tx = Math.floor(node.pos.x / TILE);
    const ty = Math.floor(node.pos.y / TILE);
    expect(footprintOverlapsNode(state, tx, ty, 2)).toBe(true);

    const x = (tx + 0.5) * TILE;
    const y = (ty + 0.5) * TILE;
    sim.enqueueNow([{ type: 'build', playerId: human.id, defId: 'attunement_spire', x, y }]);
    sim.step();

    expect(state.entities.has(node.id)).toBe(true);
    expect([...state.entities.values()].some((e) => e.defId === 'attunement_spire' && e.owner === human.id)).toBe(false);
  });
});
