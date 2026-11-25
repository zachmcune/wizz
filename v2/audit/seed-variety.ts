// SEED VARIETY — how many DISTINCT games does a seed list actually produce?
//
// A win-rate study is only as trustworthy as its effective sample size. If two different seeds produce the same
// match, counting both is counting one game twice, and the confidence interval is narrower than the evidence
// justifies. This harness measures that directly: it plays the mirror for each seed and reports how many distinct
// final hashes appear.
//
// It exists because the 2026-11-23 mirror audit showed several seed pairs producing identical match lengths, which is
// the signature of the seed collapsing onto a small number of trajectories.
//
// Usage:
//   npx vite-node audit/seed-variety.ts [seed,seed,...]
import { runPool, type Job } from './ai-tournament-parallel';
import type { MatchResult } from './ai-tournament';

const seedsArg = process.argv.slice(2).find((a) => !a.startsWith('--') && a.includes(','));
const seeds = (
  seedsArg ??
  '1000,1007,1014,1021,1028,1035,1042,1049,1056,1063,1070,1077,1084,1088,1094,1102,1109,1116,1123,1130,1137,1144'
)
  .split(',')
  .map(Number)
  .filter(Number.isFinite);

const mk = (seed: number): Job => ({
  seed,
  maxMinutes: 34,
  players: [
    { id: 'p1', difficulty: 'normal', team: 0, faction: 'arcane', startIndex: 0 },
    { id: 'p2', difficulty: 'normal', team: 1, faction: 'arcane', startIndex: 1 },
  ],
});

const res = (await runPool(seeds.map(mk), 4)) as MatchResult[];

const byHash = new Map<string, number[]>();
for (const r of res) {
  const list = byHash.get(r.hash) ?? [];
  list.push(r.seed);
  byHash.set(r.hash, list);
}

const duplicates = [...byHash.entries()].filter(([, s]) => s.length > 1);
console.log(`SEED VARIETY: ${seeds.length} seeds -> ${byHash.size} distinct final states`);
if (duplicates.length > 0) {
  console.log('  collisions:');
  for (const [, s] of duplicates) console.log(`    ${s.join(', ')}`);
} else {
  console.log('  no collisions: every seed produced a different game');
}
const lengths = new Map<string, number>();
for (const r of res) lengths.set(`${r.minutes}`, (lengths.get(`${r.minutes}`) ?? 0) + 1);
console.log(`  distinct match lengths: ${lengths.size}`);
for (const r of res) console.log(`    seed ${String(r.seed).padStart(5)}  ${r.minutes.toFixed(1)}m  winner team ${r.winnerTeam}`);
