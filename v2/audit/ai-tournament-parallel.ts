// PARALLEL TOURNAMENT RUNNER.
//
// A full Phase 5 tournament is dozens of 20-30 sim-minute matches, and each one costs several minutes of CPU. Run serially
// that is hours of wall time; across four worker processes it is hours divided by four.
//
// THE PARALLELISM MUST NOT CHANGE RESULTS. Every match is a pure function of its options — the sim is a deterministic step
// function with named RNG streams, and the AI reads only its own perception — so scheduling two matches at once cannot
// affect either one. That is asserted rather than assumed: `tests/ai-parallel.test.ts` runs the same seed serially and
// through this pool and requires the outcome hashes to be identical.
//
// Usage:
//   npx vite-node audit/ai-tournament-parallel.ts --seeds 12 --minutes 35 --json out.json [--jobs 4]
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Difficulty, MatchResult, MatchupSummary, PlayerSpec } from './ai-tournament';

export interface Job {
  seed: number;
  players: PlayerSpec[];
  maxMinutes?: number;
  mapId?: string;
}

const ROOT = join(import.meta.dirname, '..');
const WORKER = join(import.meta.dirname, 'ai-run-one.ts');

/**
 * Run one match in a child process.
 *
 * The job is passed as a JSON argument rather than through stdin so a crashed worker cannot deadlock on a half-written
 * message, and stdout is parsed as a single line so log noise from the child cannot corrupt the result.
 */
export function runOneParallel(job: Job): Promise<MatchResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['vite-node', WORKER, JSON.stringify(job)], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d: Buffer) => {
      out += d.toString();
    });
    child.stderr.on('data', (d: Buffer) => {
      err += d.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`worker exited ${code}: ${err.slice(-600)}`));
        return;
      }
      // The result is the last line that parses as JSON, so stray warnings cannot break it.
      const lines = out.trim().split('\n').reverse();
      for (const line of lines) {
        if (!line.startsWith('{')) continue;
        try {
          resolve(JSON.parse(line) as MatchResult);
          return;
        } catch {
          // keep looking
        }
      }
      reject(new Error(`worker produced no JSON result: ${out.slice(-400)}`));
    });
  });
}

/** Run many jobs with at most `jobs` in flight, preserving input order in the output. */
export async function runPool(jobs: Job[], concurrency: number, onDone?: (done: number, total: number) => void): Promise<MatchResult[]> {
  const results: MatchResult[] = new Array(jobs.length);
  let next = 0;
  let done = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, jobs.length)) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= jobs.length) return;
      results[i] = await runOneParallel(jobs[i]!);
      done++;
      onDone?.(done, jobs.length);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Summarise a list of completed matches between two difficulties. */
export function summarise(label: string, a: Difficulty, b: Difficulty, results: MatchResult[]): MatchupSummary {
  let winsA = 0;
  let winsB = 0;
  let draws = 0;
  let unfinished = 0;
  let worst = 0;
  for (const r of results) {
    if (!r.ended) unfinished++;
    else if (r.winnerTeam === 0) winsA++;
    else if (r.winnerTeam === 1) winsB++;
    else draws++;
    for (const s of r.sides) worst = Math.max(worst, s.stall.longestNoSpendSeconds);
  }
  const times = results.map((r) => r.minutes).sort((x, y) => x - y);
  return {
    label,
    a,
    b,
    games: results.length,
    winsA,
    winsB,
    draws,
    unfinished,
    winRateA: results.length ? winsA / results.length : 0,
    medianMinutes: times[Math.floor(times.length / 2)] ?? 0,
    worstNoSpendSeconds: worst,
  };
}

// ------------------------------------------------------------------------------------------------ CLI
const argv = process.argv.slice(2);
const argOf = (name: string, dflt: number): number => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? Number(argv[i + 1]) : dflt;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const count = argOf('seeds', 12);
  const maxMinutes = argOf('minutes', 35);
  const concurrency = argOf('jobs', 4);
  const seeds = Array.from({ length: count }, (_, i) => 1000 + i * 7);
  const outIdx = argv.indexOf('--json');
  const out = outIdx >= 0 ? argv[outIdx + 1] : undefined;

  const matchups: [Difficulty, Difficulty][] = [
    ['hard', 'normal'],
    ['normal', 'easy'],
    ['hard', 'easy'],
    ['normal', 'normal'],
  ];

  const started = Date.now();
  const summaries: MatchupSummary[] = [];
  const allResults: Record<string, MatchResult[]> = {};

  for (const [a, b] of matchups) {
    const jobs: Job[] = seeds.map((seed) => ({
      seed,
      maxMinutes,
      players: [
        { id: 'p1', difficulty: a, team: 0, faction: 'arcane', startIndex: 0 },
        { id: 'p2', difficulty: b, team: 1, faction: 'arcane', startIndex: 1 },
      ],
    }));
    let lastLogged = 0;
    const results = await runPool(jobs, concurrency, (done, total) => {
      if (done === total || done - lastLogged >= 4) {
        lastLogged = done;
        console.log(`  ${a} vs ${b}: ${done}/${total} matches`);
      }
    });
    const s = summarise(`${a} vs ${b}`, a, b, results);
    summaries.push(s);
    allResults[s.label] = results;
    console.log(
      `${s.label.padEnd(18)} A ${s.winsA} - ${s.winsB} B  draws ${s.draws}  unfinished ${s.unfinished}` +
        `  winRateA ${(s.winRateA * 100).toFixed(0)}%  median ${s.medianMinutes} min  worstNoSpend ${s.worstNoSpendSeconds}s`,
    );
  }

  console.log(`\ntotal wall time ${((Date.now() - started) / 60000).toFixed(1)} min across ${concurrency} workers`);
  if (out) {
    writeFileSync(out, JSON.stringify({ summaries, results: allResults }, null, 2));
    console.log(`wrote ${out}`);
  }
}
