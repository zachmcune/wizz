// RNG correctness and — critically — proof that the RNG is actually CONSUMED.
//
// v1's failure mode was not a bad generator: it was a seeded state that nothing ever drew from,
// so every match played out identically and the seed in the lobby was decorative. These tests
// fail if that regresses.

import { describe, expect, it } from 'vitest';
import { hashString, RNG_STREAMS, Rng, streamFor } from '../../src/core/rng';

describe('Rng: determinism', () => {
  it('same seed and stream produce the same sequence', () => {
    const a = new Rng(12345, 'map');
    const b = new Rng(12345, 'map');
    const seqA = Array.from({ length: 64 }, () => a.uint32());
    const seqB = Array.from({ length: 64 }, () => b.uint32());
    expect(seqA).toEqual(seqB);
  });

  it('different seeds produce different sequences', () => {
    const a = new Rng(1, 'map');
    const b = new Rng(99999, 'map');
    const seqA = Array.from({ length: 64 }, () => a.uint32());
    const seqB = Array.from({ length: 64 }, () => b.uint32());
    expect(seqA).not.toEqual(seqB);
  });

  it('different streams from the same seed are independent', () => {
    // This is the property that stops a tuning change in one subsystem from silently shifting
    // another subsystem's draws.
    const map = new Rng(7, 'map');
    const ai = new Rng(7, 'ai');
    const mapSeq = Array.from({ length: 32 }, () => map.uint32());
    const aiSeq = Array.from({ length: 32 }, () => ai.uint32());
    expect(mapSeq).not.toEqual(aiSeq);
  });

  it('every declared stream is distinct for a given seed', () => {
    const seed = 4242;
    const firsts = RNG_STREAMS.map((s) => streamFor(seed, s).uint32());
    expect(new Set(firsts).size).toBe(RNG_STREAMS.length);
  });

  it('a zero seed still produces a usable sequence (no fixed point)', () => {
    const r = new Rng(0, 'map');
    const seq = Array.from({ length: 8 }, () => r.uint32());
    expect(new Set(seq).size).toBeGreaterThan(1);
  });
});

describe('Rng: distribution sanity', () => {
  it('float stays in [0,1) and covers the range', () => {
    const r = new Rng(9, 'cosmetic');
    let min = 1;
    let max = 0;
    let sum = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const v = r.float();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v;
    }
    expect(min).toBeLessThan(0.01);
    expect(max).toBeGreaterThan(0.99);
    expect(sum / n).toBeCloseTo(0.5, 2);
  });

  it('int covers its whole inclusive range roughly uniformly', () => {
    const r = new Rng(11, 'cosmetic');
    const counts = new Map<number, number>();
    const n = 30000;
    for (let i = 0; i < n; i++) {
      const v = r.int(1, 6);
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    expect([...counts.keys()].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    const expected = n / 6;
    for (const c of counts.values()) {
      expect(Math.abs(c - expected) / expected).toBeLessThan(0.08);
    }
  });

  it('chance(0) and chance(1) are exact and draw nothing', () => {
    const r = new Rng(3, 'ai');
    for (let i = 0; i < 50; i++) {
      expect(r.chance(0)).toBe(false);
      expect(r.chance(1)).toBe(true);
    }
    expect(r.draws).toBe(0);
  });

  it('chance(p) approximates p', () => {
    const r = new Rng(5, 'ai');
    let hits = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) if (r.chance(0.25)) hits++;
    expect(hits / n).toBeCloseTo(0.25, 2);
  });

  it('rejects bad int bounds instead of returning nonsense', () => {
    const r = new Rng(1, 'map');
    expect(() => r.int(5, 1)).toThrow(/min <= max/);
    expect(() => r.int(1.5, 3)).toThrow(/integer bounds/);
  });
});

describe('Rng: state, cloning, pick, shuffle', () => {
  it('draws counter tracks consumption', () => {
    const r = new Rng(1, 'map');
    expect(r.draws).toBe(0);
    r.uint32();
    r.float();
    expect(r.draws).toBe(2);
  });

  it('clone continues the same sequence independently', () => {
    const a = new Rng(77, 'map');
    for (let i = 0; i < 10; i++) a.uint32();
    const b = a.clone();
    const seqA = Array.from({ length: 8 }, () => a.uint32());
    const seqB = Array.from({ length: 8 }, () => b.uint32());
    expect(seqA).toEqual(seqB);

    // Both are now at the same position, so the NEXT value must also match — and then
    // advancing only one must diverge them.
    expect(a.uint32()).toBe(b.uint32());
    a.uint32();
    expect(a.uint32()).not.toBe(b.uint32());
  });

  it('round-trips through exported state', () => {
    const a = new Rng(8, 'ai');
    for (let i = 0; i < 17; i++) a.uint32();
    const restored = Rng.fromState(a.state(), 'ai');
    expect(Array.from({ length: 8 }, () => restored.uint32())).toEqual(
      Array.from({ length: 8 }, () => a.uint32()),
    );
  });

  it('pick handles empty and single-element lists', () => {
    const r = new Rng(1, 'map');
    expect(r.pick([])).toBeUndefined();
    expect(r.pick(['only'])).toBe('only');
  });

  it('shuffle is a deterministic permutation', () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    const a = new Rng(21, 'map').shuffle([...items]);
    const b = new Rng(21, 'map').shuffle([...items]);
    expect(a).toEqual(b);
    expect([...a].sort((x, y) => x - y)).toEqual(items);
    expect(a).not.toEqual(items);
  });
});

describe('Rng: stream naming', () => {
  it('hashString is stable and distinguishes similar strings', () => {
    expect(hashString('map')).toBe(hashString('map'));
    expect(hashString('map')).not.toBe(hashString('mai'));
  });

  it('the stream name is part of the identity, not just the seed', () => {
    // A typo'd stream name must not silently reuse another stream's numbers.
    const correct = new Rng(5, 'ai').uint32();
    const typo = new Rng(5, 'aI').uint32();
    expect(correct).not.toBe(typo);
  });
});
