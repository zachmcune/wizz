import { describe, it, expect } from 'vitest';
import { getRegistry } from './helpers';
import { packState, unpackState, applyTransferState } from '../src/sim/state-transfer';
import { hashState } from '../src/sim/hash';
import { hashAuthoritativeState, SYNC_SURFACE_VERSION } from '../src/sim/sync-surface';
import { packDelta, applyWorkerSync } from '../src/sim/sync-delta';
import { initMatch } from '../src/sim/factory';
import { Simulation } from '../src/sim/simulation';
import { validateRegistryRefs } from '../src/data/validate-registry';
import { parseClientMessage, parseServerMessage } from '../src/net/protocol-schema';

const reg = getRegistry();

describe('sync surface', () => {
  it('hashState delegates to hashAuthoritativeState', () => {
    const { state } = initMatch(reg, reg.match('skirmish_1v1'));
    expect(hashState(state)).toBe(hashAuthoritativeState(state));
  });

  it('pack/unpack includes syncVersion and round-trips hash', () => {
    const { state } = initMatch(reg, reg.match('skirmish_1v1'));
    const packed = packState(state);
    expect(packed.syncVersion).toBe(SYNC_SURFACE_VERSION);
    const restored = unpackState(packed);
    expect(hashState(restored)).toBe(hashState(state));
  });

  it('includes spell cooldowns and orders in hash', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const sim = new Simulation(state, services);
    sim.setAiEnabled(false);
    const player = state.players[0]!;
    player.spellCooldowns['aegis_ward'] = 40;
    const unit = [...state.entities.values()].find((e) => e.kind === 'unit' && e.owner === player.id)!;
    if (unit.kind === 'unit') unit.orders = [{ type: 'move', x: 100, y: 200 }];
    const h1 = hashState(state);
    player.spellCooldowns['aegis_ward'] = 0;
    const h2 = hashState(state);
    expect(h1).not.toBe(h2);
  });
});

describe('sync delta', () => {
  it('produces smaller updates when few entities change', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const sim = new Simulation(state, services);
    sim.setAiEnabled(false);
    const prev = packState(state);
    sim.step();
    const next = packState(state);
    const delta = packDelta(prev, next);
    expect(delta).not.toBeNull();
    if (delta) {
      expect(delta.changed.length + delta.removed.length).toBeLessThan(next.entities.length);
    }
  });

  it('applyWorkerSync mirrors full state and delta equivalently for tick', () => {
    const { state, services } = initMatch(reg, reg.match('skirmish_1v1'));
    const sim = new Simulation(state, services);
    sim.setAiEnabled(false);
    const mirrorA = initMatch(reg, reg.match('skirmish_1v1')).state;
    const mirrorB = initMatch(reg, reg.match('skirmish_1v1')).state;
    const prev = packState(state);
    sim.step();
    const next = packState(state);
    const delta = packDelta(prev, next);
    applyTransferState(mirrorA, next);
    if (delta) applyWorkerSync(mirrorB, { delta });
    expect(mirrorB.tick).toBe(mirrorA.tick);
    expect(hashState(mirrorB)).toBe(hashState(mirrorA));
  });
});

describe('content validation', () => {
  it('registry has no cross-reference errors', () => {
    expect(validateRegistryRefs(reg)).toEqual([]);
  });
});

describe('protocol schema', () => {
  it('parses tick server messages', () => {
    const msg = parseServerMessage({ t: 'tick', tick: 10, cmds: [] });
    expect(msg?.t).toBe('tick');
  });

  it('rejects malformed client messages', () => {
    expect(parseClientMessage({ t: 'commands' })).toBeNull();
  });

  it('rejects oversized command batches', () => {
    const cmds = Array.from({ length: 300 }, () => ({ type: 'stop', playerId: 'player0', entityIds: [] }));
    expect(parseClientMessage({ t: 'commands', forTick: 0, cmds })).toBeNull();
  });
});
