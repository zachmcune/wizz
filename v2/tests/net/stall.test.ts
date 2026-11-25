// STALL POLICY — the three cases must be told apart, because two of them must NOT alarm the player.
//
// These are pure-function tests, so they cover every branch exhaustively in microseconds rather than waiting on
// real timers. The cases are the ones the Phase 6 brief names explicitly:
//
//   • background/resume must not trip the stall banner;
//   • a genuine stall must;
//   • catching up after a hitch is neither, and says "syncing" instead.
import { describe, expect, it } from 'vitest';
import { evaluateStall, STALL_HINT, SYNCING_HINT, SYNCING_BACKLOG } from '../../src/net/stall';
import { LOCKSTEP_STALL_MS, LOCKSTEP_STALL_JUMP_MS } from '../../src/net/protocol-constants';

const base = {
  hasReceivedTicks: true,
  matchEnded: false,
  documentHidden: false,
  msSinceLastTick: 50,
  backlog: 0,
} as const;

describe('stall policy', () => {
  it('says nothing while ticks are flowing', () => {
    const d = evaluateStall({ ...base });
    expect(d.hint).toBe('');
    expect(d.reason).toBe('clear');
    expect(d.resetStallClock).toBe(false);
  });

  it('says nothing before the first tick arrives — there is nothing to be stalled from yet', () => {
    const d = evaluateStall({ ...base, hasReceivedTicks: false, msSinceLastTick: 60_000 });
    expect(d.hint).toBeNull();
    expect(d.reason).toBe('no-ticks');
  });

  it('says nothing once the match has ended', () => {
    const d = evaluateStall({ ...base, matchEnded: true, msSinceLastTick: 60_000 });
    expect(d.hint).toBeNull();
    expect(d.reason).toBe('ended');
  });

  it('a BACKGROUNDED TAB does not show the stall banner, and its hidden time is not counted', () => {
    /**
     * THE CASE THE BRIEF CALLS OUT. A player switches tabs for two minutes; the wall clock jumped, but the relay
     * was fine. Showing "connection stalled" here blames the player for something that did not happen.
     */
    const d = evaluateStall({ ...base, documentHidden: true, msSinceLastTick: 120_000 });
    expect(d.hint).not.toBe(STALL_HINT);
    expect(d.hint).toBe('');
    expect(d.reason).toBe('hidden');
    // The elapsed hidden time must be forgiven, or the banner appears the instant the tab is shown.
    expect(d.resetStallClock).toBe(true);
  });

  it('a single huge gap is a tab FREEZE, not a disconnect: forgiven, not reported', () => {
    const d = evaluateStall({ ...base, msSinceLastTick: LOCKSTEP_STALL_MS + LOCKSTEP_STALL_JUMP_MS });
    expect(d.hint).toBe('');
    expect(d.reason).toBe('freeze-jump');
    expect(d.resetStallClock).toBe(true);
  });

  it('a GENUINE stall past the threshold does show the banner', () => {
    const d = evaluateStall({ ...base, msSinceLastTick: LOCKSTEP_STALL_MS });
    expect(d.hint).toBe(STALL_HINT);
    expect(d.reason).toBe('stalled');
    // A real stall is not forgiven: the clock keeps counting, so the banner persists until ticks resume.
    expect(d.resetStallClock).toBe(false);
  });

  it('a gap just under the threshold is still silent', () => {
    const d = evaluateStall({ ...base, msSinceLastTick: LOCKSTEP_STALL_MS - 1 });
    expect(d.hint).toBe('');
    expect(d.reason).toBe('clear');
  });

  it('a large backlog with ticks still arriving says "syncing", not "stalled"', () => {
    const d = evaluateStall({ ...base, backlog: SYNCING_BACKLOG + 1 });
    expect(d.hint).toBe(SYNCING_HINT);
    expect(d.reason).toBe('catching-up');
    expect(d.hint).not.toBe(STALL_HINT);
  });

  it('ordering: a hidden document wins over a large backlog, so resuming does not flash "syncing"', () => {
    const d = evaluateStall({ ...base, documentHidden: true, backlog: SYNCING_BACKLOG * 4 });
    expect(d.reason).toBe('hidden');
  });

  it('ordering: a freeze jump wins over the stall threshold it also exceeds', () => {
    // This gap satisfies BOTH `>= STALL_MS` and `>= STALL_MS + JUMP_MS`; the larger test must win.
    const d = evaluateStall({ ...base, msSinceLastTick: LOCKSTEP_STALL_MS + LOCKSTEP_STALL_JUMP_MS + 5_000 });
    expect(d.reason).toBe('freeze-jump');
    expect(d.hint).not.toBe(STALL_HINT);
  });
});
