// STALL POLICY — decide when "no ticks arriving" means a hint, a catch-up, or a real disconnect.
//
// Pure by design: no DOM writes, no timers, no state. It takes a snapshot of the situation and returns what the
// HUD should show and whether the stall clock should be reset. That makes every branch testable in microseconds
// and lets the browser and the headless harness share one policy.
//
// THE HARD PART IS TELLING THREE THINGS APART, because they look identical from inside the loop:
//
//   1. A TAB WAS BACKGROUNDED. Browsers throttle or entirely suspend timers in a hidden tab, so on resume the
//      wall clock has jumped by seconds while the relay was fine the whole time. This must NOT show the stall
//      banner — the player did nothing wrong and the match is about to catch up normally.
//   2. A BRIEF HITCH. School wifi and Chromebook timer coalescing produce gaps of a few seconds. The relay's own
//      `STALL_DROP_MS` is 15 s precisely to absorb these, so the client should not panic before the relay would.
//   3. A GENUINE STALL. The relay stopped sending because this peer stopped acking, or the socket is dead. This is
//      the only case that should say so.
//
// The distinguishing signals are: is the document hidden, how big was the gap, and was the gap a SINGLE jump
// (a freeze) rather than continuous silence (a disconnect).

import { LEAD_TICKS, LOCKSTEP_STALL_JUMP_MS, LOCKSTEP_STALL_MS } from './protocol-constants';

export const STALL_HINT = 'Connection stalled — check your network or rejoin the match';
export const SYNCING_HINT = 'Syncing…';

/** Backlog above which the client is catching up rather than stalled. */
export const SYNCING_BACKLOG = LEAD_TICKS * 2;

export interface StallInput {
  /** False until the first tick arrives; before that there is nothing to be stalled from. */
  hasReceivedTicks: boolean;
  matchEnded: boolean;
  documentHidden: boolean;
  /** Milliseconds since the last tick message arrived. */
  msSinceLastTick: number;
  /** Confirmed ticks ahead of the simulated tick. */
  backlog: number;
}

export interface StallDecision {
  /** What the HUD should say. `null` means "leave it alone"; `''` means "clear it". */
  hint: string | null;
  /** True when the stall clock should be restarted (a freeze, not a disconnect). */
  resetStallClock: boolean;
  /** Why this decision was made, for the test assertions and the debug overlay. */
  reason: 'no-ticks' | 'ended' | 'hidden' | 'freeze-jump' | 'stalled' | 'catching-up' | 'clear';
}

/**
 * Decide what to do about the current gap.
 *
 * Order matters and follows the reasoning above: a hidden document and a freeze jump are both "not a stall" and
 * must be checked before the plain gap threshold, or a resume from background would flash a scary banner.
 */
export function evaluateStall(input: StallInput): StallDecision {
  if (input.matchEnded || !input.hasReceivedTicks) {
    return { hint: null, resetStallClock: false, reason: input.matchEnded ? 'ended' : 'no-ticks' };
  }

  if (input.documentHidden) {
    /**
     * A BACKGROUNDED TAB IS NEVER A STALL. Returning `resetStallClock` means the seconds spent hidden do not count
     * toward the stall threshold, so the player comes back to a normal match instead of a banner about a problem
     * that never happened.
     */
    return { hint: '', resetStallClock: true, reason: 'hidden' };
  }

  if (input.msSinceLastTick >= LOCKSTEP_STALL_MS + LOCKSTEP_STALL_JUMP_MS) {
    /**
     * A gap this large arriving as ONE step is a tab freeze or a wall-clock jump, not a network stall: a real
     * disconnect produces many small polls with no message, which the loop observes as `msSinceLastTick` growing
     * gradually past `LOCKSTEP_STALL_MS` while still below this combined threshold. Reset and say nothing.
     */
    return { hint: '', resetStallClock: true, reason: 'freeze-jump' };
  }

  if (input.msSinceLastTick >= LOCKSTEP_STALL_MS) {
    return { hint: STALL_HINT, resetStallClock: false, reason: 'stalled' };
  }

  if (input.backlog > SYNCING_BACKLOG) {
    /**
     * Far behind but still receiving: this is catch-up, which is normal after a hitch. Saying "stalled" here would
     * be wrong and alarming, and the client resolves it on its own.
     */
    return { hint: SYNCING_HINT, resetStallClock: false, reason: 'catching-up' };
  }

  return { hint: '', resetStallClock: false, reason: 'clear' };
}
