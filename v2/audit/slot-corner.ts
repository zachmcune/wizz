// SEPARATE "WHICH CORNER" FROM "WHICH SLOT" — the decisive mirror experiment.
//
// Both configurations put p1 in corner 0 and p2 in corner 1. The ONLY difference is the order of the players array:
//
//   P: [p1@corner0, p2@corner1]   p1 is index 0 (lower entity slots, decides first)
//   Q: [p2@corner1, p1@corner0]   p2 is index 0
//
// So:
//   • if the SAME player wins both P and Q, the winner is determined by the CORNER (a map effect);
//   • if the winner is always the player at index 1, the winner is determined by the SLOT (an ordering effect);
//   • if the same player wins and that player is on the same corner in both, we cannot distinguish — hence both orders
//     are run for every seed and the corner/slot tallies are reported separately.
//
// Usage: npx vite-node audit/slot-corner.ts
import { runPool, type Job } from './ai-tournament-parallel';
import type { MatchResult } from './ai-tournament';

const arg = (n: string, d: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : d;
};
const seeds = arg('seeds', '1000,1014,1035,1042,1051,1063,1077,1088')
  .split(',')
  .map(Number)
  .filter(Number.isFinite);
const jobs = Number(arg('jobs', '4'));
const minutes = Number(arg('minutes', '34'));
const diff = arg('difficulty', 'normal');

const player = (id: string, team: number, start: number) => ({
  id,
  difficulty: diff as never,
  team,
  faction: 'arcane',
  startIndex: start,
});

/** P: p1 at corner 0 (index 0). */
const P = (seed: number): Job => ({ seed, maxMinutes: minutes, players: [player('p1', 0, 0), player('p2', 1, 1)] });
/** Q: p1 still at corner 0, but p2 is index 0. */
const Q = (seed: number): Job => ({ seed, maxMinutes: minutes, players: [player('p2', 0, 1), player('p1', 1, 0)] });

const work: Job[] = [];
for (const s of seeds) {
  work.push(P(s));
  work.push(Q(s));
}

const res = (await runPool(work, jobs, (d, t) => {
  if (d % 4 === 0 || d === t) process.stderr.write(`  ${d}/${t}\n`);
})) as MatchResult[];

const lines: string[] = [];
let corner0Wins = 0, corner1Wins = 0, index0Wins = 0, index1Wins = 0, decided = 0, unfinished = 0;
for (let i = 0; i < work.length; i += 2) {
  const jobP = work[i]!, rp = res[i]!;
  const jobQ = work[i + 1]!, rq = res[i + 1]!;

  /** Which corner did the winner occupy, and at which index? */
  const describe = (job: Job, r: MatchResult): string => {
    if (r.winnerTeam === null) return 'none';
    const winner = job.players.find((p) => p.team === r.winnerTeam)!;
    const idx = job.players.indexOf(winner);
    const slot = idx === 0 ? 'idx0' : 'idx1';
    const corner = winner.startIndex;
    if (r.ended) {
      decided++;
      if (corner === 0) corner0Wins++; else corner1Wins++;
      if (idx === 0) index0Wins++; else index1Wins++;
    }
    return `${winner.id}@corner${corner}/${slot}`;
  };

  const dp = describe(jobP, rp), dq = describe(jobQ, rq);
  lines.push(
    `seed ${String(jobP.seed).padStart(5)}: P[p1@c0 idx0] -> ${dp.padEnd(20)} ${rp.minutes.toFixed(1)}m` +
      ` | Q[p1@c0 idx1] -> ${dq.padEnd(20)} ${rq.minutes.toFixed(1)}m`,
  );
  if (!rp.ended) unfinished++;
  if (!rq.ended) unfinished++;
}

console.log(lines.join('\n'));
console.log(`\nSLOT vs CORNER (${diff}, ${seeds.length} seeds x2 orders)`);
console.log(`  winner by CORNER: corner0 ${corner0Wins}, corner1 ${corner1Wins}`);
console.log(`  winner by SLOT  : index0 ${index0Wins}, index1 ${index1Wins}`);
console.log(`  decided ${decided}/${work.length}   unfinished ${unfinished}/${work.length}`);
console.log(
  `\n  => ${corner1Wins === decided ? 'CORNER' : index1Wins === decided ? 'SLOT' : 'mixed'} effect` +
    ` (corner1 ${corner1Wins}/${decided}, index1 ${index1Wins}/${decided})`,
);
