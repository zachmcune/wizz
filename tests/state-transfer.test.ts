import { describe, it, expect } from 'vitest';
import { getRegistry } from './helpers';
import { packState, applyTransferState, unpackState } from '../src/sim/state-transfer';
import { initMatch } from '../src/sim/factory';
import { rebuildBuildingNav } from '../src/sim/building-nav';
import { hashState } from '../src/sim/hash';

const reg = getRegistry();

describe('state transfer', () => {
  it('pack/unpack round-trips without losing hash', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    for (let i = 0; i < 50; i++) {
      // noop — just use initial state
    }
    void services;
    const packed = packState(state);
    const restored = unpackState(packed);
    expect(hashState(restored)).toBe(hashState(state));
  });

  it('applyTransferState updates mirror in place', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const mirror = initMatch(reg, reg.match('skirmish_1v1')).state;
    const packed = packState(state);
    packed.tick = 99;
    applyTransferState(mirror, packed);
    rebuildBuildingNav(mirror, services, reg);
    expect(mirror.tick).toBe(99);
  });
});
