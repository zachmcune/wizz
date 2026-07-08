import { describe, it, expect } from 'vitest';
import { getRegistry } from './helpers';
import { initMatch } from '../src/sim/factory';
import { Simulation } from '../src/sim/simulation';
import { hashState } from '../src/sim/hash';
import { serializeState, deserializeState, defaultSaveMeta } from '../src/storage/save';

const reg = getRegistry();

describe('save/load', () => {
  it('serialize -> deserialize yields an identical state hash', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const sim = new Simulation(state, services);
    for (let i = 0; i < 500; i++) sim.step();
    const before = hashState(state);

    const saved = serializeState(state, defaultSaveMeta('player0'));
    const restored = deserializeState(JSON.parse(JSON.stringify(saved)), reg);
    expect(hashState(restored.state)).toBe(before);
  });

  it('restored sim continues deterministically identical to the original', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const sim = new Simulation(state, services);
    for (let i = 0; i < 300; i++) sim.step();

    const saved = JSON.parse(JSON.stringify(serializeState(state, defaultSaveMeta('player0'))));

    // continue the original
    for (let i = 0; i < 200; i++) sim.step();
    const originalContinuation = hashState(state);

    // restore a snapshot and run the same number of ticks
    const restored = deserializeState(saved, reg);
    const rsim = new Simulation(restored.state, restored.services);
    for (let i = 0; i < 200; i++) rsim.step();
    expect(hashState(restored.state)).toBe(originalContinuation);
  });

  it('rejects an unsupported save version', () => {
    const { state } = initMatch(reg, reg.match('skirmish_1v1'));
    const saved = serializeState(state, defaultSaveMeta('player0'));
    saved.version = 999;
    expect(() => deserializeState(saved, reg)).toThrow();
  });

  it('restores projection mode and paused metadata', () => {
    const { state } = initMatch(reg, reg.match('skirmish_1v1'));
    const meta = { ...defaultSaveMeta('player0', 'oblique'), paused: true };
    const restored = deserializeState(serializeState(state, meta), reg);
    expect(restored.meta.projectionMode).toBe('oblique');
    expect(restored.meta.paused).toBe(true);
    expect(restored.meta.localPlayerId).toBe('player0');
  });
});
