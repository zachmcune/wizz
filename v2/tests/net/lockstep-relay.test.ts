// LOCKSTEP THROUGH THE RELAY — 2, 3 and 4 peers, full matches, zero desyncs.
//
// This is the primary Phase 6 gate. Each case runs real `LockstepSession`s through an in-process relay, with the
// real AI, the real sim and real state hashing, and requires:
//
//   • every peer reaches the SAME final tick and the SAME final state hash;
//   • no desync was reported at any checksum interval;
//   • the match actually FINISHED, so the agreement is about a decided game rather than an idle one.
//
// Each human seat is played by a shipped `AiBrain` whose commands travel over the network — see
// `src/net/bot-client.ts` for why that is the honest fixture. The command path under test is the real one:
// issue → input-delay schedule → relay merge (grouped by player, sorted) → broadcast → applyCommands.
//
// The three configurations are the ones the brief names: 1v1, 2v2 and four-player free-for-all. They matter
// separately because teams change the relations graph and a 4-player match exercises a four-stream merge.
import { describe, expect, it } from 'vitest';
import { loadRegistry } from '../../src/data/loader';
import { runMatchThroughRelay, type PeerSpec, type MatchHarnessResult } from '../../src/net/harness';
import { CHECKSUM_INTERVAL_TICKS } from '../../src/net/protocol-constants';

/** Colours from the sim's canonical palette, so a log or a render reads correctly. */
const COLORS = ['#4f9dff', '#ff5d5d', '#5cff8a', '#ffd166'];

function human(id: string, team: number, startIndex: number, colorIndex: number): PeerSpec {
  return {
    id,
    controller: 'human',
    team,
    color: COLORS[colorIndex]!,
    factionId: 'arcane',
    startIndex,
  };
}

function expectAgreement(r: MatchHarnessResult, label: string): void {
  const hashes = new Set(r.outcomes.map((o) => o.finalHash));
  const ticks = new Set(r.outcomes.map((o) => o.finalTick));
  const detail = r.outcomes
    .map((o) => `${o.playerId}: tick ${o.finalTick} hash ${o.finalHash} ended=${o.ended} issued=${o.issued}`)
    .join('\n  ');

  expect(r.desyncEvents, `${label} reported desyncs:\n${JSON.stringify(r.desyncEvents, null, 2)}`).toEqual([]);
  expect(hashes.size, `${label}: peers disagree on the final state\n  ${detail}`).toBe(1);
  expect(ticks.size, `${label}: peers disagree on the final tick\n  ${detail}`).toBe(1);
  expect(r.inSync, `${label}: not in sync\n  ${detail}`).toBe(true);
  expect(r.outcomes.every((o) => o.ended), `${label}: every peer must see the match end\n  ${detail}`).toBe(true);

  /**
   * REAL WORK MUST HAVE HAPPENED. A match where nobody issued a command would agree trivially. Every peer has to
   * have pushed real traffic through the merge, and the match has to have outlived the opening.
   */
  expect(r.outcomes.every((o) => o.issued > 100), `${label}: a peer barely used the channel\n  ${detail}`).toBe(true);
  expect(r.outcomes[0]!.finalTick, `${label}: match barely ran`).toBeGreaterThan(5 * 60 * 20);
}

describe('lockstep over the relay: identical peers, zero desyncs', () => {
  it('2 peers (1v1) stay in sync to a decided match', () => {
    const r = runMatchThroughRelay({
      registry: loadRegistry(),
      mapId: 'duel_glade',
      seed: 1000,
      peers: [human('p1', 0, 0, 0), human('p2', 1, 1, 1)],
      botHumans: true,
      maxTicks: 34 * 60 * 20,
    });
    expectAgreement(r, '2 peers');
  }, 900_000);

  it('3 peers (three teams) stay in sync to a decided match', () => {
    const r = runMatchThroughRelay({
      registry: loadRegistry(),
      mapId: 'duel_glade',
      seed: 1007,
      peers: [human('p1', 0, 0, 0), human('p2', 1, 1, 1), human('p3', 2, 2, 2)],
      botHumans: true,
      maxTicks: 34 * 60 * 20,
    });
    expectAgreement(r, '3 peers');
  }, 900_000);

  it('4 peers (free-for-all) stay in sync to a decided match', () => {
    const r = runMatchThroughRelay({
      registry: loadRegistry(),
      mapId: 'duel_glade',
      seed: 1014,
      peers: [human('p1', 0, 0, 0), human('p2', 1, 1, 1), human('p3', 2, 2, 2), human('p4', 3, 3, 3)],
      botHumans: true,
      maxTicks: 34 * 60 * 20,
    });
    expectAgreement(r, '4 peers FFA');
  }, 900_000);

  it('4 peers in 2v2 teams stay in sync to a decided match', () => {
    /** Teams share a relation, which is a different code path: allies cannot target each other. */
    const r = runMatchThroughRelay({
      registry: loadRegistry(),
      mapId: 'duel_glade',
      seed: 1021,
      peers: [human('p1', 0, 0, 0), human('p2', 0, 1, 1), human('p3', 1, 2, 2), human('p4', 1, 3, 3)],
      botHumans: true,
      maxTicks: 34 * 60 * 20,
    });
    expectAgreement(r, '2v2');
  }, 900_000);

  it('AI fill-in: an unclaimed slot played by the local AI stays identical on every client', () => {
    /**
     * THE AI-FILL PROPERTY. One human peer and one AI seat that is NOT networked: every client computes it from
     * the same state through `stepSimulation`'s aiHook. If the AI were not a pure function of state, the two peers
     * would diverge on its first decision. This asserts the outcome — both peers still agree — which is the only
     * thing that matters to a player.
     */
    const r = runMatchThroughRelay({
      registry: loadRegistry(),
      mapId: 'duel_glade',
      seed: 1035,
      peers: [human('p1', 0, 0, 0)],
      aiSlots: [
        { id: 'p2', controller: 'ai', aiDifficulty: 'hard', team: 1, color: COLORS[1]!, factionId: 'arcane', startIndex: 1 },
      ],
      botHumans: true,
      maxTicks: 34 * 60 * 20,
    });
    expectAgreement(r, 'human + AI fill');
  }, 900_000);

  it('quantifies the number of checksum comparisons, so "0 desyncs" is not vacuous', () => {
    const r = runMatchThroughRelay({
      registry: loadRegistry(),
      mapId: 'duel_glade',
      seed: 1042,
      peers: [human('p1', 0, 0, 0), human('p2', 1, 1, 1)],
      botHumans: true,
      maxTicks: 34 * 60 * 20,
    });
    const comparisons = Math.floor(r.outcomes[0]!.finalTick / CHECKSUM_INTERVAL_TICKS);
    // Every peer compared its hash at every interval; a full match must clear a meaningful sample.
    expect(comparisons).toBeGreaterThan(150);
    expect(r.desyncEvents).toEqual([]);
    expect(r.inSync).toBe(true);
  }, 900_000);
});
