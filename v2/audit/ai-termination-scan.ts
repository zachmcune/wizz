// TERMINATION SCAN: does every seed end, and by when?
//
// Phase 5 requires that no match runs past ~30 minutes and that the AI never stalls. This runs one matchup across many
// seeds in parallel and reports, per seed, whether the match ended and at what sim-minute, so a non-terminating seed is
// identified by number rather than discovered by a slow full tournament.
import { runPool, type Job } from './ai-tournament-parallel';
import type { MatchResult } from './ai-tournament';

const seedsArg = process.argv[process.argv.indexOf('--seeds') + 1] ?? '1000';
const seeds = seedsArg.split(',').map(Number).filter(Number.isFinite);
const maxMinutes = Number(process.argv[process.argv.indexOf('--minutes') + 1] ?? 32);
const jobs = Number(process.argv[process.argv.indexOf('--jobs') + 1] ?? 4);
const a = process.argv[process.argv.indexOf('--a') + 1] ?? 'normal';
const b = process.argv[process.argv.indexOf('--b') + 1] ?? 'normal';

const work: Job[] = seeds.map((seed) => ({
  seed,
  maxMinutes,
  players: [
    { id: 'p1', difficulty: a as never, team: 0, faction: 'arcane', startIndex: 0 },
    { id: 'p2', difficulty: b as never, team: 1, faction: 'arcane', startIndex: 1 },
  ],
}));

const results = await runPool(work, jobs);
const rows: string[] = [];
let unfinished = 0;
for (const r of results as MatchResult[]) {
  if (!r.ended) unfinished++;
  const stalls = r.sides.map((s) => s.stall);
  const worstNoSpend = Math.max(...stalls.map((x) => x.longestNoSpendSeconds));
  const worstIdle = Math.max(...stalls.map((x) => x.longestIdleArmySeconds));
  rows.push(
    `${String(r.seed).padStart(5)} ended=${r.ended ? 'yes' : 'NO '} ${r.minutes.toFixed(1).padStart(5)}min` +
      ` worstNoSpend=${String(worstNoSpend).padStart(4)}s worstIdleArmy=${String(worstIdle).padStart(4)}s` +
      ` winner=${r.winnerTeam ?? '-'} entities=${r.sides.reduce((a, s) => a + s.units + s.buildings, 0)}`,
  );
}
console.log(rows.sort().join('\n'));
const mins = (results as MatchResult[]).map((r) => r.minutes).sort((x, y) => x - y);
console.log(`\n${a} vs ${b}: ${results.length - unfinished}/${results.length} ended; median ${mins[Math.floor(mins.length / 2)]?.toFixed(1)} min; worst ${mins.at(-1)?.toFixed(1)} min`);
process.exit(unfinished > 0 ? 1 : 0);
