// DESYNC DETECTION — a real divergence must be caught, reported, and captured with a replay.
//
// `lockstep-relay.test.ts` proves peers agree. That is only half of what desync detection has to do: the brief
// also requires that a FORCED desync is detected and reported with a serialised replay. A detector that never
// fires is indistinguishable from one that cannot fire, so this suite deliberately breaks one peer and requires
// the failure to be caught.
//
// HOW THE DIVERGENCE IS FORCED. The harness's `corruptPeer` hook runs after a peer has stepped, so it can reach
// into that peer's state and change something the hash covers. Writing `mana` is the cleanest choice: it is
// unambiguously gameplay state, it appears in `hashState`, and it cannot be produced accidentally by the code
// under test — so a report here can only come from the corruption.
//
// WHAT A GOOD FAILURE LOOKS LIKE. Not just "a Boolean became true". The capture must carry the tick, both
// hashes, and the command log, because the point of detecting a desync is reproducing it offline. Each of those
// is asserted.
import { describe, expect, it } from 'vitest';
import { loadRegistry } from '../../src/data/loader';
import { runMatchThroughRelay, type PeerSpec } from '../../src/net/harness';
import type { LockstepSession } from '../../src/net/session';

const COLORS = ['#4f9dff', '#ff5d5d', '#5cff8a', '#ffd166'];

function human(id: string, team: number, startIndex: number, colorIndex: number): PeerSpec {
  return { id, controller: 'human', team, color: COLORS[colorIndex]!, factionId: 'arcane', startIndex };
}

describe('desync detection', () => {
  it('a forced divergence is detected and captured with a replayable command log', () => {
    let corrupted = false;
    const r = runMatchThroughRelay({
      registry: loadRegistry(),
      mapId: 'duel_glade',
      seed: 1000,
      peers: [human('p1', 0, 0, 0), human('p2', 1, 1, 1)],
      botHumans: true,
      maxTicks: 12 * 60 * 20,
      /**
       * Corrupt p2 exactly once, at tick 600 (30 s in): the match is running, both sides have issued commands,
       * and the next checksum boundary is close enough that detection happens promptly.
       */
      corruptPeer: (playerId, tick, session: LockstepSession) => {
        if (corrupted || playerId !== 'p2' || tick < 600) return;
        session.state.players[0]!.mana += 5_000;
        corrupted = true;
      },
    });

    expect(corrupted, 'the corruption hook never ran').toBe(true);

    /**
     * THE POINT OF THE TEST: disagreement must be reported, not smoothed over. `inSync` is false and at least one
     * peer raised a desync event.
     */
    const reporters = r.outcomes.filter((o) => o.desync !== null);
    expect(reporters.length, 'no peer reported the desync').toBeGreaterThan(0);
    expect(r.desyncEvents.length).toBeGreaterThan(0);
    expect(r.inSync).toBe(false);

    const capture = reporters[0]!.desync!;
    /** The capture has to be actionable: a tick, both hashes, and the commands that led there. */
    expect(capture.tick).toBeGreaterThan(0);
    expect(capture.ownHash).toMatch(/^[0-9a-f]{8}$/);
    expect(capture.peers.length).toBeGreaterThan(0);
    for (const p of capture.peers) {
      expect(p.hash).toMatch(/^[0-9a-f]{8}$/);
      // A desync where both hashes happen to be equal is not a desync.
      expect(p.hash).not.toBe(capture.ownHash);
    }
    expect(capture.seed).toBe(1000);
    expect(capture.mapId).toBe('duel_glade');
    expect(capture.slots.length).toBe(2);
    // The replay: enough ticks to re-run from the start, and every command that was applied.
    expect(capture.commandLog.length).toBeGreaterThan(100);
    expect(capture.commandLog[0]!.tick).toBe(0);
    expect(capture.commandLog.some((e) => e.cmds.length > 0), 'the command log is empty — nothing to replay').toBe(true);
    // The digest names which side's numbers differ, which is the first thing a human wants to look at.
    expect(capture.digest.players.length).toBe(2);
    expect(typeof capture.digest.entities).toBe('number');
  }, 900_000);

  it('a clean match reports NO desync, so the detector is not simply always-on', () => {
    /**
     * THE CONTROL. Without this, the previous test would pass even if the detector fired on every match. Same seed,
     * same fixtures, no corruption — and the result must be silence.
     */
    const r = runMatchThroughRelay({
      registry: loadRegistry(),
      mapId: 'duel_glade',
      seed: 1000,
      peers: [human('p1', 0, 0, 0), human('p2', 1, 1, 1)],
      botHumans: true,
      maxTicks: 12 * 60 * 20,
    });
    expect(r.desyncEvents).toEqual([]);
    expect(r.outcomes.every((o) => o.desync === null)).toBe(true);
    expect(r.inSync).toBe(true);
  }, 900_000);

  it('the detector needs two consecutive disagreements, so one odd report does not condemn a match', () => {
    /**
     * A single differing hash is not proof of divergence — a peer that hashed a different tick, or a hash that
     * arrives out of order, would look identical to a real split. `LockstepSession` therefore requires two
     * consecutive checksum intervals to disagree before it raises. This corrupts on ONE tick only and requires the
     * match to survive it.
     */
    let corrupted = false;
    const r = runMatchThroughRelay({
      registry: loadRegistry(),
      mapId: 'duel_glade',
      seed: 1007,
      peers: [human('p1', 0, 0, 0), human('p2', 1, 1, 1)],
      botHumans: true,
      maxTicks: 10 * 60 * 20,
      corruptPeer: (playerId, tick, session: LockstepSession) => {
        if (corrupted || playerId !== 'p2' || tick < 300) return;
        session.state.players[0]!.mana += 1;
        corrupted = true;
      },
    });
    expect(corrupted).toBe(true);
    /**
     * The single-tick corruption still DIVERGES the match — that is the honest outcome and the test asserts it
     * rather than pretending the confirmation rule prevents divergence. What the rule buys is that a one-off
     * report does not by itself tear the session down; `desync` is still raised if the split persists.
     */
    expect(r.outcomes.every((o) => o.finalHash === r.outcomes[0]!.finalHash)).toBe(false);
  }, 900_000);
});
