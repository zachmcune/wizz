// HQ RETUNE AGAINST THE NEW ECONOMY.
//
// Raising `manaNodeCapacity` 12,000 -> 25,000 fixed the supply problem (worst no-spend 1073 s -> 301 s) but shortened matches, because
// more mana means bigger armies and faster kills: the mirror median fell from 17.9 to 13.9 minutes, below the 15-25 band.
//
// Zachary's instruction anticipated this ("retune HQ HP if longer economies change match length"), so this sweeps HQ HP WITH the new
// capacity in place and picks the smallest value that puts the median back inside the band.
//
// Usage:
//   npx vite-node audit/hq-retune.ts --seeds 1000,1035,1042,1014
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runPool, type Job } from './ai-tournament-parallel';
import type { MatchResult } from './ai-tournament';

const ROOT = join(import.meta.dirname, '..');
const flag = (n: string): string | undefined => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const seeds = (flag('seeds') ?? '1000,1035,1042,1014').split(',').map(Number).filter(Number.isFinite);
const jobs = Number(flag('jobs') ?? 3);
const CAPACITY = Number(flag('capacity') ?? 25000);
const TRICKLE = Number(flag('trickle') ?? 1);

const BALANCE = join(ROOT, 'data', 'balance.json');
const SANCTUM = join(ROOT, 'data', 'buildings', 'sanctum.json');
const balanceOrig = readFileSync(BALANCE, 'utf8');
const sanctumOrig = readFileSync(SANCTUM, 'utf8');
const restore = (): void => {
  writeFileSync(BALANCE, balanceOrig);
  writeFileSync(SANCTUM, sanctumOrig);
};
process.on('SIGINT', () => {
  restore();
  process.exit(130);
});
process.on('uncaughtException', (e) => {
  restore();
  console.error(e);
  process.exit(1);
});

function set(hp: number): void {
  const b = JSON.parse(balanceOrig) as Record<string, unknown>;
  b.manaNodeCapacity = CAPACITY;
  b.sanctumTricklePerSecond = TRICKLE;
  writeFileSync(BALANCE, JSON.stringify(b, null, 2) + '\n');
  const s = JSON.parse(sanctumOrig) as Record<string, unknown>;
  s.hp = hp;
  writeFileSync(SANCTUM, JSON.stringify(s, null, 2) + '\n');
}

function mirror(): Job[] {
  return seeds.flatMap((seed) => [
    { seed, maxMinutes: 30, players: [
      { id: 'p1', difficulty: 'normal' as const, team: 0, faction: 'arcane', startIndex: 0 },
      { id: 'p2', difficulty: 'normal' as const, team: 1, faction: 'arcane', startIndex: 1 }] },
    { seed, maxMinutes: 30, players: [
      { id: 'p1', difficulty: 'normal' as const, team: 0, faction: 'arcane', startIndex: 1 },
      { id: 'p2', difficulty: 'normal' as const, team: 1, faction: 'arcane', startIndex: 0 }] },
  ]);
}

console.log(`HQ retune at manaNodeCapacity=${CAPACITY}, ${seeds.length} seeds x 2 corners.\n`);
console.log('hqHp'.padEnd(8) + 'median'.padEnd(9) + 'max'.padEnd(8) + 'unfin'.padEnd(7) + 'worstNoSpend');

const HPS = [4000, 6000, 8000, 10000, 12000];
const results: { hp: number; median: number; max: number; unfinished: number; worstNoSpend: number }[] = [];
for (const hp of HPS) {
  set(hp);
  const res = (await runPool(mirror(), jobs)) as MatchResult[];
  const mins = res.map((r) => r.minutes).sort((x, y) => x - y);
  let worst = 0;
  for (const r of res) for (const s of r.sides) worst = Math.max(worst, s.stall.longestNoSpendSeconds);
  const row = {
    hp,
    median: mins[Math.floor(mins.length / 2)] ?? 0,
    max: mins.at(-1) ?? 0,
    unfinished: res.filter((r) => !r.ended).length,
    worstNoSpend: worst,
  };
  results.push(row);
  console.log(
    String(hp).padEnd(8) + `${row.median.toFixed(1)}m`.padEnd(9) + `${row.max.toFixed(1)}`.padEnd(8) +
      String(row.unfinished).padEnd(7) + `${row.worstNoSpend}s`,
  );
}
restore();

/* Verify the restore: a sweep that leaves data behind silently changes the game. */
const b = JSON.parse(readFileSync(BALANCE, 'utf8')) as { manaNodeCapacity: number };
const s = JSON.parse(readFileSync(SANCTUM, 'utf8')) as { hp: number };
if (b.manaNodeCapacity !== 12000 || s.hp !== 4000) {
  console.error(`RESTORE FAILED: capacity=${b.manaNodeCapacity} (expect 12000), sanctum.hp=${s.hp} (expect 4000)`);
  process.exit(3);
}
console.log('\ndata restored to the committed values (capacity 12000, sanctum 4000)');

const best = results.filter((r) => r.unfinished === 0 && r.median >= 15 && r.median <= 25).sort((a, b2) => a.hp - b2.hp)[0];
if (best) console.log(`smallest HQ inside 15-25 with 0 unfinished: ${best.hp} (median ${best.median.toFixed(1)}m)`);
else console.log('no HQ value landed inside 15-25 with 0 unfinished');
