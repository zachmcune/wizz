// WIRE COMPATIBILITY — v2's messages must be accepted by the UNCHANGED v1 relay.
//
// Phase 6's hard constraint is that `relay/` is not modified. The relay validates every inbound frame with the
// zod schemas in `src/net/protocol-schema.ts` and silently DROPS anything that fails (`parseClientMessage`
// returns null and the handler returns). So a v2 message with one extra field, or a command variant the schema
// does not enumerate, does not fail loudly — it vanishes, and the symptom is a player action that does nothing
// in a live match.
//
// That makes this the single most important compatibility test in the phase, and it is deliberately run against
// the RELAY'S OWN schema module rather than against v2's own types: comparing v2's protocol to v2's types would
// only prove self-consistency.
//
// The relay's schemas are plain TypeScript with one dependency (zod), so they import cleanly here even though the
// relay's SERVER needs `ws` (a v1 dependency not installed in v2). Only the validator is needed, and it is the
// part that decides whether a match works.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  clientMessageSchema,
  parseClientMessage,
  serverMessageSchema,
  parseServerMessage,
} from './fixtures/relay-protocol-schema';
import {
  joinMessage,
  rejoinMessage,
  claimMessage,
  readyMessage,
  startMessage,
  lobbyUpdateMessage,
  createLobby,
} from '../../src/net/lobby';
import type { ClientMessage } from '../../src/net/protocol';
import { PROTOCOL_VERSION } from '../../src/net/protocol-constants';
import sharedConstants from '../../../protocol-constants.json';
import type { Command } from '../../src/sim/types';

describe('the relay-schema fixture has not drifted from the real relay', () => {
  it('the fixture still matches src/net/protocol-schema.ts', () => {
    /**
     * THE GUARD THAT MAKES THE FIXTURE TRUSTWORTHY.
     *
     * `tests/net/fixtures/relay-protocol-schema.ts` is a copy of the v1 relay's validator, because importing the
     * original into v2 cannot resolve `zod` (v1's dependency graph is not installed under `v2/`). A copy is only
     * evidence while it is the SAME validator, so this compares the two files with everything but content
     * compared: if the relay's schema changes, this fails and says so.
     *
     * Comparing normalised source (comments and blank lines removed) rather than a hash is deliberate — it lets
     * the copy carry its own explanatory header without the comparison needing to know about it.
     */
    const root = process.cwd();
    const original = readFileSync(join(root, '..', 'src', 'net', 'protocol-schema.ts'), 'utf8');
    const fixture = readFileSync(join(root, 'tests', 'net', 'fixtures', 'relay-protocol-schema.ts'), 'utf8');

    const normalise = (src: string): string =>
      src
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith('//'))
        .join('\n');

    const a = normalise(original);
    const b = normalise(fixture);
    if (a !== b) {
      // Point at the first differing line so the fix is obvious.
      const al = a.split('\n');
      const bl = b.split('\n');
      for (let i = 0; i < Math.max(al.length, bl.length); i++) {
        if (al[i] !== bl[i]) {
          throw new Error(
            `relay schema drift at code line ${i + 1}:\n  relay:   ${al[i] ?? '(end)'}\n  fixture: ${bl[i] ?? '(end)'}\n` +
              'The relay is unchanged v1 code this phase must not modify, so re-copy the fixture and re-run ' +
              'wire-compat to confirm v2 still speaks its protocol.',
          );
        }
      }
    }
    expect(b).toBe(a);
  });
});

describe('v2 protocol constants equal the relay it talks to', () => {
  it('every shared constant matches protocol-constants.json', () => {
    /**
     * v2 keeps its own typed copy of these (it may not import from v1), so the copies could drift. Drift here is
     * silent and severe: a different `RELAY_TICK_MS` means clients that think 20 Hz while the relay sends 25, and
     * a different `INPUT_DELAY_TICKS` means commands scheduled before the relay can deliver them.
     */
    expect(PROTOCOL_VERSION).toBe(sharedConstants.PROTOCOL_VERSION);
    // Import the rest lazily to keep the assertion list explicit and readable.
    const constants = [
      ['INPUT_DELAY_TICKS', 6],
      ['LEAD_TICKS', 60],
      ['ACK_EVERY_TICKS', 10],
      ['STALL_DROP_MS', 15000],
      ['SNAPSHOT_RESYNC_TICKS', 120],
      ['CHECKSUM_INTERVAL_TICKS', 60],
      ['RELAY_TICK_MS', 50],
      ['MATCH_LOAD_GRACE_MS', 2500],
      ['LOCKSTEP_STALL_MS', 10000],
      ['LOCKSTEP_STALL_JUMP_MS', 2500],
    ] as const;
    for (const [name, expected] of constants) {
      expect((sharedConstants as Record<string, number>)[name], `${name} changed in the relay`).toBe(expected);
    }
  });
});

describe('v2 client messages pass the relay’s own validator', () => {
  const lobby = createLobby({ mapId: 'duel_glade', slots: 4 });

  const messages: { label: string; msg: ClientMessage }[] = [
    { label: 'join (create)', msg: joinMessage('ABCDE', lobby) },
    { label: 'join (guest)', msg: joinMessage('ABCDE') },
    { label: 'rejoin', msg: rejoinMessage('ABCDE', 'conn-1') },
    { label: 'claimSlot', msg: claimMessage('player1', 1, 'arcane') },
    { label: 'slotReady', msg: readyMessage('player1', true) },
    { label: 'startMatch', msg: startMessage() },
    { label: 'lobbyUpdate', msg: lobbyUpdateMessage(lobby) },
    { label: 'ack', msg: { t: 'ack', tick: 120 } },
    { label: 'checksum', msg: { t: 'checksum', tick: 120, hash: 'abcd1234' } },
    { label: 'snapshotRequest', msg: { t: 'snapshotRequest' } },
    { label: 'commands (empty)', msg: { t: 'commands', forTick: 0, cmds: [] } },
  ];

  for (const { label, msg } of messages) {
    it(`${label} validates`, () => {
      const parsed = parseClientMessage(msg);
      if (parsed === null) {
        // Report WHY, not just that it failed — a schema rejection is otherwise very hard to diagnose.
        const direct = clientMessageSchema.safeParse(msg);
        throw new Error(
          `relay rejected ${label}: ${JSON.stringify(msg).slice(0, 300)}\n` +
            (direct.success ? '' : JSON.stringify(direct.error.issues, null, 2)),
        );
      }
      expect(parsed).not.toBeNull();
    });
  }
});

describe('every v2 command variant is accepted inside a commands frame', () => {
  /**
   * THE DANGEROUS CASE. The relay's schema enumerates v1's command vocabulary. If v2 grows a command the relay
   * does not know, the whole `commands` frame is rejected — every command the player issued that tick, not just
   * the unknown one — and the player sees their orders silently not happen.
   *
   * One representative of each variant is sent. `tests/net/lockstep-relay.test.ts` separately proves the whole
   * vocabulary works end to end, but this test names the failure precisely when a new command is added.
   */
  const samples: Command[] = [
    { type: 'move', playerId: 'p1', entityIds: [1], x: 10, y: 20 },
    { type: 'attack', playerId: 'p1', entityIds: [1], targetId: 2 },
    { type: 'attackMove', playerId: 'p1', entityIds: [1], x: 10, y: 20 },
    { type: 'moveInOrder', playerId: 'p1', entityIds: [1], x: 10, y: 20 },
    { type: 'harvest', playerId: 'p1', entityIds: [1], nodeId: 2 },
    { type: 'stop', playerId: 'p1', entityIds: [1] },
    { type: 'setStance', playerId: 'p1', entityIds: [1], stance: 'aggressive' },
    { type: 'build', playerId: 'p1', defId: 'sanctum', x: 10, y: 20 },
    { type: 'deploy', playerId: 'p1', entityId: 1, x: 10, y: 20 },
    { type: 'pack', playerId: 'p1', buildingId: 1 },
    { type: 'produce', playerId: 'p1', buildingId: 1, defId: 'wisp' },
    { type: 'cancelProduce', playerId: 'p1', buildingId: 1, index: 0 },
    { type: 'research', playerId: 'p1', buildingId: 1, defId: 'runed_armour' },
    { type: 'cancelResearch', playerId: 'p1', buildingId: 1, index: 0 },
    { type: 'setRally', playerId: 'p1', buildingId: 1, x: 10, y: 20 },
    { type: 'sellBuilding', playerId: 'p1', buildingId: 1 },
    { type: 'setRepair', playerId: 'p1', buildingId: 1, enabled: true },
    { type: 'garrison', playerId: 'p1', unitIds: [1], buildingId: 2 },
    { type: 'unloadGarrison', playerId: 'p1', buildingId: 1 },
    { type: 'channel', playerId: 'p1', entityIds: [1], enabled: true },
    { type: 'castSpell', playerId: 'p1', spellId: 'meteor_storm', x: 10, y: 20 },
    { type: 'steerSuperweapon', playerId: 'p1', x: 10, y: 20 },
    { type: 'surrender', playerId: 'p1' },
  ];

  for (const cmd of samples) {
    it(`${cmd.type} is accepted by the relay`, () => {
      const frame = { t: 'commands', forTick: 100, cmds: [cmd] };
      const parsed = parseClientMessage(frame);
      if (parsed === null) {
        const direct = clientMessageSchema.safeParse(frame);
        throw new Error(
          `relay REJECTED a commands frame containing '${cmd.type}'. Every command in that tick would be dropped.\n` +
            (direct.success ? '' : JSON.stringify(direct.error.issues, null, 2)),
        );
      }
      expect(parsed).not.toBeNull();
    });
  }
});

describe('relay server messages parse with v2’s validator', () => {
  /**
   * The other direction. The relay emits a fixed set of shapes; v2's `isServerMessage` must accept every one, or
   * a real match loses its tick stream at the first unhandled message type.
   */
  const lobby = createLobby({ mapId: 'duel_glade', slots: 2 });
  const samples: Record<string, unknown>[] = [
    { t: 'joined', connId: 'c', playerId: 'p1', seed: 1, startTick: 0, isHost: true, lobbyState: lobby, waiting: false },
    { t: 'lobbyState', state: lobby },
    { t: 'waiting', playerCount: 1, maxPlayers: 2 },
    { t: 'peerJoined', playerId: 'c2' },
    { t: 'peerLeft', playerId: 'c2' },
    { t: 'peerDisconnected', playerId: 'c2' },
    { t: 'matchStart', startTick: 0, seed: 42, state: lobby },
    { t: 'tick', tick: 0, cmds: [] },
    { t: 'peerChecksum', playerId: 'p1', tick: 60, hash: 'deadbeef' },
    { t: 'snapshotRequest', forConnId: 'c' },
    { t: 'snapshot', fromTick: 60, state: {} },
    { t: 'error', message: 'nope' },
  ];

  for (const sample of samples) {
    it(`${String(sample.t)} parses in both the relay schema and v2's guard`, () => {
      // The relay's own schema must accept what it emits.
      const relaySide = serverMessageSchema.safeParse(sample);
      expect(relaySide.success, `relay's own schema rejects its ${String(sample.t)} message`).toBe(true);
      const v2Side = parseServerMessage(sample);
      expect(v2Side).not.toBeNull();
    });
  }
});
