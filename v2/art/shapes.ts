// SHARED SHAPE HELPERS for the v2 art.
//
// Every asset in `art/units.ts` and `art/buildings.ts` is authored through these, so a bevel, a taper
// or a limb sweep behaves identically across the whole roster. Keeping them in one place is what
// makes 35 assets read as one art direction instead of 35 separate experiments.
//
// ARGUMENT ORDER: `bbox(width, depth, height)`. Width and depth are the footprint on the ground plane;
// height is vertical. An earlier version used `(w, h, d)` and ~20 call sites silently passed height
// where depth was meant, producing horizontal slabs where vertical fins were intended. That was the
// actual cause of "flat panels jutting out at odd angles", so the order is now fixed and documented.
import type { Part, Shape } from './mesh2';
import { PAL } from './palette2';

export type M = (typeof PAL)[keyof typeof PAL];

export function part(shape: Shape, pos: [number, number, number], material: M, extra: Partial<Part> = {}): Part {
  return { shape, pos: { x: pos[0], y: pos[1], z: pos[2] }, material: material as never, ...extra };
}

export const bbox = (w: number, d: number, h: number, bevel = Math.min(w, d) * 0.14, taper?: number): Shape =>
  taper === undefined
    ? { kind: 'bevelBox', w, d, h, bevel }
    : { kind: 'bevelBox', w, d, h, bevel, taper };

export const tube = (sections: [number, number, number, number][], sides = 8, caps = true): Shape => ({
  kind: 'tube',
  sections: sections.map(([x, y, z, r]) => ({ x, y, z, r })),
  sides,
  caps,
});

export const cap = (r: number, len: number, sides = 10): Shape => ({ kind: 'capsule', r, len, sides });
export const plate = (w0: number, w1: number, h: number, thick: number): Shape => ({ kind: 'plate', w0, w1, h, thick });
export const sph = (r: number, seg = 10): Shape => ({ kind: 'sphere', r, seg });
export const cone = (r: number, h: number, sides = 9): Shape => ({ kind: 'cone', r, h, sides });
export const cyl = (r0: number, r1: number, h: number, sides = 12): Shape => ({ kind: 'cyl', r0, r1, h, sides });
export const prism = (r: number, h: number, sides: number): Shape => ({ kind: 'prism', r, h, sides });

/** A square plinth under a building: two stepped courses, wider at the bottom. */
export function plinth(w: number, d: number, h = 3.0): Part[] {
  return [
    part(bbox(w + 4, d + 4, h * 0.55, 1.6, 0.94), [0, 0, 0], PAL.rockDeep),
    part(bbox(w + 1.5, d + 1.5, h, 1.4, 0.96), [0, 0, h * 0.36], PAL.rock),
  ];
}

/** A round plinth for towers and spires. */
export function roundPlinth(r: number, h = 3.0): Part[] {
  return [
    part(cyl(r + 2.0, r + 1.0, h * 0.6, 12), [0, 0, 0], PAL.rockDeep),
    part(cyl(r + 0.6, r, h, 12), [0, 0, h * 0.34], PAL.rock),
  ];
}

/**
 * A splayed tripod/quadpod leg, used by spires, sentries and beacons.
 *
 * The foot is deliberately pushed OUT past the leg's top so the structure gains a wide, stable base —
 * a vertical cylinder with a cone on top reads as a tree, not a machine.
 */
export function splayedLegs(count: number, spread: number, topZ: number, radius: number, mat: M, phase = 0): Part[] {
  const out: Part[] = [];
  for (let i = 0; i < count; i++) {
    const a = phase + (i / count) * Math.PI * 2;
    const dx = Math.cos(a) * spread;
    const dy = Math.sin(a) * spread;
    out.push(
      part(
        tube(
          [
            [0, 0, 0, radius],
            [dx * 0.45, dy * 0.45, topZ * 0.55, radius * 0.78],
            [dx, dy, topZ, radius * 0.62],
          ],
          7,
        ),
        [0, 0, 0],
        mat,
      ),
    );
    out.push(part(bbox(radius * 2.6, radius * 2.6, radius * 1.1, radius * 0.4), [dx, dy, radius * 0.5], mat));
  }
  return out;
}

/**
 * A vertical row of stone courses, each block offset from the last.
 *
 * `blocks` are staggered so a wall reads as masonry rather than one extruded slab.
 */
export function staggeredCourses(w: number, d: number, rows: number, blockH: number, mat: M, matTop: M, bevel = 0.55): Part[] {
  const out: Part[] = [];
  for (let r = 0; r < rows; r++) {
    const count = r === rows - 1 ? 3 : 4;
    const span = w / count;
    const z = r * blockH;
    const offset = r % 2 === 0 ? 0 : span * 0.5;
    for (let i = 0; i < count; i++) {
      const x = -w / 2 + span * (i + 0.5) + offset;
      if (x + span * 0.5 > w / 2 + 0.5) continue;
      out.push(
        part(bbox(span * 0.88, d, blockH * (0.9 + (((i * 7 + r * 3) % 5) / 5) * 0.14), bevel), [x, 0, z], r === rows - 1 ? matTop : mat, {
          rotZ: (((i + r) % 3) - 1) * 0.018,
        }),
      );
    }
  }
  return out;
}
