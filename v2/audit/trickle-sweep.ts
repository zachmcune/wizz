// TRICKLE SWEEP — does a sanctum income floor resolve the dead economy, and how small can it be?
//
// The dead state is concrete: p2 with 155 mana, 0 harvesters, two spires, nothing sellable. At 0 the bank never reaches the
// 200 a worker costs. The trickle only needs to be fast enough to fund a worker within a reasonable time and slow enough not to
// be an income source: 0.6/s funds one worker in ~5.5 minutes; 2/s in ~1.7.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runPool, type Job } from './ai-tournament-parallel';
import type { MatchResult } from './ai-tournament';

const ROOT = join(import.meta.dirname, '..');
const BAL = join(ROOT, 'data', 'balance.json');
const orig = readFileSync(BAL, 'utf8');
const restore = () => writeFileSync(BAL, orig);
process.on('SIGINT', () => { restore(); process.exit(130); });
process.on('uncaughtException', (e) => { restore(); console.error(e); process.exit(1); });

const seeds = [1000, 1014, 1035, 1042, 1007, 1077];
function set(v: number) {
  const b = JSON.parse(orig) as Record<string, unknown>;
  b.sanctumTricklePerSecond = v;
  writeFileSync(BAL, JSON.stringify(b, null, 2) + '\n');
}
function jobs(): Job[] {
  return seeds.flatMap((seed) => [
    { seed, maxMinutes: 30, players: [
      { id: 'p1', difficulty: 'normal' as const, team: 0, faction: 'arcane', startIndex: 0 },
      { id: 'p2', difficulty: 'normal' as const, team: 1, faction: 'arcane', startIndex: 1 }] },
    { seed, maxMinutes: 30, players: [
      { id: 'p1', difficulty: 'normal' as const, team: 0, faction: 'arcane', startIndex: 1 },
      { id: 'p2', difficulty: 'normal' as const, team: 1, faction: 'arcane', startIndex: 0 }] },
  ]);
}

console.log('trickle'.padEnd(10) + 'median'.padEnd(9) + 'max'.padEnd(8) + 'unfin'.padEnd(7) + 'worstNoSpend');
for (const v of [1, 1.5]) {
  set(v);
  const res = (await runPool(jobs(), 3)) as MatchResult[];
  const mins = res.map((r) => r.minutes).sort((x, y) => x - y);
  let worst = 0;
  for (const r of res) for (const s of r.sides) worst = Math.max(worst, s.stall.longestNoSpendSeconds);
  console.log(
    String(v).padEnd(10) + `${mins[Math.floor(mins.length / 2)]?.toFixed(1)}m`.padEnd(9) +
      `${mins.at(-1)?.toFixed(1)}`.padEnd(8) + String(res.filter((r) => !r.ended).length).padEnd(7) + `${worst}s`,
  );
}
restore();
const after = JSON.parse(readFileSync(BAL, 'utf8')) as { sanctumTricklePerSecond: number };
console.log(`\nrestored (trickle=${after.sanctumTricklePerSecond})`);
