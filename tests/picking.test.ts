import { describe, it, expect } from 'vitest';
import { getRegistry } from './helpers';
import { initMatch } from '../src/sim/factory';
import { pickEntity, pickResourceNode } from '../src/sim/picking';

const reg = getRegistry();

describe('world picking', () => {
  it('finds a resource node at its position', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const node = [...state.entities.values()].find((e) => e.kind === 'resource_node' && (e.amount ?? 0) > 0)!;
    const picked = pickResourceNode(state, 'player0', node.pos.x, node.pos.y, services.nav);
    expect(picked?.id).toBe(node.id);
  });

  it('prefers units over buildings at overlapping positions', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const unit = [...state.entities.values()].find((e) => e.owner === 'player0' && e.kind === 'unit')!;
    const picked = pickEntity(state, 'player0', unit.pos.x, unit.pos.y, services.nav);
    expect(picked?.kind).toBe('unit');
  });
});
