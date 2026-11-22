// TURRET SWEEP WITH THE NEW ECONOMY.
//
// Earlier this was rejected because stronger turrets equalised the difficulties. But that was measured when the AI built at most
// one sentry and matches ended by HQ rush at minute 12. With the roomier economy the AI now builds two, and HQ HP has diminishing
// returns (4000 -> 12000 moved the median only 12.7 -> 13.7). So the question is re-opened: does turret strength lengthen matches
// now, and does it still preserve the ordering?
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runPool, type Job } from './ai-tournament-parallel';
import type { MatchResult } from './ai-tournament';

const ROOT = join(import.meta.dirname, '..');
const SENTRY = join(ROOT, 'data', 'buildings', 'arcane_sentry.json');
const SANCTUM = join(ROOT, 'data', 'buildings', 'sanctum.json');
const sOrig = readFileSync(SENTRY, 'utf8');
const hOrig = readFileSync(SANCTUM, 'utf8');
const restore = () => { writeFileSync(SENTRY, sOrig); writeFileSync(SANCTUM, hOrig); };
process.on('SIGINT', () => { restore(); process.exit(130); });
process.on('uncaughtException', (e) => { restore(); console.error(e); process.exit(1); });

const seeds = [1000, 1014, 1035, 1042];
function set(dmg: number, hp: number, sanctum: number) {
  restore();
  const s = JSON.parse(sOrig) as Record<string, unknown>;
  s.hp = hp;
  (s.weapon as Record<string, unknown>).damage = dmg;
  writeFileSync(SENTRY, JSON.stringify(s, null, 2) + '\n');
  const h = JSON.parse(hOrig) as Record<string, unknown>;
  h.hp = sanctum;
  writeFileSync(SANCTUM, JSON.stringify(h, null, 2) + '\n');
}
function jobs(a: string, b: string): Job[] {
  return seeds.flatMap((seed) => [
    { seed, maxMinutes: 32, players: [
      { id: 'p1', difficulty: a as never, team: 0, faction: 'arcane', startIndex: 0 },
      { id: 'p2', difficulty: b as never, team: 1, faction: 'arcane', startIndex: 1 }] },
    { seed, maxMinutes: 32, players: [
      { id: 'p1', difficulty: a as never, team: 0, faction: 'arcane', startIndex: 1 },
      { id: 'p2', difficulty: b as never, team: 1, faction: 'arcane', startIndex: 0 }] },
  ]);
}
function stat(res: MatchResult[]) {
  const m = res.map((r) => r.minutes).sort((x, y) => x - y);
  let worst = 0;
  for (const r of res) for (const s of r.sides) worst = Math.max(worst, s.stall.longestNoSpendSeconds);
  return { median: m[Math.floor(m.length / 2)] ?? 0, max: m.at(-1) ?? 0, unfin: res.filter((r) => !r.ended).length, worst };
}

console.log('dmg/hp/hq'.padEnd(16) + 'NvN median'.padEnd(13) + 'max'.padEnd(8) + 'unfin'.padEnd(7) + 'worstNoSpend');
for (const [dmg, hp, hq] of [[6, 900, 5000], [6, 900, 7000], [6, 900, 10000]] as const) {
  set(dmg, hp, hq);
  const s = stat((await runPool(jobs('normal', 'normal'), 3)) as MatchResult[]);
  console.log(`${dmg}/${hp}/${hq}`.padEnd(16) + `${s.median.toFixed(1)}m`.padEnd(13) + `${s.max.toFixed(1)}`.padEnd(8) + String(s.unfin).padEnd(7) + `${s.worst}s`);
}
restore();
console.log('restored');
