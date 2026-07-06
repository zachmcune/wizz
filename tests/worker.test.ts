import { describe, it, expect } from 'vitest';
import { getRegistry } from './helpers';
import { SimHost } from '../src/sim/worker/sim-host';
import { runHeadless } from '../src/sim/headless';
import { hashState } from '../src/sim/hash';

const reg = getRegistry();

describe('worker sim host (determinism across the split)', () => {
  it('message-driven stepping matches the single-thread run bit-for-bit', () => {
    const host = new SimHost(reg);
    host.initMatch('skirmish_1v1');
    for (let i = 0; i < 800; i++) host.step();
    const workerHash = hashState(host.state);

    const direct = runHeadless(reg, reg.match('skirmish_1v1'), 800);
    expect(workerHash).toBe(hashState(direct));
  });

  it('commands enqueued through the host match scripted commands headless', () => {
    const host = new SimHost(reg);
    host.setAi(false);
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
});
