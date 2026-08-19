import { describe, expect, it } from 'vitest';
import {
  LEAD_TICKS,
  LOCKSTEP_STALL_JUMP_MS,
  LOCKSTEP_STALL_MS,
  RELAY_TICK_MS,
  SNAPSHOT_RESYNC_TICKS,
  STALL_DROP_MS,
} from '../src/net/protocol';
import {
  evaluateLockstepStall,
  isDocumentHidden,
  LOCKSTEP_STALL_HINT,
  LOCKSTEP_SYNCING_BACKLOG,
  LOCKSTEP_SYNCING_HINT,
  type LockstepStallFlags,
} from '../src/net/lockstep-stall';

const idle: LockstepStallFlags = { stallShown: false, syncingShown: false };
const stalled: LockstepStallFlags = { stallShown: true, syncingShown: false };
const syncing: LockstepStallFlags = { stallShown: false, syncingShown: true };

const flowing = {
  hasReceivedTicks: true,
  matchEnded: false,
  documentHidden: false,
  msSinceLastTick: 40,
  backlog: 0,
};

describe('lockstep stall budgets (Chromebook / school wifi)', () => {
  const leadMs = LEAD_TICKS * RELAY_TICK_MS;
  const wifiBlipMs = 8_000;

  it('keeps LEAD_TICKS large enough to absorb a 2s timer hitch', () => {
    expect(leadMs).toBeGreaterThanOrEqual(2_000);
  });

  it('does not flash the stall banner or drop a peer during an 8s wifi blip', () => {
    const pauseDuringBlip = Math.max(0, wifiBlipMs - leadMs);
    expect(pauseDuringBlip).toBeLessThan(LOCKSTEP_STALL_MS);
    expect(STALL_DROP_MS).toBeGreaterThan(wifiBlipMs);
  });

  it('still shows a stall banner before dropping a truly silent peer', () => {
    const pauseBeforeDrop = STALL_DROP_MS - leadMs;
    expect(LOCKSTEP_STALL_MS).toBeLessThan(pauseBeforeDrop);
  });

  it('does not snapshot-resync a peer that was only at the pacing limit', () => {
    expect(SNAPSHOT_RESYNC_TICKS).toBeGreaterThan(LEAD_TICKS);
  });
});

describe('evaluateLockstepStall', () => {
  it('does nothing before the first relay tick', () => {
    const d = evaluateLockstepStall(idle, { ...flowing, hasReceivedTicks: false, msSinceLastTick: 60_000 });
    expect(d.hint).toBeNull();
    expect(d.stallShown).toBe(false);
    expect(d.resetStallClock).toBe(false);
  });

  it('clears leftover HUD when the match has ended', () => {
    const d = evaluateLockstepStall(stalled, { ...flowing, matchEnded: true });
    expect(d.hint).toBe('');
    expect(d.stallShown).toBe(false);
  });

  it('does not show the stall banner for a 5–8s wifi hitch', () => {
    for (const gap of [5_000, 8_000]) {
      const d = evaluateLockstepStall(idle, { ...flowing, msSinceLastTick: gap });
      expect(d.hint).toBeNull();
      expect(d.stallShown).toBe(false);
    }
  });

  it('shows the stall banner once a real disconnect crosses LOCKSTEP_STALL_MS', () => {
    const d = evaluateLockstepStall(idle, { ...flowing, msSinceLastTick: LOCKSTEP_STALL_MS });
    expect(d.hint).toBe(LOCKSTEP_STALL_HINT);
    expect(d.stallShown).toBe(true);
    expect(d.resetStallClock).toBe(false);
  });

  it('does not re-emit the stall banner while it is already showing', () => {
    const d = evaluateLockstepStall(stalled, { ...flowing, msSinceLastTick: LOCKSTEP_STALL_MS + 200 });
    expect(d.hint).toBeNull();
    expect(d.stallShown).toBe(true);
  });

  it('clears the stall banner once ticks resume', () => {
    const d = evaluateLockstepStall(stalled, flowing);
    expect(d.hint).toBe('');
    expect(d.stallShown).toBe(false);
    expect(d.syncingShown).toBe(false);
  });

  it('replaces the stall banner with Syncing… when ticks resume behind the head', () => {
    const d = evaluateLockstepStall(stalled, { ...flowing, backlog: LOCKSTEP_SYNCING_BACKLOG + 1 });
    expect(d.hint).toBe(LOCKSTEP_SYNCING_HINT);
    expect(d.stallShown).toBe(false);
    expect(d.syncingShown).toBe(true);
  });

  it('shows Syncing… while catching up and clears it when caught up', () => {
    const behind = evaluateLockstepStall(idle, { ...flowing, backlog: LOCKSTEP_SYNCING_BACKLOG + 1 });
    expect(behind.hint).toBe(LOCKSTEP_SYNCING_HINT);
    const caught = evaluateLockstepStall(syncing, flowing);
    expect(caught.hint).toBe('');
    expect(caught.syncingShown).toBe(false);
  });

  it('never shows the stall banner while the document is hidden', () => {
    const d = evaluateLockstepStall(idle, {
      ...flowing,
      documentHidden: true,
      msSinceLastTick: 60_000,
    });
    expect(d.hint).toBeNull();
    expect(d.stallShown).toBe(false);
    expect(d.resetStallClock).toBe(true);
  });

  it('clears an existing stall banner when the tab is hidden', () => {
    const d = evaluateLockstepStall(stalled, {
      ...flowing,
      documentHidden: true,
      msSinceLastTick: 60_000,
    });
    expect(d.hint).toBe('');
    expect(d.stallShown).toBe(false);
    expect(d.resetStallClock).toBe(true);
  });

  it('treats a Date.now() jump on resume as a clock reset, not a stall', () => {
    const jump = LOCKSTEP_STALL_MS + LOCKSTEP_STALL_JUMP_MS;
    const d = evaluateLockstepStall(idle, { ...flowing, msSinceLastTick: jump });
    expect(d.hint).toBeNull();
    expect(d.stallShown).toBe(false);
    expect(d.resetStallClock).toBe(true);
  });

  it('clears a stall banner after a wall-clock jump', () => {
    const jump = LOCKSTEP_STALL_MS + LOCKSTEP_STALL_JUMP_MS;
    const d = evaluateLockstepStall(stalled, { ...flowing, msSinceLastTick: jump });
    expect(d.hint).toBe('');
    expect(d.resetStallClock).toBe(true);
  });
});

describe('isDocumentHidden', () => {
  it('is false when document is missing (headless tests)', () => {
    expect(isDocumentHidden(undefined)).toBe(false);
    expect(isDocumentHidden(null)).toBe(false);
  });

  it('is true only when visibilityState is not visible', () => {
    expect(isDocumentHidden({ visibilityState: 'visible' })).toBe(false);
    expect(isDocumentHidden({ visibilityState: 'hidden' })).toBe(true);
    expect(isDocumentHidden({ visibilityState: 'prerender' })).toBe(true);
  });
});
