// RUN ONE MATCH AND PRINT ITS RESULT AS JSON.
//
// The worker entry point for the parallel tournament harness. Keeping it a separate process (rather than a worker thread)
// means it needs no special handling for TypeScript: each child is just `vite-node` running this file, which is exactly how
// a serial run works. Process startup is ~1 s against a multi-minute match, so the overhead is noise.
//
// Usage: npx vite-node audit/ai-run-one.ts '<match options as JSON>'
import { runMatch, type Difficulty, type PlayerSpec } from './ai-tournament';

interface Job {
  seed: number;
  players: PlayerSpec[];
  maxMinutes?: number;
  mapId?: string;
}

const raw = process.argv[2];
if (!raw) {
  console.error('usage: ai-run-one.ts <json>');
  process.exit(2);
}
const job = JSON.parse(raw) as Job;

/**
 * Normalise difficulty strings defensively.
 *
 * The harness passes literal difficulties, but a typo would silently fall back to Normal in `profileFor`, which would make a
 * difficulty comparison quietly wrong. Failing loudly here keeps the tournament honest.
 */
const VALID: Difficulty[] = ['easy', 'normal', 'hard'];
for (const p of job.players) {
  if (!VALID.includes(p.difficulty)) {
    console.error(`invalid difficulty: ${p.difficulty}`);
    process.exit(3);
  }
}

const result = runMatch({
  seed: job.seed,
  players: job.players,
  maxMinutes: job.maxMinutes,
  mapId: job.mapId,
});
// A single line of JSON on stdout, so the parent can parse it without interleaving with any other output.
process.stdout.write(`${JSON.stringify(result)}\n`);
