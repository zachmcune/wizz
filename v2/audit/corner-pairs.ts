// Which corners win, over ALL pairings? A right-side advantage would favour 1 and 3; a first-of-pair advantage
// would favour whichever index comes first in the pair list.
import { runPool, type Job } from './ai-tournament-parallel';
import type { MatchResult } from './ai-tournament';
const pos = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const seeds = (pos[0] ?? '1000,1014,1035,1042,1051,1063').split(',').map(Number).filter(Number.isFinite);
const jobs = Number(pos[1] ?? '4');
const minutes = Number(pos[2] ?? '34');
const pl = (id: string, team: number, start: number) => ({ id, difficulty: 'normal' as never, team, faction: 'arcane', startIndex: start });
const PAIRS: [number, number][] = [[0, 1], [1, 0], [0, 3], [3, 0], [2, 3], [3, 2], [1, 2], [2, 1], [0, 2], [2, 0], [1, 3], [3, 1]];
const work: { a: number; b: number; job: Job }[] = [];
for (const seed of seeds) for (const [a, b] of PAIRS) work.push({ a, b, job: { seed, maxMinutes: minutes, players: [pl('p1', 0, a), pl('p2', 1, b)] } });
const res = (await runPool(work.map((w) => w.job), jobs)) as MatchResult[];
const byCorner = new Map<number, { w: number; n: number }>();
const bySlot = new Map<string, number>();
let unfinished = 0;
for (let i = 0; i < work.length; i++) {
  const w = work[i]!, r = res[i];
  if (!r) continue;
  if (!r.ended) { unfinished++; continue; }
  const corner = r.winnerTeam === 0 ? w.a : w.b;
  const t = byCorner.get(corner) ?? { w: 0, n: 0 };
  t.w++; t.n++;
  byCorner.set(corner, t);
  const slot = r.winnerTeam === 0 ? 'p1(index0)' : 'p2(index1)';
  bySlot.set(slot, (bySlot.get(slot) ?? 0) + 1);
}
console.log(`unfinished ${unfinished}/${work.length}`);
console.log('WINS BY CORNER (each corner plays in equal numbers of games):');
for (const c of [0, 1, 2, 3]) {
  const t = byCorner.get(c);
  console.log(`  corner ${c}: ${t ? `${t.w}/${t.n} = ${((100 * t.w) / t.n).toFixed(1)}%` : 'never won'}`);
}
console.log('WINS BY SLOT:', [...bySlot.entries()].map(([k, v]) => `${k} ${v}`).join(', '));
// Also: for each ordered pair, who won and where.
console.log('\nPER PAIRING (decided only):');
for (const [a, b] of PAIRS) {
  let p1w = 0, n = 0;
  for (let i = 0; i < work.length; i++) {
    const w = work[i]!;
    if (w.a !== a || w.b !== b) continue;
    if (!res[i] || !res[i]!.ended) continue;
    n++;
    if (res[i]!.winnerTeam === 0) p1w++;
  }
  console.log(`  p1@corner${a} vs p2@corner${b}: p1 ${p1w}/${n}`);
}
