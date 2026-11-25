// VARIANT HEAD-TO-HEAD.
//
// The mirror bias was traced to the seeded opening variants: `openingFor` returns a different build order depending on a
// hash of the match seed, and the variants turned out to differ in STRENGTH, not just shape. A player's outcome then
// depends on which variant its seed drew, which is a coin flip unrelated to skill or position — exactly the kind of thing
// that makes a mirror non-coin-flip.
//
// Average equality across all seeds is not enough to prove a mirror is fair: what matters is the HEAD-TO-HEAD result, so
// this pins each variant on both sides and reports the score of each pairing.
//
// Usage: npx vite-node audit/variant-h2h.ts
import { runPool, type Job } from './ai-tournament-parallel';
import type { MatchResult } from './ai-tournament';

const seeds = [1000, 1014, 1035, 1042];
const jobs = Number(process.argv[process.argv.indexOf('--jobs') + 1] ?? '4');
const minutes = Number(process.argv[process.argv.indexOf('--minutes') + 1] ?? '34');

/**
 * The brain derives its variant from the seed. To pin a variant we need a seed that HAS that variant, so this searches
 * the seed space for one representative seed per variant and then plays each pairing at that seed.
 */
function variantOf(seed: number): number {
  let h = (seed >>> 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) % 3;
}
const seedForVariant = new Map<number, number>();
for (let s = 1; s < 100000 && seedForVariant.size < 3; s++) {
  const v = variantOf(s);
  if (!seedForVariant.has(v)) seedForVariant.set(v, s);
}
const vSeeds = [...seedForVariant.entries()].sort((a, b) => a[0] - b[0]);
console.log(`representative seeds: ${vSeeds.map(([v, s]) => `variant ${v} = seed ${s}`).join(', ')}`);

// Every ordered pairing (v, w) is run with v on team 0 (corner 0) and w on team 1 (corner 1).
const work: { job: Job; v: number; w: number }[] = [];
for (const [v, sv] of vSeeds) {
  for (const [w, sw] of vSeeds) {
    if (v === w) continue;
    for (const seed of [sv, sw]) {
      work.push({
        v,
        w,
        job: {
          seed,
          maxMinutes: minutes,
          players: [
            { id: 'p1', difficulty: 'normal' as never, team: 0, faction: 'arcane', startIndex: 0 },
            { id: 'p2', difficulty: 'normal' as never, team: 1, faction: 'arcane', startIndex: 1 },
          ],
        },
      });
    }
  }
}

const res = (await runPool(work.map((x) => x.job), jobs)) as MatchResult[];

const tally = new Map<string, { w: number; n: number }>();
for (let i = 0; i < work.length; i++) {
  const { v, w } = work[i]!;
  const r = res[i];
  if (!r) {
    console.log(`seed ${String(work[i]!.job.seed).padStart(6)}  variant ${v} vs ${w} -> NO RESULT (worker failed)`);
    continue;
  }
  const key = `${v}v${w}`;
  const t = tally.get(key) ?? { w: 0, n: 0 };
  t.n++;
  if (r.winnerTeam === 0) t.w++;
  tally.set(key, t);
  console.log(
    `seed ${String(work[i]!.job.seed).padStart(6)}  variant ${v} (corner0) vs variant ${w} (corner1)` +
      ` -> team${r.winnerTeam ?? '-'} ${r.minutes.toFixed(1)}m`,
  );
}

console.log('\nHEAD TO HEAD, team 0 (variant A, corner 0) vs team 1 (variant B, corner 1):');
for (const [key, t] of [...tally.entries()].sort()) {
  const [a, b] = key.split('v');
  console.log(`  variant ${a} beat variant ${b}: ${t.w}/${t.n}`);
}
