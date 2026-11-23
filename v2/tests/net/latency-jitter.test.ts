// LATENCY AND JITTER — the lockstep must survive a bad network, not just a perfect one.
//
// The in-process relay can deliver each peer's tick messages after a fixed delay plus a bounded random one. That
// is the mechanism a real connection has, expressed in ticks instead of milliseconds, so a case here is a
// reproducible statement about a network condition rather than a flaky timing race.
//
// WHY THE INPUT DELAY IS THE THING UNDER TEST. A peer's command has to arrive at the relay before the tick it
// targets. With `INPUT_DELAY_TICKS` of 6 at 20 Hz that is a 300 ms budget covering the upload, the merge, the
// broadcast and the download. If the budget is respected, a delayed peer's commands still execute — they are
// simply decided later, and every peer applies them at the same tick, so the match stays in sync. If it is not,
// a command silently misses its tick and the two worlds diverge.
//
// The interesting cases are therefore:
//
//   • ASYMMETRIC latency (one peer far slower than the other) — the common school-wifi situation;
//   • JITTER (variable delay) — the case that actually reorders arrival;
//   • a peer briefly PAUSED (a tab freeze) then resumed — must catch up, not deadlock.
//
// Every case asserts the same two things: no desync, and both peers still reach the same final hash.
import { describe, expect, it } from 'vitest';
import { loadRegistry } from '../../src/data/loader';
import { runMatchThroughRelay, type PeerSpec, type MatchHarnessResult } from '../../src/net/harness';

const COLORS = ['#4f9dff', '#ff5d5d', '#5cff8a', '#ffd166'];

function human(id: string, team: number, startIndex: number, colorIndex: number, extra: Partial<PeerSpec> = {}): PeerSpec {
  return { id, controller: 'human', team, color: COLORS[colorIndex]!, factionId: 'arcane', startIndex, ...extra };
}

function expectInSync(r: MatchHarnessResult, label: string): void {
  const detail = r.outcomes
    .map((o) => `${o.playerId}: tick ${o.finalTick} hash ${o.finalHash} issued=${o.issued}`)
    .join('\n  ');
  expect(r.desyncEvents, `${label}: desyncs\n${JSON.stringify(r.desyncEvents, null, 2)}`).toEqual([]);
  expect(r.inSync, `${label}: peers disagree\n  ${detail}`).toBe(true);
  expect(new Set(r.outcomes.map((o) => o.finalHash)).size, `${label}: hash mismatch\n  ${detail}`).toBe(1);
  // A real match has to have happened; two idle worlds would agree for the wrong reason.
  expect(r.outcomes.every((o) => o.issued > 100), `${label}: channel barely used\n  ${detail}`).toBe(true);
}

describe('lockstep under latency and jitter', () => {
  it('equal 2-tick latency on both peers: no desync', () => {
    const r = runMatchThroughRelay({
      registry: loadRegistry(),
      mapId: 'duel_glade',
      seed: 1000,
      peers: [human('p1', 0, 0, 0, { latencyTicks: 2 }), human('p2', 1, 1, 1, { latencyTicks: 2 })],
      botHumans: true,
      maxTicks: 12 * 60 * 20,
    });
    expectInSync(r, '2-tick latency');
    // The peers did real work despite the delay, which is what the input buffer is for.
    expect(r.outcomes[0]!.finalTick).toBeGreaterThan(5 * 60 * 20);
  }, 900_000);

  it('asymmetric latency (one peer 6 ticks behind): no desync', () => {
    /**
     * The realistic bad case: one player on a good connection and one on a slow one. The slow peer's commands are
     * decided later, but because every command carries an explicit target tick, both worlds still apply the same
     * list at the same tick.
     */
    const r = runMatchThroughRelay({
      registry: loadRegistry(),
      mapId: 'duel_glade',
      seed: 1007,
      peers: [human('p1', 0, 0, 0, { latencyTicks: 0 }), human('p2', 1, 1, 1, { latencyTicks: 6 })],
      botHumans: true,
      maxTicks: 12 * 60 * 20,
    });
    expectInSync(r, 'asymmetric 6-tick');
    expect(r.outcomes.every((o) => o.ended || o.finalTick > 5 * 60 * 20)).toBe(true);
  }, 900_000);

  it('jitter: variable per-message delay of up to 4 ticks on both peers: no desync', () => {
    /**
     * Jitter is what can REORDER arrival. The lockstep absorbs it because commands are addressed to a tick rather
     * than applied on arrival, and because the relay emits in sorted player order regardless of when submissions
     * landed. This is the case that would break a naive "apply when it arrives" implementation.
     */
    const r = runMatchThroughRelay({
      registry: loadRegistry(),
      mapId: 'duel_glade',
      seed: 1014,
      peers: [
        human('p1', 0, 0, 0, { latencyTicks: 1, jitterTicks: 4, jitterSeed: 0x1234 }),
        human('p2', 1, 1, 1, { latencyTicks: 1, jitterTicks: 4, jitterSeed: 0x9876 }),
      ],
      botHumans: true,
      maxTicks: 12 * 60 * 20,
    });
    expectInSync(r, 'jitter 4');
  }, 900_000);

  it('heavy jitter with asymmetric latency on 4 peers: no desync', () => {
    /** The worst combination the harness can produce: four peers, each with a different delay profile. */
    const r = runMatchThroughRelay({
      registry: loadRegistry(),
      mapId: 'duel_glade',
      seed: 1021,
      peers: [
        human('p1', 0, 0, 0, { latencyTicks: 0, jitterTicks: 2, jitterSeed: 11 }),
        human('p2', 1, 1, 1, { latencyTicks: 3, jitterTicks: 5, jitterSeed: 22 }),
        human('p3', 2, 2, 2, { latencyTicks: 1, jitterTicks: 3, jitterSeed: 33 }),
        human('p4', 3, 3, 3, { latencyTicks: 5, jitterTicks: 2, jitterSeed: 44 }),
      ],
      botHumans: true,
      maxTicks: 14 * 60 * 20,
    });
    expectInSync(r, '4-peer mixed network');
  }, 900_000);

  it('the same jittered run twice produces byte-identical results, so a failure is reproducible', () => {
    /**
     * Determinism of the HARNESS, not just of the sim. Jitter is generated from a seeded per-message hash rather
     * than `Math.random`, so a case that fails can be re-run and will fail the same way. Without this a flaky
     * multiplayer test is untriageable.
     */
    const seed = 1042;
    const peers = (): PeerSpec[] => [
      human('p1', 0, 0, 0, { latencyTicks: 2, jitterTicks: 3, jitterSeed: 7 }),
      human('p2', 1, 1, 1, { latencyTicks: 1, jitterTicks: 3, jitterSeed: 9 }),
    ];
    const a = runMatchThroughRelay({
      registry: loadRegistry(),
      mapId: 'duel_glade',
      seed,
      peers: peers(),
      botHumans: true,
      maxTicks: 10 * 60 * 20,
    });
    const b = runMatchThroughRelay({
      registry: loadRegistry(),
      mapId: 'duel_glade',
      seed,
      peers: peers(),
      botHumans: true,
      maxTicks: 10 * 60 * 20,
    });
    expect(a.outcomes.map((o) => o.finalHash)).toEqual(b.outcomes.map((o) => o.finalHash));
    expect(a.outcomes.map((o) => o.finalTick)).toEqual(b.outcomes.map((o) => o.finalTick));
    expect(a.relayTicks).toBe(b.relayTicks);
  }, 900_000);
});
