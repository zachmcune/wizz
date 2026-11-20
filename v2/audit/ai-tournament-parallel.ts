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

// The CLI lives in `ai-tournament-cli.ts`; this module is a pure library so tests can import it.
