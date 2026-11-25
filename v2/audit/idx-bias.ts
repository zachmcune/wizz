// INDEX 0 vs INDEX 1, corners alternating, run in PARALLEL so it is quick.
// Config P: [p1@c0, p2@c1]  and  config Q: [p2@c1, p1@c0]  -- same corners, creation order flipped.
// If the INDEX-0 player wins both, the advantage is creation order. If the same NAMED player wins both, it is the id.
import { runPool, type Job } from './ai-tournament-parallel';
import type { MatchResult } from './ai-tournament';
/**
 * Arguments are taken POSITIONALLY. `vite-node script.ts --seeds a,b` passes the flag through to the runner, so
 * `process.argv.indexOf('--seeds')` finds the runner's own copy and the value can resolve to `NaN`. Positional args avoid
 * that entirely: arg 0 is the first argument after the script path.
 */
const pos = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const seeds = (pos[0] ?? '1000,1014,1035,1042').split(',').map(Number).filter(Number.isFinite);
const jobs = Number(pos[1] ?? '4');
const minutes = Number(pos[2] ?? '32');
const pl = (id: string, team: number, start: number) => ({ id, difficulty: 'normal' as never, team, faction: 'arcane', startIndex: start });
const work: { kind: 'P' | 'Q'; job: Job }[] = [];
for (const s of seeds) {
  work.push({ kind: 'P', job: { seed: s, maxMinutes: minutes, players: [pl('p1', 0, 0), pl('p2', 1, 1)] } });
  work.push({ kind: 'Q', job: { seed: s, maxMinutes: minutes, players: [pl('p2', 0, 1), pl('p1', 1, 0)] } });
}
const res = (await runPool(work.map((w) => w.job), jobs)) as MatchResult[];
let idx0 = 0, p1wins = 0, decided = 0;
const lines: string[] = [];
for (let i = 0; i < work.length; i++) {
  const w = work[i]!, r = res[i];
  if (!r) { lines.push(`${w.kind} seed ${w.job.seed}: NO RESULT`); continue; }
  if (r.winnerTeam === null) { lines.push(`${w.kind} seed ${w.job.seed}: unfinished ${r.minutes.toFixed(1)}m`); continue; }
  const winner = w.job.players.find((p) => p.team === r.winnerTeam)!;
  const idx = w.job.players.indexOf(winner);
  decided++;
  if (idx === 0) idx0++;
  if (winner.id === 'p1') p1wins++;
  lines.push(`${w.kind} seed ${String(w.job.seed).padStart(5)}: order [${w.job.players.map((p) => `${p.id}@c${p.startIndex}`).join(',')}] -> ${winner.id} (index ${idx}) ${r.minutes.toFixed(1)}m`);
}
console.log(lines.join('\n'));
console.log(`\ndecided ${decided}/${work.length}`);
console.log(`  winner was INDEX 0: ${idx0}/${decided}`);
console.log(`  winner was p1     : ${p1wins}/${decided}`);
console.log(idx0 === decided ? '  => CREATION-ORDER effect' : p1wins === decided ? '  => PLAYER-ID effect' : '  => neither alone');
