// DETERMINISM COLLAPSE PROBE.
//
// The sim has four declared RNG streams (`map`, `ai`, `spawn`, `cosmetic`) but nothing in `src/sim` or `src/ai` ever
// draws from them. If that is true, a match is a pure function of (map, opening variant, player order, corners) and the
// seed itself changes nothing except which of the THREE opening variants the AI picks.
//
// Consequence: a 12-seed mirror study is really a 3-game study, and every win-rate measured from it has a sample size of
// about 3, not 24. That would explain both the wild swings between measurements (71%, then 0%, then 42%) and the
// suspiciously repeated match lengths.
//
// This probe proves or disproves it directly: play several seeds and print the FINAL STATE HASH. Seeds that map to the
// same variant must produce byte-identical hashes, and the number of distinct hashes must equal the number of variants
// actually represented.
//
// Usage: npx vite-node audit/seed-collapse.ts
import { runPool, type Job } from './ai-tournament-parallel';
import type { MatchResult } from './ai-tournament';

const seeds = [1000, 1014, 1035, 1042, 1051, 1063, 1077, 1088, 1094, 1109, 1116, 1123];
const minutes = Number(process.argv[process.argv.indexOf('--minutes') + 1] ?? '34');

const job = (seed: number): Job => ({
  seed,
  maxMinutes: minutes,
  players: [
    { id: 'p1', difficulty: 'normal' as never, team: 0, faction: 'arcane', startIndex: 0 },
    { id: 'p2', difficulty: 'normal' as never, team: 1, faction: 'arcane', startIndex: 1 },
  ],
});

const res = (await runPool(seeds.map(job), 4)) as MatchResult[];

/** The opening variant the AI will choose for this seed (mirrors AiBrain's derivation). */
function variant(seed: number): number {
  let h = (seed >>> 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) % 3;
}

const byHash = new Map<string, number[]>();
for (const r of res.sort((a, b) => a.seed - b.seed)) {
  const hash = (r as unknown as { hash?: string }).hash ?? '(no hash field)';
  const list = byHash.get(hash) ?? [];
  list.push(r.seed);
  byHash.set(hash, list);
  console.log(
    `seed ${String(r.seed).padStart(5)}  variant ${variant(r.seed)}  ${r.ended ? 'ended' : 'UNFIN'}` +
      `  ${r.minutes.toFixed(1).padStart(5)} min  winner=t${r.winnerTeam ?? '-'}  hash=${String(hash).slice(0, 16)}`,
  );
}

console.log(`\n${res.length} seeds produced ${byHash.size} distinct final states`);
for (const [hash, list] of byHash) console.log(`  ${String(hash).slice(0, 16)} <- seeds ${list.join(',')}`);
const variants = new Set(seeds.map(variant));
console.log(`\nvariant spread: ${[...variants].sort().join(',')} (${variants.size} distinct variants across ${seeds.length} seeds)`);
console.log(
  byHash.size >= res.length
    ? 'VERDICT: every seed is a distinct game — the seed genuinely varies play.'
    : `VERDICT: COLLAPSE — ${res.length} seeds are only ${byHash.size} distinct games. Win rates measured per-seed are not independent samples.`,
);
