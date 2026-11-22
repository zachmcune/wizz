// MILD TURRET VALUES: is there a point that adds length WITHOUT breaking the ordering?
//
// Turret toughening has broken the ordering at dmg 6 and dmg 10, in three separate measurements. But the length target needs SOMETHING,
// since HQ HP alone saturates at ~14.5 min. This searches the mild end: does a small turret increase (4 or 5 damage) add any length,
// and does the ordering survive it?
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
function set(dmg: number, hp: number, hq: number) {
  restore();
  const s = JSON.parse(sOrig) as Record<string, unknown>;
  s.hp = hp; (s.weapon as Record<string, unknown>).damage = dmg;
  writeFileSync(SENTRY, JSON.stringify(s, null, 2) + '\n');
  const h = JSON.parse(hOrig) as Record<string, unknown>;
  h.hp = hq;
  writeFileSync(SANCTUM, JSON.stringify(h, null, 2) + '\n');
}
const seeds = [1000, 1007, 1014, 1021, 1028, 1035];
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
async function rate(a: string, b: string) {
  const res = (await runPool(jobs(a, b), 3)) as MatchResult[];
  let aw = 0, bw = 0, u = 0;
  for (const r of res) { if (!r.ended) u++; else if (r.winnerTeam === 0) aw++; else if (r.winnerTeam === 1) bw++; }
  return { s: `${aw}-${bw} ${((aw / Math.max(1, aw + bw)) * 100).toFixed(0)}%`, u };
}
console.log('dmg/hp/hq'.padEnd(14) + 'hard>normal'.padEnd(16) + 'normal>easy'.padEnd(16) + 'NvN median'.padEnd(13) + 'unfin');
for (const [d, h, hq] of [[3, 600, 8000], [3, 600, 12000]] as const) {
  set(d, h, hq);
  const hn = await rate('hard', 'normal');
  const ne = await rate('normal', 'easy');
  const nn = (await runPool(jobs('normal', 'normal'), 3)) as MatchResult[];
  const m = nn.map((r) => r.minutes).sort((x, y) => x - y);
  const u = nn.filter((r) => !r.ended).length;
  console.log(
    `${d}/${h}/${hq}`.padEnd(14) + hn.s.padEnd(16) + ne.s.padEnd(16) +
      `${m[Math.floor(m.length / 2)]?.toFixed(1)}m`.padEnd(13) + String(hn.u + ne.u + u),
  );
}
restore();
console.log('restored');
