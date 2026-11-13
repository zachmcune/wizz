// Deterministic seeded PRNG. The simulation must use ONLY this — never Math.random().
//
// v1 shipped a seeded `rngState` that nothing ever drew from, so every match with a given
// lobby configuration played out identically regardless of the seed. v2 fixes that at the
// root: there is no global RNG object and no ambient state. Callers hold an `Rng` derived
// from the match seed through a NAMED STREAM, which gives three properties we rely on:
//
//   1. Reproducibility — same seed + same stream + same draw order ⇒ same numbers, forever.
//   2. Stream isolation — adding a draw to the `map` stream cannot shift the `ai` stream, so
//      tuning one subsystem never silently changes another (a classic hidden-coupling bug).
//   3. Observability — `Rng.draws` lets tests assert that a stream was actually consumed,
//      which is exactly the check v1 was missing.
//
// The algorithm is mulberry32: 2^32 period, 32-bit safe with Math.imul, no float accumulation.

/** FNV-1a over a string, used to name streams from the match seed. */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Mix two 32-bit values into one. Used to fold the stream name into the seed. */
function mix32(a: number, b: number): number {
  let h = (a ^ Math.imul(b, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97) >>> 0;
  return (h ^ (h >>> 15)) >>> 0;
}

export class Rng {
  private s: number;
  /** Number of values drawn. Tests use this to prove a stream is actually consumed. */
  draws = 0;

  constructor(seed: number, readonly stream = 'default') {
    // A zero state is a fixed point for some generators; nudge it off the origin.
    const base = (seed >>> 0) ^ 0x9e3779b9;
    this.s = mix32(base, hashString(stream));
  }

  /** Raw 32-bit unsigned draw. Advances the stream. */
  uint32(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    this.draws++;
    return (t ^ (t >>> 14)) >>> 0;
  }

  /** Float in [0, 1). */
  float(): number {
    return this.uint32() / 4294967296;
  }

  /** Integer in [min, max] inclusive. Throws on an empty or reversed range. */
  int(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max)) {
      throw new Error(`Rng.int requires integer bounds, got ${min}..${max}`);
    }
    if (max < min) throw new Error(`Rng.int requires min <= max, got ${min}..${max}`);
    const span = max - min + 1;
    // Rejection sampling keeps the distribution uniform instead of modulo-biased.
    const limit = 4294967296 - (4294967296 % span);
    let v = this.uint32();
    while (v >= limit) v = this.uint32();
    return min + (v % span);
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + this.float() * (max - min);
  }

  /** True with probability `p`. `p <= 0` and `p >= 1` are exact and draw nothing. */
  chance(p: number): boolean {
    if (p <= 0) return false;
    if (p >= 1) return true;
    return this.float() < p;
  }

  /** Uniformly pick one element. Returns `undefined` for an empty list. */
  pick<T>(items: readonly T[]): T | undefined {
    if (items.length === 0) return undefined;
    return items[this.int(0, items.length - 1)];
  }

  /** In-place Fisher–Yates shuffle (deterministic for a given stream state). */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const a = items[i]!;
      items[i] = items[j]!;
      items[j] = a;
    }
    return items;
  }

  /** Non-destructive copy, e.g. to snapshot for a replay checkpoint. */
  clone(): Rng {
    const copy = new Rng(0, this.stream);
    copy.s = this.s;
    copy.draws = this.draws;
    return copy;
  }

  /** Export the raw state so it can live inside `GameState` and be hashed. */
  state(): number {
    return this.s;
  }

  /** Restore from an exported state (save/load, lockstep snapshot). */
  static fromState(state: number, stream = 'default'): Rng {
    const rng = new Rng(0, stream);
    rng.s = state >>> 0;
    return rng;
  }
}

/**
 * Named RNG streams derived from one match seed.
 *
 * Every consumer asks for its own stream, so draws are independent between subsystems. The set
 * of names is closed on purpose: a typo creates a different stream silently otherwise, which
 * would be a determinism bug that only shows up as an unexplained desync.
 */
export const RNG_STREAMS = ['map', 'ai', 'spawn', 'cosmetic'] as const;
export type RngStream = (typeof RNG_STREAMS)[number];

export function streamFor(seed: number, stream: RngStream): Rng {
  return new Rng(seed, stream);
}
