// DISCONNECT AND REJOIN — a peer that drops out must recover without desyncing the match.
//
// THE REQUIREMENT. A player on school wifi will lose their connection mid-match. The relay holds the room open
// (its cleanup timer is 30 minutes), so the player can come back — and when they do, they must end up in the SAME
// world as everyone else, or their rejoin has broken the match for all four players.
//
// TWO THINGS MAKE THAT WORK, AND BOTH ARE TESTED HERE:
//
//   1. GAP FILLING. While the peer was away it received nothing. On reconnect the relay does not replay the lost
//      ticks, so the client synthesizes them as empty command lists and simulates forward. That is correct
//      because a tick with no commands is a legal tick — but it means the returning peer MISSES the commands that
//      were issued while it was gone. Which leads to:
//
//   2. SNAPSHOT RESYNC. A peer that fell further behind than `SNAPSHOT_RESYNC_TICKS` adopts the host's
//      serialized state instead of replaying. `tests/sim/snapshot.test.ts` already proves a restored state
//      continues identically for 200 ticks, which is what makes this safe rather than a new source of drift.
//
// The test asserts the OUTCOME (every peer agrees at the end) rather than the mechanism, because which of the two
// paths recovers a given drop depends on how long it lasted — and the guarantee a player cares about is agreement.
import { describe, expect, it } from 'vitest';
import { loadRegistry } from '../../src/data/loader';
import { runMatchThroughRelay, type PeerSpec } from '../../src/net/harness';
import { SNAPSHOT_RESYNC_TICKS } from '../../src/net/protocol-constants';

const COLORS = ['#4f9dff', '#ff5d5d', '#5cff8a', '#ffd166'];

function human(id: string, team: number, startIndex: number, colorIndex: number): PeerSpec {
  return { id, controller: 'human', team, color: COLORS[colorIndex]!, factionId: 'arcane', startIndex };
}

function inSync(r: ReturnType<typeof runMatchThroughRelay>): boolean {
  const hashes = new Set(r.outcomes.map((o) => o.finalHash));
  const ticks = new Set(r.outcomes.map((o) => o.finalTick));
  return hashes.size === 1 && ticks.size === 1;
}

describe('disconnect and rejoin', () => {
  it('a peer that drops for 3 seconds and returns ends in the same world as everyone else', () => {
    /**
     * 3 seconds = 60 ticks, which is exactly `SNAPSHOT_RESYNC_TICKS` — the boundary case, and the one a real
     * school-wifi blip lands on most often.
     */
    const r = runMatchThroughRelay({
      registry: loadRegistry(),
      mapId: 'duel_glade',
      seed: 1000,
      peers: [human('p1', 0, 0, 0), human('p2', 1, 1, 1)],
      botHumans: true,
      maxTicks: 12 * 60 * 20,
      dropPeer: { playerId: 'p2', atTick: 600, backAtTick: 660 },
    });

    const detail = r.outcomes.map((o) => `${o.playerId}: tick ${o.finalTick} hash ${o.finalHash}`).join('\n  ');
    expect(inSync(r), `peers disagree after the drop:\n  ${detail}`).toBe(true);
    // The drop must not have desynced the match either, or the recovery was only cosmetic.
    expect(r.desyncEvents, 'a desync was reported around the drop').toEqual([]);
  }, 900_000);

  it('a peer that drops for 20 seconds and returns still catches up', () => {
    /**
     * Well past `SNAPSHOT_RESYNC_TICKS` (120), so this is the case that genuinely needs a snapshot rather than a
     * replay. 20 s is longer than any stall the relay tolerates (`STALL_DROP_MS` is 15 s), which is realistic: the
     * relay stops pacing on the missing peer and the match continues without it until it returns.
     */
    const r = runMatchThroughRelay({
      registry: loadRegistry(),
      mapId: 'duel_glade',
      seed: 1007,
      peers: [human('p1', 0, 0, 0), human('p2', 1, 1, 1)],
      botHumans: true,
      maxTicks: 12 * 60 * 20,
      dropPeer: { playerId: 'p2', atTick: 500, backAtTick: 900 },
    });
    const lag = 900 - 500;
    expect(lag).toBeGreaterThan(SNAPSHOT_RESYNC_TICKS);

    const detail = r.outcomes.map((o) => `${o.playerId}: tick ${o.finalTick} hash ${o.finalHash}`).join('\n  ');
    expect(inSync(r), `peers disagree after a long drop:\n  ${detail}`).toBe(true);
  }, 900_000);

  it('a 4-player match survives one dropped peer', () => {
    /**
     * The case with the most ways to go wrong: three peers keep simulating while a fourth is absent, so the
     * returning peer has three command streams to make up rather than one.
     */
    const r = runMatchThroughRelay({
      registry: loadRegistry(),
      mapId: 'duel_glade',
      seed: 1014,
      peers: [human('p1', 0, 0, 0), human('p2', 1, 1, 1), human('p3', 2, 2, 2), human('p4', 3, 3, 3)],
      botHumans: true,
      maxTicks: 14 * 60 * 20,
      dropPeer: { playerId: 'p3', atTick: 400, backAtTick: 700 },
    });
    const detail = r.outcomes.map((o) => `${o.playerId}: tick ${o.finalTick} hash ${o.finalHash}`).join('\n  ');
    expect(inSync(r), `4-peer match broke after a drop:\n  ${detail}`).toBe(true);
  }, 900_000);

  it('the match keeps advancing while a peer is away, rather than freezing on it', () => {
    /**
     * THE STALL POLICY'S OTHER HALF. A dropped peer must not stall everyone else: the relay excludes it from
     * pacing after `STALL_DROP_MS`, and the remaining peers continue. This asserts the relay clock advanced well
     * past the drop point while the peer was gone.
     */
    const dropAt = 300;
    const backAt = 800;
    const r = runMatchThroughRelay({
      registry: loadRegistry(),
      mapId: 'duel_glade',
      seed: 1021,
      peers: [human('p1', 0, 0, 0), human('p2', 1, 1, 1)],
      botHumans: true,
      maxTicks: 10 * 60 * 20,
      dropPeer: { playerId: 'p2', atTick: dropAt, backAtTick: backAt },
    });
    // The relay advanced at least to the rejoin point; a frozen relay would stop near the drop.
    expect(r.relayTicks).toBeGreaterThan(backAt);
  }, 900_000);
});
