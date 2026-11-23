// FOUR-WAY MIRROR: separate CORNER from PLAYER ORDER.
//
// The terrain is now exactly mirror-symmetric (asserted in `tests/data/parity.test.ts`), so corner 0 and corner 1 are
// geometrically identical. Any remaining difference must therefore come from ORDER: which player is created first (and so
// owns the lower entity ids and the lower slots), and which occupies the lower-x half of the map.
//
// Four configurations on the same seed:
//
//   A  [p1@c0, p2@c1]   p1 lower ids, p1 at corner 0
//   B  [p2@c1, p1@c0]   p2 lower ids, p1 at corner 0   (corners unchanged, creation order flipped)
//   C  [p1@c1, p2@c0]   p1 lower ids, p2 at corner 0
//   D  [p2@c0, p1@c1]   p2 lower ids, p2 at corner 0   (corners flipped, creation order flipped)
//
// Reading the result:
//   • winner follows CORNER 0 in A, C and D  -> position effect (spatial iteration order)
//   • winner is always the LOWER-ID player   -> id/slot order effect
//   • winner follows the same *named* player -> something keyed on the player id string
//
// Usage: npx vite-node audit/mirror4way.ts
import { runPool, type Job } from './ai-tournament-parallel';
import type { MatchResult } from './ai-tournament';

const arg = (n: string, d: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : d;
};
const seeds = arg('seeds', '1000,1014,1035,1042').split(',').map(Number).filter(Number.isFinite);
const jobs = Number(arg('jobs', '4'));
const minutes = Number(arg('minutes', '32'));

const pl = (id: string, team: number, start: number) => ({
  id,
  difficulty: 'normal' as never,
  team,
  faction: 'arcane',
  startIndex: start,
});

interface Cfg {
  key: string;
  job: Job;
  /** Which id sits at corner 0, and which id owns the lower entity ids (index 0). */
  corner0: string;
  index0: string;
}

const configs: ((seed: number) => Cfg)[] = [
  (seed) => ({ key: 'A', job: { seed, maxMinutes: minutes, players: [pl('p1', 0, 0), pl('p2', 1, 1)] }, corner0: 'p1', index0: 'p1' }),
  (seed) => ({ key: 'B', job: { seed, maxMinutes: minutes, players: [pl('p2', 0, 1), pl('p1', 1, 0)] }, corner0: 'p1', index0: 'p2' }),
  (seed) => ({ key: 'C', job: { seed, maxMinutes: minutes, players: [pl('p1', 0, 1), pl('p2', 1, 0)] }, corner0: 'p2', index0: 'p1' }),
  (seed) => ({ key: 'D', job: { seed, maxMinutes: minutes, players: [pl('p2', 0, 0), pl('p1', 1, 1)] }, corner0: 'p2', index0: 'p2' }),
];

const work: Cfg[] = [];
for (const seed of seeds) for (const mk of configs) work.push(mk(seed));

const res = (await runPool(work.map((c) => c.job), jobs)) as MatchResult[];

let corner0Wins = 0;
let index0Wins = 0;
let decided = 0;
const lines: string[] = [];
for (let i = 0; i < work.length; i++) {
  const c = work[i]!;
  const r = res[i];
  if (!r) {
    lines.push(`${c.key} seed ${c.job.seed}: NO RESULT`);
    continue;
  }
  let winner = '-';
  if (r.winnerTeam !== null) {
    // Map the winning team back to the player id that filled it in THIS configuration.
    const p = c.job.players.find((x) => x.team === r.winnerTeam)!;
    winner = p.id;
    decided++;
    if (winner === c.corner0) corner0Wins++;
    if (winner === c.index0) index0Wins++;
  }
  lines.push(
    `${c.key} seed ${String(c.job.seed).padStart(5)}: corner0=${c.corner0} index0=${c.index0}` +
      ` -> winner ${winner} ${r.minutes.toFixed(1)}m${r.ended ? '' : ' (UNFINISHED)'}`,
  );
}
console.log(lines.join('\n'));
console.log(`\ndecided ${decided}/${work.length}`);
console.log(`  winner was the CORNER-0 player: ${corner0Wins}/${decided}`);
console.log(`  winner was the INDEX-0 player : ${index0Wins}/${decided}`);
if (corner0Wins === decided) console.log('  => POSITION effect (corner 0 / lower-x side wins)');
else if (index0Wins === decided) console.log('  => ID-ORDER effect (first-created player wins)');
else console.log('  => neither explains it alone');
