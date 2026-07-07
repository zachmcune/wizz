import { describe, it, expect } from 'vitest';
import { getRegistry } from './helpers';
import { aiStep } from '../src/ai/controller';
import { SimHost } from '../src/sim/worker/sim-host';
import { runHeadless } from '../src/testing/headless';
import { hashState } from '../src/sim/hash';
import { packState } from '../src/sim/state-transfer';

const reg = getRegistry();

describe('worker sim host (determinism across the split)', () => {
  it('message-driven stepping matches the single-thread run bit-for-bit', () => {
    const host = new SimHost(reg, aiStep);
    host.initMatch('skirmish_1v1');
    for (let i = 0; i < 800; i++) host.step();
    const workerHash = hashState(host.state);

    const direct = runHeadless(reg, reg.match('skirmish_1v1'), 800);
    expect(workerHash).toBe(hashState(direct));
  });

  it('commands enqueued through the host match scripted commands headless', () => {
    const host = new SimHost(reg, aiStep);
    host.initMatch('skirmish_1v1');
    host.setAi(false);
    for (let i = 0; i < 30; i++) {
      if (i === 5) host.enqueue([{ type: 'build', playerId: 'player0', defId: 'attunement_spire', x: 400, y: 240 }]);
      host.step();
    }
    const direct = runHeadless(reg, reg.match('skirmish_1v1'), 30, {
      aiEnabled: false,
      scriptedCommands: { 5: [{ type: 'build', playerId: 'player0', defId: 'attunement_spire', x: 400, y: 240 }] },
    });
    expect(hashState(host.state)).toBe(hashState(direct));
  });

  it('initState restores mid-match state and continues deterministically', () => {
    const host = new SimHost(reg, aiStep);
    host.initMatch('skirmish_1v1');
    for (let i = 0; i < 200; i++) host.step();
    const mid = packState(host.state);

    const host2 = new SimHost(reg, aiStep);
    host2.initState(mid);
    for (let i = 0; i < 600; i++) host2.step();

    const direct = runHeadless(reg, reg.match('skirmish_1v1'), 800);
    expect(hashState(host2.state)).toBe(hashState(direct));
  });
});
