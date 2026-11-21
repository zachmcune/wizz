// MIRROR FAIRNESS, measured through the parallel harness so the interval is narrow enough to be meaningful.
//
// Both slots are the SAME difficulty, so any systematic difference is sim unfairness, not AI quality. Each seed is played in
// both corner assignments, so the map's own asymmetry cancels and what remains is the slot effect.
import { runPool, type Job } from './ai-tournament-parallel';
import type { MatchResult } from './ai-tournament';

/**
 * Argument parsing must cope with the flag being ABSENT.
 *
 * `process.argv.indexOf('--seeds')` returns -1 when the flag is not supplied, so `argv[-1 + 1]` is `argv[0]` — the script path.
 * That parsed to an empty seed list, so the run queued ZERO jobs and printed a 0-of-0 result as though the mirror had been
 * measured. A harness that silently measures nothing is worse than one that crashes.
 */
const flag = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const seeds = (flag('seeds') ?? '1000,1007,1014,1021,1028,1035,1042,1049,1056,1063,1070,1077')
  .split(',')
  .map(Number)
  .filter(Number.isFinite);
const jobs = Number(flag('jobs') ?? 4);
if (seeds.length === 0) {
  console.error('no seeds parsed — refusing to report a result for an empty run');
  process.exit(2);
}

const work: Job[] = seeds.flatMap((seed) => [
  { seed, maxMinutes: 30, players: [
    { id: 'p1', difficulty: 'normal' as const, team: 0, faction: 'arcane', startIndex: 0 },
    { id: 'p2', difficulty: 'normal' as const, team: 1, faction: 'arcane', startIndex: 1 }] },
  { seed, maxMinutes: 30, players: [
    { id: 'p1', difficulty: 'normal' as const, team: 0, faction: 'arcane', startIndex: 1 },
    { id: 'p2', difficulty: 'normal' as const, team: 1, faction: 'arcane', startIndex: 0 }] },
]);

const results = (await runPool(work, jobs)) as MatchResult[];
let first = 0, second = 0, none = 0;
for (const r of results) {
  if (!r.ended || r.winnerTeam === null || r.winnerTeam < 0) none++;
  else if (r.winnerTeam === 0) first++;
  else second++;
}
const decided = first + second;
const p = first / decided;
const z = 1.96;
const denom = 1 + (z * z) / decided;
const centre = (p + (z * z) / (2 * decided)) / denom;
const half = (z * Math.sqrt((p * (1 - p)) / decided + (z * z) / (4 * decided * decided))) / denom;
console.log(`MIRROR over ${decided} decided games (${none} unfinished): first slot ${first} - second slot ${second}`);
console.log(`rate ${(p * 100).toFixed(1)}%, 95% CI ${((centre - half) * 100).toFixed(1)}%-${((centre + half) * 100).toFixed(1)}%`);
console.log(`CI contains 50%: ${centre - half <= 0.5 && centre + half >= 0.5}`);
