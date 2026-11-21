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
     * THE FOOTPRINT IS A THIN LIP. THE BUILDING'S WALLS RISE FROM THE TILE EDGE.
     *
     * Two earlier versions of this helper were wrong in the same direction, and the honest metric finally exposed it:
     *
     *   • a full-footprint SLAB (4 units of stone) meant the plate covered the whole projected diamond and the building
     *     could only ever be a sliver of the silhouette;
     *   • a 7-unit "base course" counted as building by the old tag-based metric, which scored 96% while the sprite was
     *     visibly a flat diamond — `waystone_camp` had only **11%** of its pixels above the ground diamond.
     *
     * So the foundation is now only a 1-unit lip, and the mass above it is WALLS at the footprint edge rather than a
     * plate. `hall()` does that; callers stack it here.
     */
    part(bbox(w, w, 1.0, 1.0, 0.99), [0, 0, 0], PAL.rockDeep, { foundation: true }),
  ];
}

/**
 * A HALL — walls rising from the footprint edge, with a roof.
 *
 * This is the structural answer to "the vertical mass has to fill the footprint". The walls stand at the tile edge (inset
 * only by their own thickness), so the building's own body covers the footprint rather than a plate underneath it, and
 * everything above the ground diamond is building.
 *
 * `wall` is the wall thickness. A thin shell with a roof reads as a building; a solid block does not, so the walls are
 * separate slabs and the roof caps them.
 *
 * The result is deliberately RA2-like: a squat mass with real volume occupying its whole tile, with the roof as the only
 * horizontal surface.
 */
/**
 * A HALL — walls rising from the footprint edge, with a roofline that VARIES.
 *
 * This is the structural answer to "the vertical mass has to fill the footprint", and the `profile` option is the answer to
 * "less boxy". A plain extruded prism of walls fills the tile but still reads as a crate: measured row profiles at
 * 277a26d showed the bunker and the bastion holding one constant width for their whole body height and then tapering, which
 * is literally a box.
 *
 * Profiles:
 *   • `stepped`  — the walls step inward in three setbacks, so the silhouette narrows in stages like a ziggurat.
 *   • `tapered`  — the walls lean inward continuously, giving a truncated pyramid.
 *   • `peaked`   — straight walls topped by a pitched roof, so the silhouette ends in a triangle rather than a bar.
 *   • `flat`     — straight walls with a slab roof (the plainest option).
 *
 * Every profile keeps the base at the tile edge, so plan coverage and vertical mass are unaffected — only the shape above it
 * changes.
 */
export function hall(
  footprint: number,
  opts: {
    height?: number;
    wall?: number;
    mat?: M;
    roof?: M;
    roofThickness?: number;
    open?: boolean;
    profile?: 'flat' | 'stepped' | 'tapered' | 'peaked';
  } = {},
): Part[] {
  const w = footprint * TILE_WORLD;
  const height = opts.height ?? 22;
  const wall = opts.wall ?? 3.2;
  const mat = opts.mat ?? PAL.rock;
  const roof = opts.roof ?? PAL.rockLit;
  const t = opts.roofThickness ?? 2.2;
  const profile = opts.profile ?? 'flat';
  const out: Part[] = [];
  const half = w / 2 - 0.6; // walls stand just inside the lip

  /** One rectangular shell of walls at a given half-width and height, based at `z`. */
  const shell = (h: number, z: number, m: M, shrink = 0): void => {
    const hh = half - shrink;
    const span = hh * 2;
    out.push(part(bbox(span, wall, h, 0.9, 0.95), [0, -hh + wall / 2, z], m));
    out.push(part(bbox(span, wall, h, 0.9, 0.95), [0, hh - wall / 2, z], m));
    out.push(part(bbox(wall, span - wall * 2, h, 0.9, 0.95), [-hh + wall / 2, 0, z], m));
    out.push(part(bbox(wall, span - wall * 2, h, 0.9, 0.95), [hh - wall / 2, 0, z], m));
  };

  if (profile === 'stepped') {
    /**
     * Three setbacks. Each tier is shorter and inset further, so the row profile narrows in visible stages.
     */
    const shares = [0.46, 0.32, 0.22];
    let z = 1.0;
    for (let i = 0; i < shares.length; i++) {
      const h = height * shares[i]!;
      shell(h, z, i === 0 ? mat : roof, i * (w * 0.055));
      // Cornice at each setback, which is what makes the step read rather than blend.
      if (i < shares.length - 1) {
        const hh = half - i * (w * 0.055);
        out.push(part(bbox(hh * 2 + 2.0, hh * 2 + 2.0, 1.8, 0.8, 0.99), [0, 0, z + h - 0.6], PAL.rockDeep));
      }
      z += h;
    }
  } else if (profile === 'tapered') {
    /**
     * A continuous inward lean, built as four stacked courses so the taper is visible as a stepped slope rather than
     * a single sheared prism.
     */
    const courses = 4;
    const courseH = height / courses;
    for (let i = 0; i < courses; i++) {
      shell(courseH, 1.0 + i * courseH, i === 0 ? mat : roof, i * (w * 0.045));
    }
  } else {
    // Straight walls (the base for `flat` and `peaked`).
    shell(height, 1.0, mat);
  }

  /**
   * CORNER PIERS — taller than the walls, so the corners read and the roofline is not a clean rectangle.
   */
  if (profile !== 'stepped') {
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const) {
      out.push(
        part(bbox(wall * 1.7, wall * 1.7, height * 1.12, 0.8, 0.9), [sx * (half - wall * 0.85), sy * (half - wall * 0.85), 1.0], roof),
      );
    }
  }

  if (!opts.open) {
    if (profile === 'peaked') {
      /**
       * A PITCHED ROOF — a four-sided hip roof rising to a ridge. This turns a bar-topped box into a triangle, which is
       * the single biggest change to a boxy silhouette.
       */
      const span = half * 2 + 1.4;
      out.push(part(cone(span * 0.72, height * 0.42, 4), [0, 0, 1.0 + height], roof, { rotZ: Math.PI / 4 }));
      out.push(part(bbox(3.0, 3.0, 3.0, 0.8), [0, 0, 1.0 + height + height * 0.42], PAL.brass));
    } else {
      // Roof slab, slightly overhanging so it casts a shadow line on the walls.
      const shrink = profile === 'stepped' ? w * 0.11 : 0;
      const rspan = (half - shrink) * 2 + 1.4;
      out.push(part(bbox(rspan, rspan, t, 1.2, 0.99), [0, 0, 1.0 + height], roof));
    }
  }

  /**
   * Team band, sized from the body so a tall hall still shows >=3% team colour.
   *
   * A fixed band is a shrinking fraction as the walls grow; scaling it with the wall keeps the share roughly constant.
   * It sits at 78% of the wall height, above the ground-contact band `art-footing` measures.
   */
  /**
   * The team band hugs the wall it sits on, NOT the building's widest footprint.
   *
   * Sized from `half` (the foot of the walls) it was the widest element in a stepped or tapered building — measured 66px
   * on a hall whose tiers were 40-58px — so it flattened the profile back into a box and hid the very steps the shape was
   * built for. Sizing it from the tier it sits on lets the setback read.
   */
  const bandInset = profile === 'stepped' ? w * 0.085 : profile === 'tapered' ? w * 0.05 : 0;
  const bandHalf = half - bandInset;
  out.push(
    part(
      bbox(bandHalf * 2 + 1.2, bandHalf * 2 + 1.2, Math.max(2.4, height * 0.16), 0.7, 0.99),
      [0, 0, 1.0 + height * 0.78],
      PAL.runeTeam,
    ),
  );
  return out;
}

/**
 * A ROUND TOWER BODY — a cylinder nearly as wide as the footprint, from the lip upward.
 *
 * The round counterpart of `hall`, for the spire-type buildings. A cylinder inscribed in the square only reaches 70.7% of
 * the width, so the radius is set close to the half-width and the body is given real height; what matters for the
 * vertical-mass measurement is that the tower's own walls are what occupy the tile.
 */
export function towerBody(
  footprint: number,
  opts: { height?: number; mat?: M; top?: M; taper?: number } = {},
): Part[] {
  const w = footprint * TILE_WORLD;
  const height = opts.height ?? 24;
  const r = w / 2 - 0.8;
  const mat = opts.mat ?? PAL.rock;
  return [
      part(cyl(r, r * (opts.taper ?? 0.9), height, 14), [0, 0, 1.0], mat),
      part(cyl(r * 0.96, r * 0.96, 1.6, 14), [0, 0, 1.0 + height], opts.top ?? PAL.rockLit),
      // Four buttresses, so the tower has vertical relief rather than reading as a smooth drum.
      ...[-1, 1].flatMap((sx) =>
        [-1, 1].map((sy) =>
          part(bbox(3.0, 3.0, height * 0.86, 0.7, 0.9), [sx * r * 0.72, sy * r * 0.72, 1.0], PAL.rockLit),
        ),
      ),
      // Team band at eye height.
      // Team band high on the drum, scaled with the body like `hall`'s.
      part(cyl(r * 1.04, r * 1.04, Math.max(2.6, height * 0.16), 14), [0, 0, 1.0 + height * 0.78], PAL.runeTeam),
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
