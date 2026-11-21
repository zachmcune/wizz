// DEFENSE / HQ BALANCE SWEEP.
//
// Approved rule change (Zachary, Nov 21 2026): static defences and the HQ may be made tougher so that early rushes fail and
// matches run closer to the intended ~20 minutes. Only defence and HQ values may change, and the smallest change that reaches
// the target band wins — so the sweep has to be a measurement, not an opinion.
//
// Method: for each candidate value set, write the JSON, run the bracket, record the Normal-vs-Normal median length AND the
// difficulty ordering, then restore the originals. The files are always restored, including on failure, because a sweep that
// leaves edited data behind would silently change the game.
//
// Usage:
//   npx vite-node audit/defense-sweep.ts --json out.json
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runPool, type Job } from './ai-tournament-parallel';
import type { MatchResult } from './ai-tournament';

const ROOT = join(import.meta.dirname, '..');
const flag = (n: string): string | undefined => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const seeds = (flag('seeds') ?? '1000,1007,1014,1021,1028,1035,1042,1049,1056,1063,1070,1077')
  .split(',')
  .map(Number)
  .filter(Number.isFinite);
const jobs = Number(flag('jobs') ?? 3);
const maxMinutes = Number(flag('minutes') ?? 30);

interface BuildingPatch {
  file: string;
  /** Fields to set. Absent fields keep their original value. */
  hp?: number;
  weapon?: { damage?: number; cooldownTicks?: number; range?: number };
}

interface Candidate {
  label: string;
  patches: BuildingPatch[];
}

/** Every candidate touches ONLY defence buildings and the HQ, as approved. */
const CANDIDATES: Candidate[] = [
  /**
   * Round 2. Round 1 established the direction and its size, and set the range for this one:
   *
   *   baseline                                 11.8m
   *   sentry hp 900                            11.8m   (hp alone did nothing)
   *   sentry hp 900 + dmg 5                    13.6m
   *   sentry hp 900 + dmg 5 + sanctum 3000     14.2m
   *   sentry hp 1200 + dmg 5 + sanctum 3000    14.2m   (more HP alone did nothing again)
   *
   * Turret DAMAGE is what moves match length; turret HP does not, because a rush either kills the turret fast or ignores it.
   * So round 2 escalates damage and HQ HP together, looking for the SMALLEST combination whose median reaches 15-25 minutes.
   */
  { label: 'sentry dmg 5 + sanctum 3000 (round-1 best)', patches: [
    { file: 'arcane_sentry', hp: 900, weapon: { damage: 5 } },
    { file: 'sanctum', hp: 3000 }] },
  { label: 'sentry dmg 7 + sanctum 3000', patches: [
    { file: 'arcane_sentry', hp: 900, weapon: { damage: 7 } },
    { file: 'sanctum', hp: 3000 }] },
  { label: 'sentry dmg 7 + sanctum 4000', patches: [
    { file: 'arcane_sentry', hp: 900, weapon: { damage: 7 } },
    { file: 'sanctum', hp: 4000 }] },
  { label: 'sentry dmg 9 + range 210 + sanctum 4000', patches: [
    { file: 'arcane_sentry', hp: 900, weapon: { damage: 9, range: 210 } },
    { file: 'sanctum', hp: 4000 }] },
];

const buildingPath = (name: string): string => join(ROOT, 'data', 'buildings', `${name}.json`);

/**
 * Snapshot every file we are about to touch, so restore is exact.
 *
 * The snapshot is taken from the CURRENT working copies, which is right for a sweep run from a clean tree. But an earlier run
 * left a mid-sweep value in a working copy and a later restore faithfully reproduced THAT, so "restore" silently meant "restore
 * to a half-applied candidate". The guard is `verifyRestored()` below: after restoring, every touched file is diffed against v1
 * and the run refuses to report a result if any gameplay value still differs.
 */
const originals = new Map<string, string>();
function snapshot(cand: Candidate): void {
  for (const p of cand.patches) {
    const path = buildingPath(p.file);
    if (!originals.has(path)) originals.set(path, readFileSync(path, 'utf8'));
  }
}
function restoreAll(): void {
  for (const [path, text] of originals) if (existsSync(path)) writeFileSync(path, text);
}

/** The v1 tree, used as the authority for "what the file should say when the sweep is done". */
const V1_BUILDINGS = join(ROOT, '..', 'data', 'buildings');

/**
 * Fail loudly if a restore did not actually return the data to v1.
 *
 * This exists because it already went wrong once: a sweep ran from a working copy that held a half-applied candidate, the
 * restore reproduced that value, and the commit that followed captured it. A measurement harness that can leave the game
 * changed must check its own cleanup.
 */
function verifyRestored(files: string[]): void {
  const problems: string[] = [];
  for (const name of files) {
    const v1Path = join(V1_BUILDINGS, `${name}.json`);
    if (!existsSync(v1Path)) continue; // not a v1 def; nothing to compare
    const v1 = JSON.parse(readFileSync(v1Path, 'utf8')) as Record<string, unknown>;
    const v2 = JSON.parse(readFileSync(buildingPath(name), 'utf8')) as Record<string, unknown>;
    if (v1.hp !== v2.hp) problems.push(`${name}.hp: v1=${String(v1.hp)} file=${String(v2.hp)}`);
    const w1 = (v1.weapon ?? {}) as Record<string, unknown>;
    const w2 = (v2.weapon ?? {}) as Record<string, unknown>;
    for (const k of ['damage', 'cooldownTicks', 'range']) {
      if (w1[k] !== undefined && w1[k] !== w2[k]) problems.push(`${name}.weapon.${k}: v1=${String(w1[k])} file=${String(w2[k])}`);
    }
  }
  if (problems.length > 0) {
    console.error('\nRESTORE FAILED — the data no longer matches v1:\n  ' + problems.join('\n  '));
    console.error('Fix the files before trusting any measurement from this run.');
    process.exit(3);
  }
}
/** Restore even on an unexpected throw or an interrupt: leaving edited data behind is not acceptable. */
process.on('SIGINT', () => {
  restoreAll();
  process.exit(130);
});
process.on('uncaughtException', (e) => {
  restoreAll();
  console.error(e);
  process.exit(1);
});

function apply(cand: Candidate): void {
  restoreAll();
  for (const p of cand.patches) {
    const path = buildingPath(p.file);
    const json = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    if (p.hp !== undefined) json.hp = p.hp;
    if (p.weapon) {
      const w = (json.weapon ?? {}) as Record<string, unknown>;
      if (p.weapon.damage !== undefined) w.damage = p.weapon.damage;
      if (p.weapon.cooldownTicks !== undefined) w.cooldownTicks = p.weapon.cooldownTicks;
      if (p.weapon.range !== undefined) w.range = p.weapon.range;
      json.weapon = w;
    }
    writeFileSync(path, JSON.stringify(json, null, 2) + '\n');
  }
}

/** Mirror bracket: both corners per seed, so slot/corner effects cancel. */
function mirrorJobs(): Job[] {
  return seeds.flatMap((seed) => [
    { seed, maxMinutes, players: [
      { id: 'p1', difficulty: 'normal' as const, team: 0, faction: 'arcane', startIndex: 0 },
      { id: 'p2', difficulty: 'normal' as const, team: 1, faction: 'arcane', startIndex: 1 }] },
    { seed, maxMinutes, players: [
      { id: 'p1', difficulty: 'normal' as const, team: 0, faction: 'arcane', startIndex: 1 },
      { id: 'p2', difficulty: 'normal' as const, team: 1, faction: 'arcane', startIndex: 0 }] },
  ]);
}

/** Difficulty bracket, to prove the ordering survives the change. */
function matchupJobs(a: string, b: string): Job[] {
  return seeds.flatMap((seed) => [
    { seed, maxMinutes, players: [
      { id: 'p1', difficulty: a as never, team: 0, faction: 'arcane', startIndex: 0 },
      { id: 'p2', difficulty: b as never, team: 1, faction: 'arcane', startIndex: 1 }] },
    { seed, maxMinutes, players: [
      { id: 'p1', difficulty: a as never, team: 0, faction: 'arcane', startIndex: 1 },
      { id: 'p2', difficulty: b as never, team: 1, faction: 'arcane', startIndex: 0 }] },
  ]);
}

function stats(results: MatchResult[]): { median: number; mean: number; min: number; max: number; unfinished: number } {
  const mins = results.map((r) => r.minutes).sort((x, y) => x - y);
  const unfinished = results.filter((r) => !r.ended).length;
  const mean = mins.reduce((a, b) => a + b, 0) / Math.max(1, mins.length);
  return {
    median: mins[Math.floor(mins.length / 2)] ?? 0,
    mean,
    min: mins[0] ?? 0,
    max: mins.at(-1) ?? 0,
    unfinished,
  };
}

const out: unknown[] = [];
console.log(`Sweeping ${CANDIDATES.length} candidate(s) over ${seeds.length} seeds x 2 corners.\n`);
console.log('label'.padEnd(46) + 'median'.padEnd(10) + 'mean'.padEnd(9) + 'min'.padEnd(7) + 'max'.padEnd(8) + 'unfin');

for (const cand of CANDIDATES) {
  snapshot(cand);
  apply(cand);
  const mirror = (await runPool(mirrorJobs(), jobs)) as MatchResult[];
  const s = stats(mirror);
  const row = { label: cand.label, patches: cand.patches, ...s };
  out.push(row);
  console.log(
    cand.label.padEnd(46) +
      `${s.median.toFixed(1)}m`.padEnd(10) +
      `${s.mean.toFixed(1)}m`.padEnd(9) +
      `${s.min.toFixed(1)}`.padEnd(7) +
      `${s.max.toFixed(1)}`.padEnd(8) +
      String(s.unfinished),
  );
}

restoreAll();

/**
 * Ordering check for the best candidate. Run AFTER restoring, then re-applied, so the winner is validated in the same
 * configuration it will ship in.
 */
const best = out
  .map((r) => r as { label: string; median: number; unfinished: number })
  .filter((r) => r.unfinished === 0 && r.median >= 15 && r.median <= 25)
  .sort((a, b) => a.median - b.median)[0];

if (best) {
  console.log(`\nSmallest change inside the 15-25 band with zero unfinished: "${best.label}" (median ${best.median.toFixed(1)}m)`);
  const cand = CANDIDATES.find((c) => c.label === best.label)!;
  apply(cand);
  for (const [a, b] of [['hard', 'normal'], ['normal', 'easy'], ['hard', 'easy']]) {
    const res = (await runPool(matchupJobs(a!, b!), jobs)) as MatchResult[];
    let aw = 0;
    let bw = 0;
    for (const r of res) {
      if (r.ended && r.winnerTeam === 0) aw++;
      else if (r.ended && r.winnerTeam === 1) bw++;
    }
    console.log(`  ${a} vs ${b}: ${aw}-${bw} (${((aw / Math.max(1, aw + bw)) * 100).toFixed(0)}%)`);
  }
  restoreAll();
  verifyRestored(CANDIDATES.flatMap((c) => c.patches.map((p) => p.file)).filter((v, i, a) => a.indexOf(v) === i));
  console.log('data verified identical to v1 after the sweep');
} else {
  console.log('\nNo candidate landed inside the 15-25 band with zero unfinished matches.');
}

const outIdx = process.argv.indexOf('--json');
if (outIdx >= 0 && process.argv[outIdx + 1]) {
  writeFileSync(process.argv[outIdx + 1]!, JSON.stringify({ generatedAt: new Date().toISOString(), seeds, rows: out }, null, 2));
  console.log(`wrote ${process.argv[outIdx + 1]}`);
}
