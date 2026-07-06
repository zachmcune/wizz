// Deterministic seeded PRNG (mulberry32). The sim must use ONLY this - never Math.random().
// The rng state lives in GameState so replays and saves reproduce identically.

export function nextRandom(state: number): { value: number; state: number } {
  let t = (state + 0x6d2b79f5) | 0;
  const nextState = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: nextState };
}

/** A tiny stateful wrapper used inside a single tick. Mutations write back to GameState.rngState. */
export class Rng {
  constructor(public state: number) {}

  float(): number {
    const r = nextRandom(this.state);
    this.state = r.state;
    return r.value;
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.float() * (max - min + 1));
  }

  range(min: number, max: number): number {
    return min + this.float() * (max - min);
  }

  /** Deterministic seed from a string (for map/content seeding). */
  static seedFromString(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
}
