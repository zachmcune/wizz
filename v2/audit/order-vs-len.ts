// Does tougher defence break the difficulty ordering, and at what level does it start to?
//
// Zachary's approval allows tougher defences ONLY if the ordering still holds and nothing turtles. The round-2 sweep found
// dmg 7 + sanctum 4000 reached the 15-25 length band but dropped Normal-vs-Easy to 29%, so this measures the ordering at each
// defence level to find where the tradeoff crosses.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runPool, type Job } from './ai-tournament-parallel';
import type { MatchResult } from './ai-tournament';

const ROOT = join(import.meta.dirname, '..');
const V1 = join(ROOT, '..', 'data', 'buildings');
const seeds = [1000, 1007, 1014, 1021, 1028, 1035, 1042, 1049];

const LEVELS = [
  { label: 'dmg 3 (v1)', dmg: 3, sanctum: 2000 },
  { label: 'dmg 5 sanctum 3000', dmg: 5, sanctum: 3000 },
  { label: 'dmg 7 sanctum 3000', dmg: 7, sanctum: 3000 },
  { label: 'dmg 7 sanctum 4000', dmg: 7, sanctum: 4000 },
];

const files = new Map<string, string>();
function snap(n: string) {
  const p = join(ROOT, 'data', 'buildings', `${n}.json`);
  if (!files.has(p)) files.set(p, readFileSync(p, 'utf8'));
}
function restore() {
  for (const [p, t] of files) if (existsSync(p)) writeFileSync(p, t);
}
process.on('SIGINT', () => { restore(); process.exit(130); });
process.on('uncaughtException', (e) => { restore(); console.error(e); process.exit(1); });

function set(dmg: number, sanctum: number) {
  restore();
  for (const [n, mut] of [
    ['arcane_sentry', (d: Record<string, unknown>) => { const w = d.weapon as Record<string, unknown>; w.damage = dmg; }],
    ['sanctum', (d: Record<string, unknown>) => { d.hp = sanctum; }],
  ] as const) {
    const p = join(ROOT, 'data', 'buildings', `${n}.json`);
    const d = JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>;
    mut(d);
    writeFileSync(p, JSON.stringify(d, null, 2) + '\n');
  }
}

function jobs(a: string, b: string): Job[] {
  return seeds.flatMap((seed) => [
    { seed, maxMinutes: 30, players: [
      { id: 'p1', difficulty: a as never, team: 0, faction: 'arcane', startIndex: 0 },
      { id: 'p2', difficulty: b as never, team: 1, faction: 'arcane', startIndex: 1 }] },
    { seed, maxMinutes: 30, players: [
      { id: 'p1', difficulty: a as never, team: 0, faction: 'arcane', startIndex: 1 },
      { id: 'p2', difficulty: b as never, team: 1, faction: 'arcane', startIndex: 0 }] },
  ]);
}

snap('arcane_sentry');
snap('sanctum');
console.log('level'.padEnd(24) + 'hard>normal'.padEnd(16) + 'normal>easy'.padEnd(16) + 'hard>easy'.padEnd(14) + 'unfin');
for (const L of LEVELS) {
  set(L.dmg, L.sanctum);
  const row: string[] = [];
  let unfin = 0;
  for (const [a, b] of [['hard', 'normal'], ['normal', 'easy'], ['hard', 'easy']]) {
    const res = (await runPool(jobs(a!, b!), 3)) as MatchResult[];
    let aw = 0, bw = 0;
    for (const r of res) { if (!r.ended) unfin++; else if (r.winnerTeam === 0) aw++; else if (r.winnerTeam === 1) bw++; }
    row.push(`${aw}-${bw} ${((aw / Math.max(1, aw + bw)) * 100).toFixed(0)}%`);
  }
  console.log(L.label.padEnd(24) + row.map((r) => r.padEnd(16)).join('') + String(unfin));
}
restore();
console.log('data restored');
