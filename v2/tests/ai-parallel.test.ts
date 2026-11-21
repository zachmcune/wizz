// PARALLELISM MUST NOT CHANGE THE GAME.
//
// The tournament runs dozens of matches across four worker processes to keep wall time sane. That is only legitimate if a
// match produces exactly the same result no matter what else is running — otherwise the win-rate table would be measuring
// scheduling noise.
//
// It should hold by construction: `stepSimulation` is a deterministic pure step over `GameState`, the RNG is a named-stream
// PRNG seeded from the match seed, and the AI reads only its own `Perception`. Nothing in a match touches wall-clock time,
// the DOM, or any module-level mutable state that a second concurrent match could see.
//
// "Should" is not "does", so this asserts it: the same job is run serially in-process and again through the child-process
// pool, and the outcome hash, tick count and per-side numbers must match exactly.
//
// The match is deliberately short (a few sim-minutes) so this stays cheap enough for CI, while still exercising every
// system that matters: economy, production, pathing, combat, fog and the AI planners.
import { describe, expect, it } from 'vitest';
import { runMatch, type MatchResult } from '../audit/ai-tournament';
import { runPool } from '../audit/ai-tournament-parallel';

/** How far to run the equivalence match. Long enough for both sides to build, expand and fight. */
const MINUTES = 6;

const JOB = {
  seed: 20250101,
  maxMinutes: MINUTES,
  players: [
    { id: 'p1', difficulty: 'normal' as const, team: 0, faction: 'arcane', startIndex: 0 },
    { id: 'p2', difficulty: 'normal' as const, team: 1, faction: 'arcane', startIndex: 1 },
  ],
};

/** Everything about a match that a player could observe. */
function fingerprint(m: MatchResult): string {
  return JSON.stringify({
    ended: m.ended,
    winnerTeam: m.winnerTeam,
    ticks: m.ticks,
    hash: m.hash,
    sides: m.sides.map((s) => ({ id: s.id, units: s.units, buildings: s.buildings, peakArmy: s.peakArmy, spent: s.spent })),
  });
}

describe('parallel matches are identical to serial ones', () => {
  it('the same job produces the same outcome hash in-process and through the worker pool', async () => {
    const serial = runMatch(JOB);
    const [parallel] = await runPool([JOB], 1);
    expect(parallel, 'the worker pool returned nothing').toBeDefined();
    // The decisive assertion: a full-state fingerprint, not just the winner.
    expect(fingerprint(parallel!)).toBe(fingerprint(serial));
    // And state it explicitly, so a failure message names the hash rather than a diff of a long string.
    expect(parallel!.hash, 'hash differs between serial and parallel execution').toBe(serial.hash);
    expect(parallel!.ticks).toBe(serial.ticks);
  }, 600_000);

  it('two jobs scheduled concurrently do not interfere', async () => {
    /**
     * The failure mode this catches is shared mutable state: if any module cached something per-match (a flow field, a nav
     * grid, a planner's memory) at module scope, running two matches at once would corrupt one of them and the hash would
     * drift.
     *
     * Two different seeds are run together and compared against the same seeds run alone.
     */
    const a = { ...JOB, seed: 5550001 };
    const b = { ...JOB, seed: 5550002, maxMinutes: 3 };
    const shortA = { ...a, maxMinutes: 3 };

    const serialA = runMatch(shortA);
    const serialB = runMatch(b);
    // Now run the pair CONCURRENTLY through the pool.
    const [parA, parB] = await runPool([shortA, b], 2);

    expect(parA!.hash, 'seed 5550001 changed when run alongside another match').toBe(serialA.hash);
    expect(parB!.hash, 'seed 5550002 changed when run alongside another match').toBe(serialB.hash);
  }, 900_000);
});
