// PARALLEL MIRROR — same seed, both corner assignments, identical profiles.
//
// The fair-game gate: a mirror must be a coin flip. Each seed is played TWICE with the corner assignment swapped, so a
// corner advantage and a player-slot advantage are separable:
//   • p1 win rate      — 50% means the slots are interchangeable
//   • corner0 vs corner1 win rate — 50% each means the map is not tilted
import { runPool, type Job } from './ai-tournament-parallel';
import type { MatchResult } from './ai-tournament';

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : d; };
const seeds = arg('seeds', '1000,1014,1035,1042,1051,1063,1077,1088,1094,1109,1116,1123').split(',').map(Number).filter(Number.isFinite);
const jobs = Number(arg('jobs', '4'));
const minutes = Number(arg('minutes', '34'));
const diff = arg('difficulty', 'normal');

const mk = (seed: number, s1: number, s2: number): Job => ({
  seed, maxMinutes: minutes,
  players: [
    { id: 'p1', difficulty: diff as never, team: 0, faction: 'arcane', startIndex: s1 },
    { id: 'p2', difficulty: diff as never, team: 1, faction: 'arcane', startIndex: s2 },
  ],
});

// Alternate the player ORDER between the two assignments as well, so creation order is also balanced.
const work: Job[] = [];
for (const s of seeds) { work.push(mk(s, 0, 1)); work.push(mk(s, 1, 0)); }

const res = (await runPool(work, jobs, (d, t) => { if (d % 4 === 0 || d === t) process.stderr.write(`  ${d}/${t}\n`); })) as MatchResult[];
const wilson = (k: number, m: number) => {
  const p = k / m, z = 1.96, den = 1 + (z * z) / m;
  const c = (p + (z * z) / (2 * m)) / den, h = z * Math.sqrt((p * (1 - p)) / m + (z * z) / (4 * m * m)) / den;
  return [Math.max(0, c - h), Math.min(1, c + h)] as const;
};
let p1w = 0, c0 = 0, c1 = 0, n = 0, totalMin = 0, unfinished = 0;
/**
 * MEDIAN LENGTH IS A TARGET IN ITS OWN RIGHT, and mean is not a substitute for it.
 *
 * The brief's target is "median 1v1 length 15-25 min, ~20". A mean is dragged by the one or two matches that run to the
 * cap, which is exactly the shape this AI produces, so the number the target names has to be measured directly.
 */
const lengths: number[] = [];
const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1]! + s[m]!) / 2 : s[m]!;
};
const lines: string[] = [];
for (let i = 0; i < work.length; i += 2) {
  const a = res[i]!, b = res[i + 1]!;
  n += 2; totalMin += a.minutes + b.minutes;
  lengths.push(a.minutes, b.minutes);
  if (!a.ended) unfinished++;
  if (!b.ended) unfinished++;
  if (a.winnerTeam === 0) { p1w++; c0++; }
  if (b.winnerTeam === 0) { p1w++; c1++; }
  lines.push(`seed ${String(a.seed).padStart(5)}: p1@c0 -> team${a.winnerTeam ?? '-'} ${a.minutes.toFixed(1)}m | p1@c1 -> team${b.winnerTeam ?? '-'} ${b.minutes.toFixed(1)}m`);
}
const ci = wilson(p1w, n), ci0 = wilson(c0, n / 2), ci1 = wilson(c1, n / 2);
console.log(lines.join('\n'));
console.log(`\nMIRROR (${diff}, ${n} matches, ${seeds.length} seeds x2 assignments)`);
console.log(`  slot   p1 ${p1w}/${n} = ${(100 * p1w / n).toFixed(1)}%  95% CI ${(100 * ci[0]).toFixed(1)}-${(100 * ci[1]).toFixed(1)}%  contains 50%: ${ci[0] <= 0.5 && ci[1] >= 0.5}`);
console.log(`  corner0   ${c0}/${n / 2} = ${(100 * c0 / (n / 2)).toFixed(1)}%  CI ${(100 * ci0[0]).toFixed(1)}-${(100 * ci0[1]).toFixed(1)}%`);
console.log(`  corner1   ${c1}/${n / 2} = ${(100 * c1 / (n / 2)).toFixed(1)}%  CI ${(100 * ci1[0]).toFixed(1)}-${(100 * ci1[1]).toFixed(1)}%`);
console.log(`  unfinished ${unfinished}/${n}   mean length ${(totalMin / n).toFixed(1)}m   median ${median(lengths).toFixed(1)}m`);
console.log(`  lengths: ${lengths.map((m) => m.toFixed(1)).join(' ')}`);
