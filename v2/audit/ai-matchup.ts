// MATCHUP MEASUREMENT WITH A CONFIDENCE INTERVAL.
//
// The difficulty claims in this phase have to come with an interval, because a bare "63% over 16 games" is indistinguishable
// from noise without one. This runs a matchup with every seed played on BOTH sides (so the measured slot bias cancels) and
// reports a Wilson 95% interval alongside the raw record.
//
// Usage:
//   npx vite-node audit/ai-matchup.ts --a hard --b normal
//   npx vite-node audit/ai-matchup.ts --a hard --b easy --seeds 1000,1007,1014,1021,1028,1035 --jobs 3
import { runPool, type Job } from './ai-tournament-parallel';
import type { Difficulty, MatchResult } from './ai-tournament';

const flag = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const a = (flag('a') ?? 'hard') as Difficulty;
const b = (flag('b') ?? 'normal') as Difficulty;
const seeds = (flag('seeds') ?? '1000,1007,1014,1021,1028,1035,1042,1049,1056,1063,1070,1077')
  .split(',')
  .map(Number)
  .filter(Number.isFinite);
const jobs = Number(flag('jobs') ?? 3);
const maxMinutes = Number(flag('minutes') ?? 30);

if (seeds.length === 0) {
  console.error('no seeds parsed — refusing to report a result for an empty run');
  process.exit(2);
}

/** Wilson score interval: reliable at the small sample sizes this harness uses. */
function wilson(successes: number, n: number, z = 1.96): [number, number, number] {
  if (n === 0) return [0, 1, 0];
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [Math.max(0, centre - half), Math.min(1, centre + half), p];
}

const work: Job[] = seeds.flatMap((seed) => [
  { seed, maxMinutes, players: [
    { id: 'p1', difficulty: a, team: 0, faction: 'arcane', startIndex: 0 },
    { id: 'p2', difficulty: b, team: 1, faction: 'arcane', startIndex: 1 }] },
  { seed, maxMinutes, players: [
    { id: 'p1', difficulty: a, team: 0, faction: 'arcane', startIndex: 1 },
    { id: 'p2', difficulty: b, team: 1, faction: 'arcane', startIndex: 0 }] },
]);

const results = (await runPool(work, jobs)) as MatchResult[];
let aw = 0;
let bw = 0;
let draws = 0;
const lengths: number[] = [];
for (const r of results) {
  lengths.push(r.minutes);
  if (!r.ended || r.winnerTeam === null || r.winnerTeam < 0) draws++;
  else if (r.winnerTeam === 0) aw++;
  else bw++;
}
lengths.sort((x, y) => x - y);
const decided = aw + bw;
const [lo, hi, p] = wilson(aw, decided);
console.log(`${a} vs ${b}: ${aw}-${bw} (${draws} undecided) over ${results.length} games`);
console.log(`  win rate ${(p * 100).toFixed(1)}%, 95% CI ${(lo * 100).toFixed(1)}%-${(hi * 100).toFixed(1)}%`);
console.log(`  median length ${lengths[Math.floor(lengths.length / 2)]?.toFixed(1)} min`);
