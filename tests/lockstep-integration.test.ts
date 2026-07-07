import { describe, it, expect } from 'vitest';
import { getRegistry } from './helpers';
import { runLockstepPeers } from '../src/net/lockstep-runner';
import { hashState } from '../src/sim/hash';
import { runHeadless } from '../src/testing/headless';
import type { Command } from '../src/sim/types';
import { INPUT_DELAY_TICKS } from '../src/net/protocol';
import { buildMatchConfig, defaultOnlineLobbyState } from '../src/lobby/build-config';

const reg = getRegistry();
const matchId = 'skirmish_1v1';

function onlineHumanConfig(playerCount: 3 | 4) {
  const lobby = defaultOnlineLobbyState();
  if (playerCount === 3) lobby.slots[3]!.kind = 'closed';
  for (let i = 0; i < playerCount; i++) lobby.slots[i]!.startIndex = i;
  return buildMatchConfig({ ...lobby, seed: 4242 });
}

describe('lockstep integration (V2)', () => {
  it('two peers with AI-only match share identical hash at tick 1200', () => {
    const { hash } = runLockstepPeers({
      registry: reg,
      matchId,
      playerIds: ['player0', 'player1'],
      ticks: 1200,
      aiEnabled: true,
      checksumEvery: 60,
    });
    const reference = hashState(runHeadless(reg, reg.match(matchId), 1200));
    expect(hash).toBe(reference);
  });

  it('two peers replaying merged human commands stay in sync at tick 1200', () => {
    const scripted: Record<number, Partial<Record<'player0' | 'player1', Command[]>>> = {
      10: {
        player0: [{ type: 'move', playerId: 'player0', entityIds: [2, 3], x: 480, y: 480 }],
      },
      20: {
        player1: [{ type: 'move', playerId: 'player1', entityIds: [12, 13], x: 520, y: 520 }],
      },
      50: {
        player0: [{ type: 'build', playerId: 'player0', defId: 'attunement_spire', x: 300, y: 300 }],
      },
    };

    const { hash: peerHash } = runLockstepPeers({
      registry: reg,
      matchId,
      playerIds: ['player0', 'player1'],
      ticks: 1200,
      aiEnabled: false,
      checksumEvery: 60,
      onTick(tick, submit) {
        const batch = scripted[tick];
        if (!batch) return;
        for (const [playerId, cmds] of Object.entries(batch)) {
          if (cmds?.length) submit(playerId as 'player0' | 'player1', cmds);
        }
      },
    });

    const delayed: Record<number, Command[]> = {};
    for (const [tick, byPlayer] of Object.entries(scripted)) {
      for (const cmds of Object.values(byPlayer)) {
        if (!cmds?.length) continue;
        const executeAt = Number(tick) + INPUT_DELAY_TICKS;
        const list = delayed[executeAt] ?? [];
        list.push(...cmds);
        delayed[executeAt] = list;
      }
    }

    const reference = hashState(
      runHeadless(reg, reg.match(matchId), 1200, { aiEnabled: false, scriptedCommands: delayed }),
    );
    expect(peerHash).toBe(reference);
  });

  it('three peers replaying merged human commands stay in sync at tick 1200', () => {
    const config = onlineHumanConfig(3);
    const playerIds = ['player0', 'player1', 'player2'] as const;
    const scripted: Record<number, Partial<Record<(typeof playerIds)[number], Command[]>>> = {
      10: { player0: [{ type: 'move', playerId: 'player0', entityIds: [2, 3], x: 480, y: 480 }] },
      20: { player1: [{ type: 'move', playerId: 'player1', entityIds: [12, 13], x: 520, y: 520 }] },
      30: { player2: [{ type: 'move', playerId: 'player2', entityIds: [22, 23], x: 500, y: 500 }] },
    };

    const { hash: peerHash } = runLockstepPeers({
      registry: reg,
      matchConfig: config,
      playerIds: [...playerIds],
      ticks: 1200,
      aiEnabled: false,
      checksumEvery: 60,
      onTick(tick, submit) {
        const batch = scripted[tick];
        if (!batch) return;
        for (const [playerId, cmds] of Object.entries(batch)) {
          if (cmds?.length) submit(playerId as (typeof playerIds)[number], cmds);
        }
      },
    });

    const delayed: Record<number, Command[]> = {};
    for (const [tick, byPlayer] of Object.entries(scripted)) {
      for (const cmds of Object.values(byPlayer)) {
        if (!cmds?.length) continue;
        const executeAt = Number(tick) + INPUT_DELAY_TICKS;
        const list = delayed[executeAt] ?? [];
        list.push(...cmds);
        delayed[executeAt] = list;
      }
    }

    const reference = hashState(
      runHeadless(reg, config, 1200, { aiEnabled: false, scriptedCommands: delayed }),
    );
    expect(peerHash).toBe(reference);
  });

  it('four peers replaying merged human commands stay in sync at tick 1200', () => {
    const config = onlineHumanConfig(4);
    const playerIds = ['player0', 'player1', 'player2', 'player3'] as const;
    const scripted: Record<number, Partial<Record<(typeof playerIds)[number], Command[]>>> = {
      10: { player0: [{ type: 'move', playerId: 'player0', entityIds: [2, 3], x: 480, y: 480 }] },
      20: { player1: [{ type: 'move', playerId: 'player1', entityIds: [12, 13], x: 520, y: 520 }] },
      30: { player2: [{ type: 'move', playerId: 'player2', entityIds: [22, 23], x: 500, y: 500 }] },
      40: { player3: [{ type: 'move', playerId: 'player3', entityIds: [32, 33], x: 540, y: 540 }] },
    };

    const { hash: peerHash } = runLockstepPeers({
      registry: reg,
      matchConfig: config,
      playerIds: [...playerIds],
      ticks: 1200,
      aiEnabled: false,
      checksumEvery: 60,
      onTick(tick, submit) {
        const batch = scripted[tick];
        if (!batch) return;
        for (const [playerId, cmds] of Object.entries(batch)) {
          if (cmds?.length) submit(playerId as (typeof playerIds)[number], cmds);
        }
      },
    });

    const delayed: Record<number, Command[]> = {};
    for (const [tick, byPlayer] of Object.entries(scripted)) {
      for (const cmds of Object.values(byPlayer)) {
        if (!cmds?.length) continue;
        const executeAt = Number(tick) + INPUT_DELAY_TICKS;
        const list = delayed[executeAt] ?? [];
        list.push(...cmds);
        delayed[executeAt] = list;
      }
    }

    const reference = hashState(
      runHeadless(reg, config, 1200, { aiEnabled: false, scriptedCommands: delayed }),
    );
    expect(peerHash).toBe(reference);
  });
});
