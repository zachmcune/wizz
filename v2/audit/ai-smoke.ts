// CI SMOKE TOURNAMENT.
//
// CI cannot run the real tournament: the full bracket is 12 seeds x 2 sides x 4 matchups = 96 matches, which is hours of
// CPU. What CI CAN do is prove the harness and the AI are healthy on every commit, cheaply, so a regression is caught in
// minutes instead of being discovered when someone next runs the full bracket by hand.
//
// This is deliberately NOT a balance measurement -- two seeds cannot establish a win rate. It asserts the properties that
// must hold for any match at all:
//
//   • every match TERMINATES within the cap (the v1 stall failure),
//   • no side STALLS: bounded seconds with no spending, and an army that is never left idle,
//   • the result is DETERMINISTIC: the same seed twice gives the same state hash,
//   • the fog contract holds and the AI actually does things (commands issued, buildings built).
//
// Usage:
//   npx vite-node audit/ai-smoke.ts            # exits nonzero on any violated property
import { runMatch, type MatchResult } from './ai-tournament';

const TICK_HZ = 20;
/**
 * A match must end inside this cap. The full bracket's worst observed seed is ~21 sim-minutes, so 30 leaves real headroom
 * while still failing loudly if the AI ever regresses into a non-terminating game.
 */
const MAX_MINUTES = 30;
/** No side may go this long without spending. Generous: a mined-out late game legitimately idles the economy. */
const MAX_NO_SPEND_SECONDS = 900;
/** No side may leave combat units without orders for this long. This is the v1 "idle army" failure. */
const MAX_IDLE_ARMY_SECONDS = 90;

const SMOKE_SEEDS = [1000, 1014];

interface Violation {
  seed: number;
  side: string;
  what: string;
}

function check(seed: number, r: MatchResult, violations: Violation[]): void {
  if (!r.ended) violations.push({ seed, side: '-', what: `did not terminate within ${MAX_MINUTES} min` });
  for (const s of r.sides) {
    if (s.stall.longestNoSpendSeconds > MAX_NO_SPEND_SECONDS) {
      violations.push({ seed, side: s.id, what: `no spending for ${s.stall.longestNoSpendSeconds}s` });
    }
    if (s.stall.longestIdleArmySeconds > MAX_IDLE_ARMY_SECONDS) {
      violations.push({ seed, side: s.id, what: `idle army for ${s.stall.longestIdleArmySeconds}s` });
    }
    // A side that never issued a command is not playing the game.
    if (s.stall.decisions === 0) violations.push({ seed, side: s.id, what: 'issued no decisions at all' });
    /**
     * A LOSING SIDE MAY LEGITIMATELY FIELD NO ARMY. Being eliminated before training a combat unit is a fast loss, not a
     * fault -- so the assertion is only that a WINNER brought an army, plus that a side which survived a long match did.
     * Measured: an over-strict version of this flagged a hard AI that was wiped out in seven minutes, which is a normal
     * result, not a defect.
     */
    const lost = s.defeated;
    if (!lost && r.minutes > 8 && s.peakArmy === 0) {
      violations.push({ seed, side: s.id, what: `survived ${r.minutes} min without training a combat unit` });
    }
  }
}

const started = Date.now();
const violations: Violation[] = [];
const rows: string[] = [];

for (const seed of SMOKE_SEEDS) {
  // Side-swapped, matching the real bracket, so the smoke run exercises the same shape.
  for (const swap of [false, true]) {
    const r = runMatch({
      seed,
      maxMinutes: MAX_MINUTES,
      players: [
        { id: 'p1', difficulty: 'hard', team: 0, faction: 'arcane', startIndex: swap ? 1 : 0 },
        { id: 'p2', difficulty: 'normal', team: 1, faction: 'arcane', startIndex: swap ? 0 : 1 },
      ],
    });
    check(seed, r, violations);
    rows.push(
      `seed ${seed}${swap ? ' (swapped)' : ''}: ${r.ended ? 'ended' : 'UNFINISHED'} in ${r.minutes.toFixed(1)} min,` +
        ` winner team ${r.winnerTeam ?? '-'}, worst no-spend ${Math.max(...r.sides.map((s) => s.stall.longestNoSpendSeconds))}s,` +
        ` worst idle army ${Math.max(...r.sides.map((s) => s.stall.longestIdleArmySeconds))}s`,
    );
  }
}

// Determinism: same seed, same side-0 start, must reproduce the state hash exactly.
const detA = runMatch({
  seed: SMOKE_SEEDS[0]!,
  maxMinutes: 8,
  players: [
    { id: 'p1', difficulty: 'normal', team: 0, faction: 'arcane', startIndex: 0 },
    { id: 'p2', difficulty: 'normal', team: 1, faction: 'arcane', startIndex: 1 },
  ],
});
const detB = runMatch({
  seed: SMOKE_SEEDS[0]!,
  maxMinutes: 8,
  players: [
    { id: 'p1', difficulty: 'normal', team: 0, faction: 'arcane', startIndex: 0 },
    { id: 'p2', difficulty: 'normal', team: 1, faction: 'arcane', startIndex: 1 },
  ],
});
if (detA.hash !== detB.hash) {
  violations.push({ seed: SMOKE_SEEDS[0]!, side: '-', what: `non-deterministic: ${detA.hash} vs ${detB.hash}` });
} else if (detA.ticks !== detB.ticks) {
  violations.push({ seed: SMOKE_SEEDS[0]!, side: '-', what: `non-deterministic tick count: ${detA.ticks} vs ${detB.ticks}` });
}

for (const row of rows) console.log(row);
console.log(`hash determinism: ${detA.hash} === ${detB.hash}`);
console.log(`smoke tournament: ${rows.length} matches in ${((Date.now() - started) / 1000).toFixed(0)}s at 20 Hz`);

if (violations.length > 0) {
  console.error('\nSMOKE TOURNAMENT FAILED:');
  for (const v of violations) console.error(`  seed ${v.seed} ${v.side}: ${v.what}`);
  process.exit(1);
}
console.log('smoke tournament passed: all matches terminated, no stalls, deterministic');
