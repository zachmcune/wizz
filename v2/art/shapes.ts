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

/** World units per footprint tile. Mirrors `TILE` in `core/constants.ts`. */
export const TILE_WORLD = 32;

/**
 * How tall the foundation kerb is, in world units.
 *
 * Exported so the measurement tooling and the art agree on where "pad" ends and "building" begins — a second,
 * hand-written number in the audit script would drift the moment the kerb changed, and the pad/structure ratio would
 * silently start measuring the wrong thing.
 */
export const FOUNDATION_TOP = 1.3;

/**
 * A plinth that fills its footprint EXACTLY.
 *
 * `footprint` is in TILES, matching the building definition, and the lower course spans exactly
 * `footprint * TILE` world units — the same square the terrain draws for those tiles. The upper course
 * is inset, which is what makes the plinth read as a stepped foundation rather than a single slab.
 *
 * Why the signature changed: the old `plinth(w, d)` was called with hand-picked numbers like
 * `plinth(44, 44)` and then padded by +4, and those numbers bore no fixed relationship to the building's
 * declared footprint. A 2x2 building (64 world units) might get a 48-unit plinth: only 75% of its own
 * footprint, leaving the base visually floating inside the tile diamond. Deriving the size from the
 * footprint makes the mismatch impossible.
 */
export function plinth(footprint: number, _height = 3.0): Part[] {
  const w = footprint * TILE_WORLD;
  return [
    /**
     * THE FOOTPRINT IS MARKED BY A THIN LIP, AND THE BUILDING'S OWN BASE FILLS THE TILE.
     *
     * Rendering each building twice — whole, and with only its foundation — showed the stone producing ~1054 pixels on a
     * 2x2 while the structure added 90-600: a median of **18% structure**, with waystone_camp at 5%. The plate covered the
     * entire projected diamond, so whatever stood on it could only be a sliver.
     *
     * Only the LIP is tagged `foundation`. The 7-unit base course below is BUILDING: it is what fills the footprint, and
     * tagging it as pad would put the measurement back where it started.
     */
    part(bbox(w, w, 1.0, 1.0, 0.99), [0, 0, 0], PAL.rockDeep, { foundation: true }),
    part(bbox(w - 1.0, w - 1.0, 7.0, 1.8, 0.95), [0, 0, 1.0], PAL.rock),
    part(bbox(w - 3.5, w - 3.5, 1.4, 0.8, 0.99), [0, 0, 8.0], PAL.rockLit),
    /**
     * NO TEAM BAND HERE — the ground-contact band must stay neutral stone (`art-footing` asserts it). Each building
     * carries its own team markers higher up, on its collars and banners.
     */
  ];
}

/**
 * A round plinth that still RESTS ON ITS FULL FOOTPRINT.
 *
 * A circle cannot fill a square footprint: inscribed, it reaches only the edge midpoints, so its
 * projected width is `1/sqrt(2)` (70.7%) of the tile diamond's. That is geometrically correct art, but
 * it leaves the tower reading as a coin sitting inside the tile rather than a building founded on it —
 * and the earlier code "fixed" that by scaling the whole tower up 1.41x, which made it physically larger
 * than the tiles it occupies and pushed its contact shadow 24-38% past the footprint.
 *
 * The honest fix is in the GEOMETRY, not the scale: a square footing course laid exactly on the
 * footprint, with the round drum stepping in above it. The tower stays round, the base meets all four
 * tile edges, and the shadow lands on the footprint because the bake scale is the terrain's.
 */
export function roundPlinth(footprint: number, _height = 3.0): Part[] {
  const w = footprint * TILE_WORLD;
  const r = w / 2;
  return [
    // Thin lip at the tile edge — the only foundation pixel here (see `plinth`).
    part(bbox(w, w, 1.0, 1.0, 0.99), [0, 0, 0], PAL.rockDeep, { foundation: true }),
    /**
     * The round base course, nearly as wide as the footprint.
     *
     * A circle inscribed in the square reaches 70.7% of the width; at r-0.5 with 14 sides it reaches ~97%, so the
     * building's own mass covers the tile and the pad is only the thin lip around it.
     */
    part(cyl(r - 0.5, r - 2.0, 8.0, 14), [0, 0, 1.0], PAL.rock),
    part(cyl(r - 2.5, r - 4.0, 1.4, 14), [0, 0, 9.0], PAL.rockLit),
  ];
}

export function bodyBlock(
  footprint: number,
  opts: { height?: number; inset?: number; mat?: M; lit?: M; levels?: number } = {},
): Part[] {
  const w = footprint * TILE_WORLD;
  const inset = opts.inset ?? 3.0;
  const height = opts.height ?? 14.0;
  const levels = Math.max(1, opts.levels ?? 3);
  const mat = opts.mat ?? PAL.rock;
  const lit = opts.lit ?? PAL.rockLit;
  const out: Part[] = [];
  const tierShares = levels >= 3 ? [0.5, 0.32, 0.18] : [0.62, 0.38];
  let z = FOUNDATION_TOP;
  for (let i = 0; i < tierShares.length; i++) {
    const tierH = height * tierShares[i]!;
    const stepIn = inset + i * 1.8;
    const lw = Math.max(7, w - stepIn * 2);
    out.push(part(bbox(lw, lw, tierH, 1.6, 0.94), [0, 0, z], i === 0 ? mat : lit));
    if (i < tierShares.length - 1) {
      out.push(part(bbox(lw + 2.4, lw + 2.4, 1.4, 0.7, 0.99), [0, 0, z + tierH - 0.5], PAL.rockDeep));
    }
    z += tierH;
  }
  out.push(part(bbox(w - inset * 2 + 0.8, w - inset * 2 + 0.8, 1.8, 0.6, 0.99), [0, 0, FOUNDATION_TOP + height * 0.2], PAL.runeTeam));
  return out;
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
