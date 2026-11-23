// TEAM TERMINATION SCAN — 2v2 and 4-player free-for-all, per seed, with reported lengths.
//
// Phase 5 requires that a multiplayer match ENDS, within a 30-minute cap, on at least 6 seeds. This is the harness that
// proves it, and it prints each seed's length so a regression names the seed that broke rather than a pass/fail bit.
//
// The failure it exists for: a 2v2 ran 75+ minutes with one AI holding 39 army units that never found the enemy base.
// The AI knew of exactly one enemy structure — a 40-mana `stone_wall` — and treated that as "base located", so the
// scouting sweep was switched off and its 39 units chewed scaffolding for an hour while `a1`'s ten-building base sat
// unvisited.
//
// Usage:
//   npx vite-node audit/team-termination.ts                 # both modes, 6 seeds each
//   npx vite-node audit/team-termination.ts --mode 2v2 --seeds 1000,1001,...
//   npx vite-node audit/team-termination.ts --minutes 30 --jobs 4
import { runPool, type Job } from './ai-tournament-parallel';
import type { MatchResult } from './ai-tournament';

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
};

const modes = arg('mode', 'both');
const minutes = Number(arg('minutes', '30'));
const jobs = Number(arg('jobs', '4'));
const seedList = arg('seeds', '2001,2002,2003,2004,2005,2006')
  .split(',')
  .map(Number)
  .filter(Number.isFinite);

/** 2v2: two teams of two, teammates on opposite corners so ally pathing is exercised too. */
const twoVTwo = (seed: number): Job => ({
  seed,
  maxMinutes: minutes,
  players: [
    { id: 'a1', difficulty: 'normal' as never, team: 0, faction: 'arcane', startIndex: 0 },
    { id: 'a2', difficulty: 'normal' as never, team: 0, faction: 'arcane', startIndex: 2 },
    { id: 'b1', difficulty: 'normal' as never, team: 1, faction: 'arcane', startIndex: 1 },
    { id: 'b2', difficulty: 'normal' as never, team: 1, faction: 'arcane', startIndex: 3 },
  ],
});

/** 4-player free-for-all: every player its own team, so everyone is everyone's enemy. */
const freeForAll = (seed: number): Job => ({
  seed,
  maxMinutes: minutes,
  players: [
    { id: 'p1', difficulty: 'normal' as never, team: 0, faction: 'arcane', startIndex: 0 },
    { id: 'p2', difficulty: 'normal' as never, team: 1, faction: 'arcane', startIndex: 1 },
    { id: 'p3', difficulty: 'normal' as never, team: 2, faction: 'arcane', startIndex: 2 },
    { id: 'p4', difficulty: 'normal' as never, team: 3, faction: 'arcane', startIndex: 3 },
  ],
});

async function scan(label: string, build: (seed: number) => Job): Promise<{ label: string; rows: string[]; ended: number; lengths: number[] }> {
  const results = (await runPool(seedList.map(build), jobs, (done, total) => {
    if (done % 2 === 0 || done === total) process.stderr.write(`  ${label}: ${done}/${total}\n`);
  })) as MatchResult[];

  const rows: string[] = [];
  const lengths: number[] = [];
  let ended = 0;
  for (const r of results.sort((x, y) => x.seed - y.seed)) {
    if (r.ended) ended++;
    lengths.push(r.minutes);
    const worstIdle = Math.max(...r.sides.map((s) => s.stall.longestIdleArmySeconds));
    const worstNoSpend = Math.max(...r.sides.map((s) => s.stall.longestNoSpendSeconds));
    const alive = r.sides.filter((s) => !s.defeated).map((s) => s.id);
    rows.push(
      `  seed ${String(r.seed).padStart(5)}  ${r.ended ? 'ENDED  ' : 'UNFINISHED'}  ${r.minutes.toFixed(1).padStart(5)} min` +
        `  winner=${r.winnerTeam === null ? '-' : `team${r.winnerTeam}`}` +
        `  alive=[${alive.join(',')}]  worstIdleArmy=${worstIdle}s  worstNoSpend=${worstNoSpend}s`,
    );
  }
  return { label, rows, ended, lengths };
}

const scans: { label: string; rows: string[]; ended: number; lengths: number[] }[] = [];
if (modes === 'both' || modes === '2v2') scans.push(await scan('2v2', twoVTwo));
if (modes === 'both' || modes === 'ffa') scans.push(await scan('ffa', freeForAll));

let failed = false;
for (const s of scans) {
  const sorted = [...s.lengths].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const overCap = s.lengths.filter((m) => m > minutes).length;
  console.log(`\n${s.label}: ${s.ended}/${s.lengths.length} ended within ${minutes} min; median ${median.toFixed(1)} min; longest ${Math.max(...s.lengths).toFixed(1)} min`);
  console.log(s.rows.join('\n'));
  if (s.ended !== s.lengths.length || overCap > 0) failed = true;
}
process.exit(failed ? 1 : 0);
