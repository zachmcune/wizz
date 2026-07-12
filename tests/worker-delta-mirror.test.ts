import { describe, it, expect } from 'vitest';
import { getRegistry } from './helpers';
import { aiStep } from '../src/ai/controller';
import { SimHost } from '../src/sim/worker/sim-host';
import { applyWorkerSync } from '../src/sim/sync-delta';
import { unpackState } from '../src/sim/state-transfer';
import { hashState } from '../src/sim/hash';

const reg = getRegistry();

/** Structured-clone like the worker→main postMessage boundary. */
function asPosted<T>(value: T): T {
  return structuredClone(value);
}

describe('worker delta mirror fidelity', () => {
  it('mirrors unit movement across SimHost deltas after postMessage cloning', () => {
    const host = new SimHost(reg, aiStep);
    const initial = asPosted(host.initMatch('skirmish_1v1'));
    const mirror = unpackState(initial);
    host.setAi(false);

    let wispId = -1;
    for (const e of mirror.entities.values()) {
      if (e.kind === 'unit' && e.defId === 'wisp' && e.owner === 'player0') {
        wispId = e.id;
        break;
      }
    }
    expect(wispId).toBeGreaterThan(0);
    const start = { ...mirror.entities.get(wispId)!.pos };

    host.enqueue([
      {
        type: 'move',
        playerId: 'player0',
        entityIds: [wispId],
        x: start.x + 400,
        y: start.y + 200,
      },
    ]);

    let sawWispInChanged = false;
    let fullTransfers = 0;
    for (let i = 0; i < 60; i++) {
      const out = host.step();
      if (out.state) {
        fullTransfers++;
        applyWorkerSync(mirror, { state: asPosted(out.state) });
      } else if (out.delta) {
        if (out.delta.changed.some((e) => e.id === wispId)) sawWispInChanged = true;
        applyWorkerSync(mirror, { delta: asPosted(out.delta) });
      }
    }

    const hostPos = host.state.entities.get(wispId)!.pos;
    const mirrorPos = mirror.entities.get(wispId)!.pos;
    expect(hostPos.x).not.toBeCloseTo(start.x, 0);
    expect(mirrorPos.x).toBeCloseTo(hostPos.x, 5);
    expect(mirrorPos.y).toBeCloseTo(hostPos.y, 5);
    expect(sawWispInChanged || fullTransfers > 0).toBe(true);
    expect(hashState(mirror)).toBe(hashState(host.state));
  });
});
