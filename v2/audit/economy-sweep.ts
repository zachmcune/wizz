// ECONOMY SWEEP — node capacity, by measurement.
//
// Zachary approved changing economy values (2026-11-21) with the instruction to change only what the measurements justify.
//
// THE PROBLEM, MEASURED. `duel_glade` authors 127,000 mana but `manaNodeCapacity` clamps every node to 12,000, so the map holds
// 75,000. At 12 workers per side siphoning 16/s that is about 6.5 minutes of continuous mining, and observed income is ~890
// mana/min/side because workers spend much of their time travelling. Both sides therefore run at zero margin: measured spending
// exceeded earnings (9,730 spent against 8,925 earned in ten minutes), so the first raid that kills the worker line is
// unrecoverable — seeds 1035 and 1042 freeze from minute 10 with 61,047 mana still on the map and no workers to mine it.
//
// THE CANDIDATES. Raising the clamp toward the authored amounts is the smallest change that adds supply without inventing new
// content: the map already declares 25,000 on its four main nodes and 3,000 on the rest.
//
// THE TARGET (from the brief): no side goes more than 60 s unable to spend while it still holds territory, and the worst
// no-spend stretch drops well below the reported 897-1152 s. Expanding must also MATTER — taking more nodes has to be worth
// something — so this reports nodes held as well as raw totals.
//
// Usage:
//   npx vite-node audit/economy-sweep.ts --seeds 1000,1035,1042 --json out.json
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
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
const maxMinutes = Number(flag('minutes') ?? 30);

const BALANCE = join(ROOT, 'data', 'balance.json');
const original = readFileSync(BALANCE, 'utf8');
const restore = (): void => writeFileSync(BALANCE, original);
process.on('SIGINT', () => {
  restore();
  process.exit(130);
});
process.on('uncaughtException', (e) => {
  restore();
  console.error(e);
  process.exit(1);
});

/** Only `manaNodeCapacity` is under test; every other balance value stays as it is. */
function setCapacity(cap: number): void {
  restore();
  const b = JSON.parse(readFileSync(BALANCE, 'utf8')) as Record<string, unknown>;
  b.manaNodeCapacity = cap;
  writeFileSync(BALANCE, JSON.stringify(b, null, 2) + '\n');
}

function jobsFor(a: string, b: string): Job[] {
  return seeds.flatMap((seed) => [
    { seed, maxMinutes, players: [
      { id: 'p1', difficulty: a as never, team: 0, faction: 'arcane', startIndex: 0 },
      { id: 'p2', difficulty: b as never, team: 1, faction: 'arcane', startIndex: 1 }] },
    { seed, maxMinutes, players: [
      { id: 'p1', difficulty: a as never, team: 0, faction: 'arcane', startIndex: 1 },
      { id: 'p2', difficulty: b as never, team: 1, faction: 'arcane', startIndex: 0 }] },
  ]);
}

function lenStats(res: MatchResult[]): { median: number; max: number; unfinished: number; worstNoSpend: number } {
  const mins = res.map((r) => r.minutes).sort((x, y) => x - y);
  let worst = 0;
  for (const r of res) for (const s of r.sides) worst = Math.max(worst, s.stall.longestNoSpendSeconds);
  return {
    median: mins[Math.floor(mins.length / 2)] ?? 0,
    max: mins.at(-1) ?? 0,
    unfinished: res.filter((r) => !r.ended).length,
    worstNoSpend: worst,
  };
}

const CAPS = [12000, 25000, 40000];
const rows: unknown[] = [];
console.log(`Sweeping manaNodeCapacity over ${seeds.length} seeds x 2 corners (normal mirror).\n`);
console.log('capacity'.padEnd(11) + 'median'.padEnd(9) + 'max'.padEnd(8) + 'unfin'.padEnd(7) + 'worstNoSpend');

for (const cap of CAPS) {
  setCapacity(cap);
  const res = (await runPool(jobsFor('normal', 'normal'), jobs)) as MatchResult[];
  const s = lenStats(res);
  rows.push({ cap, ...s, nodeManaAtStart: seeds.length ? undefined : undefined });
  console.log(
    String(cap).padEnd(11) + `${s.median.toFixed(1)}m`.padEnd(9) + `${s.max.toFixed(1)}` .padEnd(8) + String(s.unfinished).padEnd(7) +
      `${s.worstNoSpend}s`,
  );
}

restore();
/* Verify the data actually went back, because a sweep that leaves edited balance behind would silently change the game. */
const after = JSON.parse(readFileSync(BALANCE, 'utf8')) as { manaNodeCapacity: number };
if (after.manaNodeCapacity !== 12000) {
  console.error(`RESTORE FAILED: manaNodeCapacity is ${after.manaNodeCapacity}, expected 12000`);
  process.exit(3);
}
console.log('\ndata restored: manaNodeCapacity = 12000');

const outIdx = process.argv.indexOf('--json');
if (outIdx >= 0 && process.argv[outIdx + 1] && existsSync(BALANCE)) {
  writeFileSync(process.argv[outIdx + 1]!, JSON.stringify({ generatedAt: new Date().toISOString(), seeds, rows }, null, 2));
  console.log(`wrote ${process.argv[outIdx + 1]}`);
}
