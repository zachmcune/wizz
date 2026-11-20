// TOURNAMENT CLI.
//
// Kept in its own module because vite-node does not put the script path in `process.argv`, so an in-file
// "am I the entry point?" guard can never fire. Importing this module runs it; nothing else imports it.
//
// Usage:
//   npx vite-node audit/ai-tournament-cli.ts --seeds 12|1000,1014 --minutes 35 --json out.json [--jobs 4]
import { writeFileSync } from 'node:fs';
import type { Difficulty, MatchResult, MatchupSummary } from './ai-tournament';
import { runPool, summarise, type Job } from './ai-tournament-parallel';

const argv = process.argv.slice(2);

function argOf(name: string, dflt: number): number {
  const i = argv.indexOf(`--${name}`);
  const v = i >= 0 ? Number(argv[i + 1]) : dflt;
  return Number.isFinite(v) ? v : dflt;
}

/**
 * Seed list: either an explicit comma-separated list (`--seeds 1000,1014,1028`) or a count of evenly spaced seeds
 * (`--seeds 12`). The explicit form matters because a count silently changes which seeds a proof run covered.
 */
function seedList(arg: string | undefined): number[] {
  if (arg && arg.includes(',')) {
    return arg
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n));
  }
  const count = Number(arg ?? 12);
  return Array.from({ length: Number.isFinite(count) ? count : 12 }, (_, i) => 1000 + i * 7);
}

const maxMinutes = argOf('minutes', 35);
const concurrency = argOf('jobs', 4);
const seedsArg = argv.includes('--seeds') ? argv[argv.indexOf('--seeds') + 1] : String(argOf('seeds', 12));
const seeds = seedList(seedsArg);
const outIdx = argv.indexOf('--json');
const out = outIdx >= 0 ? argv[outIdx + 1] : undefined;

/**
 * The default bracket. Hard/normal and normal/easy establish the difficulty ordering; hard/easy is the widest gap in the
 * profile table; normal/normal is the mirror match, which is where a stalled or nondeterministic AI shows up first.
 */
const matchups: [Difficulty, Difficulty][] = [
  ['hard', 'normal'],
  ['normal', 'easy'],
  ['hard', 'easy'],
  ['normal', 'normal'],
];

const started = Date.now();
const summaries: MatchupSummary[] = [];
const allResults: Record<string, MatchResult[]> = {};

for (const [a, b] of matchups) {
  const jobs: Job[] = seeds.map((seed) => ({
    seed,
    maxMinutes,
    players: [
      { id: 'p1', difficulty: a, team: 0, faction: 'arcane', startIndex: 0 },
      { id: 'p2', difficulty: b, team: 1, faction: 'arcane', startIndex: 1 },
    ],
  }));
  let lastLogged = 0;
  const results = await runPool(jobs, concurrency, (done, total) => {
    if (done === total || done - lastLogged >= Math.max(1, Math.floor(total / 4))) {
      lastLogged = done;
      console.log(`  ${a} vs ${b}: ${done}/${total} matches`);
    }
  });
  const s = summarise(`${a} vs ${b}`, a, b, results);
  summaries.push(s);
  allResults[s.label] = results;
  console.log(
    `${s.label.padEnd(18)} A ${s.winsA} - ${s.winsB} B  draws ${s.draws}  unfinished ${s.unfinished}` +
      `  winRateA ${(s.winRateA * 100).toFixed(0)}%  median ${s.medianMinutes} min` +
      `  worstNoSpend ${s.worstNoSpendSeconds}s`,
  );
}

console.log(`\ntotal wall time ${((Date.now() - started) / 60000).toFixed(1)} min across ${concurrency} workers`);
if (out) {
  writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), summaries, results: allResults }, null, 2));
  console.log(`wrote ${out}`);
}
