// DOES THE DIFFICULTY ORDERING SURVIVE THE TOUGHER TURRETS?
//
// At turret damage 6 / hp 900 / HQ 4000 the mirror median lands at 15.3 min with 0 unfinished. Turrets were rejected once before for
// equalising the difficulties, so the ordering has to be re-measured before this value can be accepted — and if it fails, the answer
// is a different value, not a weaker requirement.
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

const seeds = [1000, 1007, 1014, 1021, 1028, 1035, 1042, 1049];
function set(dmg: number, hp: number, sanctum: number) {
  restore();
  const s = JSON.parse(sOrig) as Record<string, unknown>;
  s.hp = hp; (s.weapon as Record<string, unknown>).damage = dmg;
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
set(3, 600, 4000);
for (const [a, b] of [['hard', 'normal'], ['normal', 'easy'], ['hard', 'easy']] as const) {
  const res = (await runPool(jobs(a, b), 3)) as MatchResult[];
  let aw = 0, bw = 0, u = 0;
  for (const r of res) { if (!r.ended) u++; else if (r.winnerTeam === 0) aw++; else if (r.winnerTeam === 1) bw++; }
  console.log(`${a} vs ${b}: ${aw}-${bw} (${((aw / Math.max(1, aw + bw)) * 100).toFixed(0)}%) unfinished=${u}`);
}
restore();
console.log('restored');
