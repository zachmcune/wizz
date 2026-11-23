// SEED VARIETY AND FAIRNESS — the two properties that make a win-rate study meaningful.
//
// WHY BOTH ARE ASSERTED TOGETHER. A fairness measurement is only as trustworthy as the number of DISTINCT games
// behind it. Two failure modes both look like a clean result and both were measured on this branch:
//
//   • SEED COLLAPSE. Before per-pass cooldown jitter, 22 mirror seeds produced 9 distinct games — seeds
//     1007/1014, 1042/1077/1144 and 1056/1084/1088/1130 were byte-identical. A 44-game "44-sample" study then has
//     an effective sample size near 9, and its confidence interval is far too narrow.
//   • SLOT BIAS. Before the reflection-invariant tie-breaks, the mirror measured 18.2% (95% CI 9.5–32.0%) — a real,
//     reproducible advantage for one creation order, not noise.
//
// So this suite gates BOTH: seeds must produce different games, and identical AIs must split evenly.
//
// The mirror case is deliberately run at a sample size the CI can afford (12 games here; the 44-game measurement
// lives in `docs/proof/phase-5/ai/phase6-fairness.md` and in the slow AI job) because the assertion is about the
// INTERVAL containing 50%, which is a much weaker and more honest claim than expecting a point estimate of 0.500.
import { describe, expect, it } from 'vitest';
import { loadRegistry } from '../../src/data/loader';
import { initMatch } from '../../src/sim/factory';
import { stepSimulation } from '../../src/sim/step';
import { hashState } from '../../src/sim/hash';
import { AiDriver } from '../../src/ai/driver';

const TICK_HZ = 20;

interface MirrorOutcome {
  winnerTeam: number | null;
  minutes: number;
  hash: string;
}

/** One mirror match: two identical Normal AIs, given corner assignments in the order supplied. */
function playMirror(seed: number, corners: [number, number], maxMinutes = 34): MirrorOutcome {
  const registry = loadRegistry();
  const { state, services } = initMatch(registry, {
    mapId: 'duel_glade',
    seed,
    oneSuperweaponPerPlayer: false,
    players: [
      { id: 'p1', controller: 'ai', aiDifficulty: 'normal', team: 0, color: '#4f9dff', factionId: 'arcane', startIndex: corners[0] },
      { id: 'p2', controller: 'ai', aiDifficulty: 'normal', team: 1, color: '#ff5d5d', factionId: 'arcane', startIndex: corners[1] },
    ],
  } as never);
  const driver = new AiDriver(registry, services);
  const limit = maxMinutes * 60 * TICK_HZ;
  while (!state.ended && state.tick < limit) stepSimulation(state, services, [], driver.hook);
  return {
    winnerTeam: state.ended ? state.winnerTeam : null,
    minutes: state.tick / TICK_HZ / 60,
    hash: hashState(state),
  };
}

/** Wilson score interval — correct at these sample sizes, unlike the normal approximation. */
function wilson(successes: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1];
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

describe('seed variety: different seeds must produce different games', () => {
  it('8 seeds produce 8 distinct final states and several distinct lengths', () => {
    const seeds = [1000, 1007, 1014, 1021, 1035, 1042, 1049, 1056];
    const results = seeds.map((s) => playMirror(s, [0, 1]));

    const hashes = new Set(results.map((r) => r.hash));
    const lengths = new Set(results.map((r) => r.minutes.toFixed(1)));

    /**
     * DISTINCT HASHES is the strict form and it is what must hold: two seeds collapsing to the same trajectory means
     * the seed did nothing. `distinct lengths` is the player-visible consequence and is reported for diagnosis.
     */
    if (hashes.size !== seeds.length) {
      const byHash = new Map<string, number[]>();
      seeds.forEach((s, i) => {
        const list = byHash.get(results[i]!.hash) ?? [];
        list.push(s);
        byHash.set(results[i]!.hash, list);
      });
      const collisions = [...byHash.values()].filter((v) => v.length > 1);
      throw new Error(`seed collapse: ${seeds.length} seeds -> ${hashes.size} games; collisions ${JSON.stringify(collisions)}`);
    }
    expect(hashes.size).toBe(seeds.length);
    // A weaker but still meaningful signal: the games are not merely hash-different, they PLAY differently.
    expect(lengths.size).toBeGreaterThanOrEqual(4);
  }, 1_800_000);
});

describe('mirror fairness: identical AIs split evenly', () => {
  it('the mirror win rate has a 95% interval that contains 50%', () => {
    /**
     * BOTH CORNER ASSIGNMENTS PER SEED, which is what separates a slot bias from a corner bias: a slot bias follows
     * the creation order and a corner bias follows the base, so playing each seed twice with the assignments swapped
     * makes a pure corner effect cancel while a slot effect does not.
     */
    const seeds = [1000, 1007, 1014, 1021, 1028, 1035];
    let firstWins = 0;
    let decided = 0;
    let unfinished = 0;
    const lines: string[] = [];

    for (const seed of seeds) {
      for (const corners of [
        [0, 1],
        [1, 0],
      ] as [number, number][]) {
        const r = playMirror(seed, corners);
        if (r.winnerTeam === null) {
          unfinished++;
          lines.push(`seed ${seed} corners ${corners.join('/')}: UNFINISHED at ${r.minutes.toFixed(1)}m`);
          continue;
        }
        decided++;
        if (r.winnerTeam === 0) firstWins++;
        lines.push(`seed ${seed} corners ${corners.join('/')}: team ${r.winnerTeam} at ${r.minutes.toFixed(1)}m`);
      }
    }

    const [lo, hi] = wilson(firstWins, decided);
    // The interval is the evidence, so it is always printed — a passing test with no numbers is not proof.
    console.log(
      `MIRROR: first-listed ${firstWins}/${decided} = ${((100 * firstWins) / decided).toFixed(1)}%, ` +
        `95% CI ${(100 * lo).toFixed(1)}-${(100 * hi).toFixed(1)}%, unfinished ${unfinished}\n  ${lines.join('\n  ')}`,
    );

    expect(decided, 'no mirror match was decided').toBeGreaterThanOrEqual(10);
    /**
     * NO MATCH MAY FAIL TO RESOLVE. A mirror that stalls is a fairness and a termination problem at once, and it
     * would silently shrink the sample the interval is computed from.
     */
    expect(unfinished, `${unfinished} mirror matches failed to resolve inside 34 minutes`).toBe(0);

    expect(lo, `95% CI ${(100 * lo).toFixed(1)}-${(100 * hi).toFixed(1)}% excludes 50% (favours the first slot)`).toBeLessThanOrEqual(0.5);
    expect(hi, `95% CI ${(100 * lo).toFixed(1)}-${(100 * hi).toFixed(1)}% excludes 50% (favours the second slot)`).toBeGreaterThanOrEqual(0.5);
  }, 1_800_000);
});
