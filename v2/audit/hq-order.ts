// ORDERING ACROSS HQ VALUES.
//
// At HQ 10000 the ordering collapsed (hard>normal 50%): with a very durable HQ, matches end by army attrition rather than by a push
// reaching the base, so attack timing — the lever Hard's whole advantage rests on — stops mattering. Length and ordering therefore
// trade against each other, and the HQ value has to be searched for the point where BOTH hold.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runPool, type Job } from './ai-tournament-parallel';
import type { MatchResult } from './ai-tournament';

const ROOT = join(import.meta.dirname, '..');
const SANCTUM = join(ROOT, 'data', 'buildings', 'sanctum.json');
const orig = readFileSync(SANCTUM, 'utf8');
const restore = () => writeFileSync(SANCTUM, orig);
process.on('SIGINT', () => { restore(); process.exit(130); });
process.on('uncaughtException', (e) => { restore(); console.error(e); process.exit(1); });
const setHp = (hp: number) => {
  const d = JSON.parse(orig) as Record<string, unknown>;
  d.hp = hp;
  writeFileSync(SANCTUM, JSON.stringify(d, null, 2) + '\n');
};

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
console.log('hqHp'.padEnd(8) + 'hard>normal'.padEnd(16) + 'normal>easy'.padEnd(16) + 'NvN median'.padEnd(13) + 'unfin');
for (const hp of [4000, 6000, 8000]) {
  setHp(hp);
  const hn = await rate('hard', 'normal');
  const ne = await rate('normal', 'easy');
  const nn = (await runPool(jobs('normal', 'normal'), 3)) as MatchResult[];
  const m = nn.map((r) => r.minutes).sort((x, y) => x - y);
  const u = nn.filter((r) => !r.ended).length;
  console.log(
    String(hp).padEnd(8) + hn.s.padEnd(16) + ne.s.padEnd(16) +
      `${m[Math.floor(m.length / 2)]?.toFixed(1)}m`.padEnd(13) + String(hn.u + ne.u + u),
  );
}
restore();
console.log('restored');
