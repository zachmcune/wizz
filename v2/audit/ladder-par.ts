// A DIFFICULTY LADDER WITH WILSON INTERVALS — the measurement the brief asks for.
//
// `mirror-par.ts` answers "is the game fair"; this answers "is difficulty ordered", which is a different question with a
// different sample. Each cell plays N seeds TWICE with the two difficulties swapped between corners, so a corner effect
// cannot masquerade as a difficulty effect (the corner split is a known, measured, pre-existing bias — see
// docs/proof/phase-7/ai/README.md).
//
// Reports, per cell: the harder side's win rate with a 95% Wilson interval, unfinished count, and the median/mean length.
//
//   npx vite-node audit/ladder-par.ts --seeds 30 --minutes 34 --jobs 3
//   npx vite-node audit/ladder-par.ts --seeds 30 --minutes 34 --jobs 3 --json docs/proof/phase-7/ai/ladder.json
import { writeFileSync } from 'node:fs';
import { runPool, type Job } from './ai-tournament-parallel';
import type { MatchResult } from './ai-tournament';

const arg = (n: string, d: string): string => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : d;
};

const cells: [string, string][] = [
  ['hard', 'normal'],
  ['normal', 'easy'],
];
const seedCount = Number(arg('seeds', '30'));
const minutes = Number(arg('minutes', '34'));
const jobs = Number(arg('jobs', '3'));
/** First seed of the block; a different base gives an independent sample from the mirror run. */
const base = Number(arg('base', '3000'));
const seeds = Array.from({ length: seedCount }, (_, i) => base + i * 7);

const wilson = (k: number, n: number): [number, number] => {
  const p = k / n;
  const z = 1.96;
  const den = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / den;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den;
  return [Math.max(0, c - h), Math.min(1, c + h)];
};

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** One job per seed per assignment: the strong difficulty in corner b, then in corner a. */
const work: { job: Job; strong: string; weak: string }[] = [];
for (const [strong, weak] of cells) {
  for (const s of seeds) {
    for (const [sStrong, sWeak] of [
      [0, 1],
      [1, 0],
    ] as const) {
      work.push({
        strong,
        weak,
        job: {
          seed: s,
          maxMinutes: minutes,
          players: [
            { id: 'p1', difficulty: strong as never, team: 0, faction: 'arcane', startIndex: sStrong },
            { id: 'p2', difficulty: weak as never, team: 1, faction: 'arcane', startIndex: sWeak },
          ],
        },
      });
    }
  }
}

const results = (await runPool(
  work.map((w) => w.job),
  jobs,
  (d, t) => {
    if (d % 10 === 0 || d === t) process.stderr.write(`  ${d}/${t}\n`);
  },
)) as MatchResult[];

interface CellReport {
  strong: string;
  weak: string;
  n: number;
  strongWins: number;
  strongRate: number;
  ci: [number, number];
  unfinished: number;
  medianMinutes: number;
  meanMinutes: number;
  strongWinsCorner0: number;
  strongWinsCorner1: number;
}

const report: CellReport[] = [];
for (const [strong, weak] of cells) {
  const idx = work.map((w, i) => ({ w, i })).filter((x) => x.w.strong === strong && x.w.weak === weak);
  let wins = 0;
  let unfinished = 0;
  let c0 = 0;
  let c1 = 0;
  const lengths: number[] = [];
  for (const { w, i } of idx) {
    const r = results[i];
    if (!r) {
      unfinished++;
      continue;
    }
    lengths.push(r.minutes);
    if (!r.ended) unfinished++;
    // team 0 is always the strong side in `work`, so a team-0 win is a strong-side win.
    if (r.winnerTeam === 0) {
      wins++;
      if (work[i]!.job.players[0]!.startIndex === 0) c0++;
      else c1++;
    }
  }
  const n = idx.length;
  report.push({
    strong,
    weak,
    n,
    strongWins: wins,
    strongRate: Number((wins / n).toFixed(4)),
    ci: [Number(wilson(wins, n)[0].toFixed(4)), Number(wilson(wins, n)[1].toFixed(4))],
    unfinished,
    medianMinutes: Number(median(lengths).toFixed(1)),
    meanMinutes: Number((lengths.reduce((a, b) => a + b, 0) / Math.max(1, lengths.length)).toFixed(1)),
    strongWinsCorner0: c0,
    strongWinsCorner1: c1,
  });
}

for (const r of report) {
  console.log(
    `${r.strong}>${r.weak}: ${r.strongWins}/${r.n} = ${(r.strongRate * 100).toFixed(1)}%` +
      `  95% CI ${(r.ci[0] * 100).toFixed(1)}-${(r.ci[1] * 100).toFixed(1)}%` +
      `  unfinished ${r.unfinished}/${r.n}  median ${r.medianMinutes}m  mean ${r.meanMinutes}m` +
      `  [corner0 ${r.strongWinsCorner0} / corner1 ${r.strongWinsCorner1}]`,
  );
}
console.log(`\nseeds ${seeds[0]}..${seeds[seeds.length - 1]} (${seedCount}), cap ${minutes} min`);

const jsonPath = arg('json', '');
if (jsonPath) {
  writeFileSync(
    jsonPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), seeds, minutes, cells: report }, null, 2),
  );
  console.log(`wrote ${jsonPath}`);
}
