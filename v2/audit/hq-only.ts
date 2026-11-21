// HQ-ONLY SWEEP.
//
// Turret damage measured as a skill EQUALISER: at v1 the difficulty ordering was 75/88/88%, and adding turret damage 3->5 with
// HQ 3000 collapsed Hard-vs-Normal to 50% while barely moving match length. Static defence substitutes for decisions, so it
// cannot be the lever if the ordering has to survive.
//
// HQ HP is a different kind of lever: it lengthens the kill without making passivity safe, because it does not kill attackers.
// This measures HQ HP alone against BOTH the length target and the ordering.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runPool, type Job } from './ai-tournament-parallel';
import type { MatchResult } from './ai-tournament';

const ROOT = join(import.meta.dirname, '..');
const seeds = [1000, 1007, 1014, 1021, 1028, 1035, 1042, 1049];

const LEVELS = [2000, 3000, 4000, 5000, 6000];
const sanctumFile = join(ROOT, 'data', 'buildings', 'sanctum.json');
const original = readFileSync(sanctumFile, 'utf8');
const restore = () => writeFileSync(sanctumFile, original);
process.on('SIGINT', () => { restore(); process.exit(130); });
process.on('uncaughtException', (e) => { restore(); console.error(e); process.exit(1); });

function setHp(hp: number) {
  restore();
  const d = JSON.parse(readFileSync(sanctumFile, 'utf8')) as Record<string, unknown>;
  d.hp = hp;
  writeFileSync(sanctumFile, JSON.stringify(d, null, 2) + '\n');
}

function jobs(a: string, b: string, both = false): Job[] {
  return seeds.flatMap((seed) => [
    { seed, maxMinutes: 30, players: [
      { id: 'p1', difficulty: a as never, team: 0, faction: 'arcane', startIndex: 0 },
      { id: 'p2', difficulty: b as never, team: 1, faction: 'arcane', startIndex: 1 }] },
    { seed, maxMinutes: 30, players: [
      { id: 'p1', difficulty: a as never, team: 0, faction: 'arcane', startIndex: 1 },
      { id: 'p2', difficulty: b as never, team: 1, faction: 'arcane', startIndex: 0 }] },
  ]);
}

function rate(res: MatchResult[]): { s: string; unfin: number; median: number } {
  let aw = 0, bw = 0, unfin = 0;
  for (const r of res) { if (!r.ended) unfin++; else if (r.winnerTeam === 0) aw++; else if (r.winnerTeam === 1) bw++; }
  const mins = res.map((r) => r.minutes).sort((x, y) => x - y);
  return { s: `${aw}-${bw} ${((aw / Math.max(1, aw + bw)) * 100).toFixed(0)}%`, unfin, median: mins[Math.floor(mins.length / 2)] ?? 0 };
}

console.log('hqHp'.padEnd(8) + 'NvN median'.padEnd(13) + 'hard>normal'.padEnd(17) + 'normal>easy'.padEnd(17) + 'hard>easy'.padEnd(15) + 'unfin');
for (const hp of LEVELS) {
  setHp(hp);
  const mir = rate((await runPool(jobs('normal', 'normal'), 3)) as MatchResult[]);
  const hn = rate((await runPool(jobs('hard', 'normal'), 3)) as MatchResult[]);
  const ne = rate((await runPool(jobs('normal', 'easy'), 3)) as MatchResult[]);
  const he = rate((await runPool(jobs('hard', 'easy'), 3)) as MatchResult[]);
  console.log(
    String(hp).padEnd(8) + `${mir.median.toFixed(1)}m`.padEnd(13) +
      hn.s.padEnd(17) + ne.s.padEnd(17) + he.s.padEnd(15) + String(mir.unfin + hn.unfin + ne.unfin + he.unfin),
  );
}
restore();
console.log('data restored');
