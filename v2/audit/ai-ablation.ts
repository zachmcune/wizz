// DIFFICULTY LEVER ABLATION.
//
// Phase 5 requires that each difficulty knob's effect be MEASURED rather than asserted. This runs the same bracketed matchup
// (both sides per seed, so the measured first-player bias cancels) with one lever forced on or off, and reports the win rate
// against a fixed reference difficulty.
//
// The point is to answer "which decisions actually make an AI stronger", not to produce a plausible-looking table. A lever
// whose ablation moves the win rate by less than the noise floor is reported as such, and is a candidate for removal from the
// difficulty design.
//
// Usage:
//   npx vite-node audit/ai-ablation.ts                    # all levers, Easy reference
//   npx vite-node audit/ai-ablation.ts --ref normal        # against Normal instead
//   npx vite-node audit/ai-ablation.ts --seeds 1000,1007   # a specific seed set
//   npx vite-node audit/ai-ablation.ts --json out.json
import { writeFileSync } from 'node:fs';
import { runPool, type Job } from './ai-tournament-parallel';
import type { Difficulty, MatchResult } from './ai-tournament';

const argv = process.argv.slice(2);
const arg = (name: string, dflt: string): string => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? (argv[i + 1] ?? dflt) : dflt;
};

const seeds = arg('seeds', '1000,1007,1014,1021,1028,1035')
  .split(',')
  .map(Number)
  .filter(Number.isFinite);
const ref = arg('ref', 'easy') as Difficulty;
const subject = arg('subject', 'normal') as Difficulty;
const maxMinutes = Number(arg('minutes', '30'));
const jobs = Number(arg('jobs', '4'));
const outIdx = argv.indexOf('--json');
const out = outIdx >= 0 ? argv[outIdx + 1] : undefined;

/**
 * The levers a difficulty profile exposes.
 *
 * Each is a decision the AI makes, not a stat or a resource: that is the whole premise of the difficulty design, so a lever
 * that turned out to be pure handicap would have no place here.
 */
const LEVERS = [
  'focusFire',
  'retreatHurtUnits',
  'kiting',
  'counters',
  'scouts',
  'harass',
  'buildsDefenses',
  'usesSuperweapon',
] as const;

type Lever = (typeof LEVERS)[number];

interface Result {
  lever: Lever;
  on: { wins: number; losses: number; draws: number; medianMinutes: number };
  off: { wins: number; losses: number; draws: number; medianMinutes: number };
}

function summarise(results: MatchResult[]): { wins: number; losses: number; draws: number; medianMinutes: number } {
  // `subject` is always team 0 in the jobs below, so a team-0 win is a win for it.
  let wins = 0;
  let losses = 0;
  let draws = 0;
  for (const r of results) {
    if (r.winnerTeam === 0) wins++;
    else if (r.winnerTeam === 1) losses++;
    else draws++;
  }
  const mins = results.map((r) => r.minutes).sort((a, b) => a - b);
  return { wins, losses, draws, medianMinutes: mins[Math.floor(mins.length / 2)] ?? 0 };
}

/** Both start corners for every seed, so the measured first-player bias cancels exactly as it does in the bracket. */
function bracketJobs(): Omit<Job, 'players'>[] {
  return seeds.flatMap((seed) => [
    { seed, maxMinutes },
    { seed, maxMinutes },
  ]);
}

async function measure(lever: Lever, enabled: boolean): Promise<ReturnType<typeof summarise>> {
  const base = bracketJobs();
  const work: Job[] = base.map((job, i) => {
    const swapped = i % 2 === 1;
    return {
      ...job,
      players: [
        {
          id: 'p1',
          difficulty: subject,
          team: 0,
          faction: 'arcane',
          startIndex: swapped ? 1 : 0,
          // The lever under test, forced for the subject only.
          aiOverrides: { [lever]: enabled },
        },
        { id: 'p2', difficulty: ref, team: 1, faction: 'arcane', startIndex: swapped ? 0 : 1 },
      ],
    };
  });
  const results = await runPool(work, jobs);
  return summarise(results);
}

console.log(`Ablating ${subject} vs ${ref} over ${seeds.length} seeds x 2 sides.`);
console.log('Each row: the subject difficulty with ONE lever forced on, then off.\n');

const outRows: Result[] = [];
for (const lever of LEVERS) {
  const on = await measure(lever, true);
  const off = await measure(lever, false);
  outRows.push({ lever, on, off });
  const delta = on.wins - off.wins;
  console.log(
    `${lever.padEnd(18)} ON ${on.wins}-${on.losses}-${on.draws}`.padEnd(34) +
      `OFF ${off.wins}-${off.losses}-${off.draws}`.padEnd(20) +
      `delta ${delta >= 0 ? '+' : ''}${delta}`,
  );
}

/** Sample size, so a reader can judge whether a delta means anything. */
const games = seeds.length * 2;
console.log(`\n${games} games per condition. A delta smaller than about 2 wins at this sample size is noise.`);

if (out) {
  writeFileSync(
    out,
    JSON.stringify({ generatedAt: new Date().toISOString(), subject, ref, seeds, games, rows: outRows }, null, 2),
  );
  console.log(`wrote ${out}`);
}
