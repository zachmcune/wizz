// HUD stall / catch-up policy for lockstep. Pure: no DOM writes, no sim state.
import { LEAD_TICKS, LOCKSTEP_STALL_JUMP_MS, LOCKSTEP_STALL_MS } from './protocol';

export const LOCKSTEP_STALL_HINT = 'Connection stalled — check network or rejoin the match';
export const LOCKSTEP_SYNCING_HINT = 'Syncing…';

/** Backlog (in ticks) above which we show a non-scary catch-up hint instead of stalling. */
export const LOCKSTEP_SYNCING_BACKLOG = LEAD_TICKS * 2;

export type LockstepStallFlags = {
  stallShown: boolean;
  syncingShown: boolean;
};

export type LockstepStallInput = {
  hasReceivedTicks: boolean;
  matchEnded: boolean;
  documentHidden: boolean;
  msSinceLastTick: number;
  backlog: number;
};

export type LockstepStallDecision = {
  stallShown: boolean;
  syncingShown: boolean;
  /** `null` = leave HUD as-is; `''` = hide the banner; otherwise set the banner text. */
  hint: string | null;
  /** Wall-clock jump or hidden tab: restart the stall timer so freeze time does not accrue. */
  resetStallClock: boolean;
};

export function isDocumentHidden(
  doc: { visibilityState?: string } | null | undefined = typeof document !== 'undefined' ? document : undefined,
): boolean {
  return !!doc && doc.visibilityState !== 'visible';
}

function catchUpHint(flags: LockstepStallFlags, backlog: number): LockstepStallDecision {
  if (backlog > LOCKSTEP_SYNCING_BACKLOG) {
    const replaceStall = flags.stallShown || !flags.syncingShown;
    return {
      stallShown: false,
      syncingShown: true,
      hint: replaceStall ? LOCKSTEP_SYNCING_HINT : null,
      resetStallClock: false,
    };
  }
  return {
    stallShown: false,
    syncingShown: false,
    hint: flags.stallShown || flags.syncingShown ? '' : null,
    resetStallClock: false,
  };
}

/**
 * Decide whether to show, replace, or clear the lockstep stall / syncing HUD.
 * Hidden documents never flash the stall banner. A single-frame wall-clock jump
 * (backgrounded tab resume) resets the timer instead of counting as a disconnect.
 */
export function evaluateLockstepStall(
  flags: LockstepStallFlags,
  input: LockstepStallInput,
): LockstepStallDecision {
  if (!input.hasReceivedTicks || input.matchEnded) {
    return {
      stallShown: false,
      syncingShown: false,
      hint: flags.stallShown || flags.syncingShown ? '' : null,
      resetStallClock: false,
    };
  }

  if (input.documentHidden) {
    return {
      stallShown: false,
      syncingShown: flags.syncingShown,
      hint: flags.stallShown ? '' : null,
      resetStallClock: true,
    };
  }

  const gap = input.msSinceLastTick;
  if (gap >= LOCKSTEP_STALL_MS + LOCKSTEP_STALL_JUMP_MS) {
    return {
      stallShown: false,
      syncingShown: flags.syncingShown,
      hint: flags.stallShown ? '' : null,
      resetStallClock: true,
    };
  }

  if (gap >= LOCKSTEP_STALL_MS) {
    return {
      stallShown: true,
      syncingShown: false,
      hint: flags.stallShown ? null : LOCKSTEP_STALL_HINT,
      resetStallClock: false,
    };
  }

  return catchUpHint(flags, input.backlog);
}
