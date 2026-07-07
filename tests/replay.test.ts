import { describe, it, expect } from 'vitest';
import { getRegistry } from './helpers';
import { runHeadless } from '../src/sim/headless';
import { hashState } from '../src/sim/hash';
import { replayFromScripted, replayHash, runReplay } from '../src/sim/replay';

const reg = getRegistry();

describe('replay harness', () => {
  it('replaying scripted commands matches headless run', () => {
    const scripted = {
      5: [{ type: 'build' as const, playerId: 'player0', defId: 'attunement_spire', x: 400, y: 240 }],
      40: [{ type: 'move' as const, playerId: 'player0', entityIds: [2, 3], x: 500, y: 500 }],
    };
    const replay = replayFromScripted('skirmish_1v1', scripted);
    const direct = runHeadless(reg, reg.match('skirmish_1v1'), 300, {
      aiEnabled: false,
      scriptedCommands: scripted,
    });
    const fromReplay = runReplay(reg, replay, { ticks: 300, aiEnabled: false });
    expect(hashState(fromReplay)).toBe(hashState(direct));
  });

  it('replayHash helper matches direct hash', () => {
    const scripted = {
      5: [{ type: 'build' as const, playerId: 'player0', defId: 'attunement_spire', x: 400, y: 240 }],
    };
    const replay = replayFromScripted('skirmish_1v1', scripted);
    const h1 = replayHash(reg, replay, 100, false);
    const h2 = hashState(
      runHeadless(reg, reg.match('skirmish_1v1'), 100, { aiEnabled: false, scriptedCommands: scripted }),
    );
    expect(h1).toBe(h2);
  });
});
