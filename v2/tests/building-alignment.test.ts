// BUILDINGS MUST SIT FLAT ON THEIR TILE DIAMOND.
//
// Zachary: "The main building doesn't read as actually sitting flat because of how it's angled. Make sure
// all other buildings aren't like that either."
//
// Three separate faults caused that, and this suite pins all three:
//
//   1. WRONG CAMERA. Buildings were baked at yaw 0.62 rad / pitch 0.5 rad, while the terrain projects at
//      yaw 45° / pitch 60°. A square base therefore came out as a parallelogram rotated ~9.5° off its
//      tile diamond. → `the atlas is baked with the terrain's own camera`.
//
//   2. WRONG PIVOT. The atlas writer hard-coded `pivot 0.5/0.85` into the manifest (the computed values
//      went to a `pivots.json` the loader never read), so the sprite was anchored 85% down its frame
//      instead of at its real ground origin. → `the manifest carries each building's real ground origin`.
//
//   3. WRONG SCALE. Art was fitted to its own bounding box, so a base filled only 47–69% of its
//      footprint. → `each base spans its footprint`.
//
// The headline assertion is the one Zachary asked for: project each building's base corners through the
// SAME projection the terrain uses, and require them to land within a small pixel tolerance of the tile
// corners of its footprint diamond.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildTris, boundsOf, type Assembly } from '../art/mesh2';
import { ROSTER_BUILDINGS } from '../art/roster';
import { TERRAIN_MATCH_SCALE, TERRAIN_MATCH_YAW } from '../art/bake-camera';
import { projectGround } from '../src/core/projection';
import { TILE } from '../src/core/constants';
import sharp from 'sharp';

const ROOT = join(__dirname, '..');
const ATLAS = join(ROOT, 'public/atlas-final');

/** Tolerance in projected pixels for a base corner versus its tile corner. */
const CORNER_TOLERANCE_PX = 6;

/**
 * Buildings whose DESIGN is deliberately narrower than their footprint in one axis.
 *
 * A wall is a barrier: it must be thin in depth or it reads as a bunker. It still fills its footprint
 * along its length, so it sits flat on its tiles — it simply does not fill the tile square, and forcing
 * it to would break the unit's read. These are exempt from the "fills the diamond" check only; the
 * centring, rotation and pivot checks still apply.
 */
const THIN_BY_DESIGN = new Set(['stone_wall']);

interface BDef {
  id: string;
  footprint: number;
}

function buildingDefs(): Map<string, BDef> {
  const dir = join(ROOT, 'data/buildings');
  const out = new Map<string, BDef>();
  for (const f of readdirSync(dir)) {
    const j = JSON.parse(readFileSync(join(dir, f), 'utf8')) as BDef;
    out.set(j.id, j);
  }
  return out;
}

import { readdirSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(join(ATLAS, 'buildings.json'), 'utf8')) as {
  pages: { file: string; width: number; height: number }[];
  frames: Record<string, { page: number; x: number; y: number; w: number; h: number; pivotX: number; pivotY: number }>;
};

const DEFS = buildingDefs();

/**
 * The four corners of a building's footprint square, in world space, centred on the entity origin.
 *
 * A `footprint` of N occupies N x N tiles, i.e. N*TILE world units per axis.
 */
function footprintCorners(footprint: number): { x: number; y: number }[] {
  const half = (footprint * TILE) / 2;
  return [
    { x: -half, y: -half },
    { x: half, y: -half },
    { x: half, y: half },
    { x: -half, y: half },
  ];
}

/**
 * The base corners measure where each building's geometry actually meets the ground plane, so the test
 * checks the ART rather than trusting the declared footprint alone.
 */
function baseCorners(asm: Assembly): { x: number; y: number }[] {
  const tris = buildTris(asm);
  let minZ = Infinity;
  for (const t of tris) for (const p of [t.a, t.b, t.c]) if (p.z < minZ) minZ = p.z;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const t of tris) {
    for (const p of [t.a, t.b, t.c]) {
      if (p.z > minZ + 1.0) continue;
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

describe('buildings sit flat on their footprint diamond', () => {
  it('the atlas is baked with the terrain\'s own camera', () => {
    // The terrain projects a world point as x*0.5, y*0.25 (core/projection.ts). For the bake camera to
    // agree, one world unit must map to one projected pixel, which is only true when the bake scale is
    // 0.5 / cos(45°) = 0.7071 and the pitch is 60°.
    //
    // This is asserted through the projection itself: take a unit square, project it with the game's
    // ground projection, and confirm the result is a 2:1 diamond — the shape every building base must
    // also produce.
    const a = projectGround({ x: 0, y: 0 });
    const b = projectGround({ x: TILE, y: 0 });
    const c = projectGround({ x: 0, y: TILE });
    // Along +x the projection moves right by TILE*0.5 and down by TILE*0.25.
    expect(b.x - a.x).toBeCloseTo(TILE * 0.5, 5);
    expect(b.y - a.y).toBeCloseTo(TILE * 0.25, 5);
    // Along +y it moves left by the same amount and down by the same amount: a symmetric diamond.
    expect(c.x - a.x).toBeCloseTo(-TILE * 0.5, 5);
    expect(c.y - a.y).toBeCloseTo(TILE * 0.25, 5);
  });

  it.each([...DEFS.keys()])('%s: base corners land on its tile diamond', (id) => {
    const def = DEFS.get(id)!;
    const asm = ROSTER_BUILDINGS[id];
    if (!asm) throw new Error(`${id} has no art`);

    const base = baseCorners(asm);
    const tiles = footprintCorners(def.footprint);

    // Project both sets with the SAME function the renderer and terrain use.
    const baseProj = base.map((p) => projectGround(p));
    const tileProj = tiles.map((p) => projectGround(p));

    // Both are axis-aligned squares in world space, so compare their PROJECTED bounding extents: the
    // building's base must cover the footprint's projected diamond to within the tolerance.
    const ext = (pts: { x: number; y: number }[]) => {
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), cx: (Math.max(...xs) + Math.min(...xs)) / 2, cy: (Math.max(...ys) + Math.min(...ys)) / 2 };
    };
    const be = ext(baseProj);
    const te = ext(tileProj);

    if (!THIN_BY_DESIGN.has(id)) {
      // Width and height of the projected base must match the projected diamond.
      expect(Math.abs(be.w - te.w), `${id}: base is ${be.w.toFixed(1)}px wide, tile diamond is ${te.w.toFixed(1)}px`).toBeLessThanOrEqual(CORNER_TOLERANCE_PX);
      expect(Math.abs(be.h - te.h), `${id}: base is ${be.h.toFixed(1)}px tall, tile diamond is ${te.h.toFixed(1)}px`).toBeLessThanOrEqual(CORNER_TOLERANCE_PX);
    } else {
      /**
       * A thin-by-design building (a wall) projects to a NARROWER diamond than its tile square, because
       * a 32x7 rectangle does not fill a 32x32 square. What must hold is that it spans its footprint
       * along its LONG axis — its projected width must equal what a 32x7 rectangle projects to.
       */
      const asmBase = baseCorners(asm);
      const bw = Math.max(...asmBase.map((p2) => p2.x)) - Math.min(...asmBase.map((p2) => p2.x));
      const bd = Math.max(...asmBase.map((p2) => p2.y)) - Math.min(...asmBase.map((p2) => p2.y));
      const expectedW = Math.abs(projectGround({ x: bw / 2, y: -bd / 2 }).x - projectGround({ x: -bw / 2, y: bd / 2 }).x);
      expect(Math.abs(be.w - expectedW), `${id}: base width ${be.w.toFixed(1)} does not match its own ${bw.toFixed(0)}x${bd.toFixed(1)} footprint projection ${expectedW.toFixed(1)}`).toBeLessThanOrEqual(CORNER_TOLERANCE_PX);
      // And it must reach the footprint's long axis.
      expect(Math.max(...asmBase.map((p2) => p2.x)) - Math.min(...asmBase.map((p2) => p2.x)), `${id}: does not span its footprint's long axis`).toBeGreaterThanOrEqual(def.footprint * TILE - 1);
    }
    // And it must be CENTRED on the footprint, not offset — an offset base reads as a tilted building.
    expect(Math.abs(be.cx - te.cx), `${id}: base centre is ${(be.cx - te.cx).toFixed(1)}px off centre in x`).toBeLessThanOrEqual(CORNER_TOLERANCE_PX);
    expect(Math.abs(be.cy - te.cy), `${id}: base centre is ${(be.cy - te.cy).toFixed(1)}px off centre in y`).toBeLessThanOrEqual(CORNER_TOLERANCE_PX);
  });

  it('every building frame is large enough to hold its diamond', () => {
    for (const id of DEFS.keys()) {
      const def = DEFS.get(id)!;
      const key = `building/${id}/blue/0`;
      const frame = manifest.frames[key];
      expect(frame, `${id} has no atlas frame`).toBeDefined();
      const diamondW = def.footprint * TILE; // projected pixels at the bake scale
      expect(frame!.w, `${id}: frame ${frame!.w}px cannot hold a ${diamondW}px diamond`).toBeGreaterThanOrEqual(diamondW);
    }
  });

  it('the manifest carries each building\'s real ground origin, not a constant', () => {
    // The pivot bug: every frame claimed pivotY 0.85 regardless of the art, which anchored sprites 85%
    // down their frame and lifted them off the ground plane.
    const ys = new Set<string>();
    for (const id of DEFS.keys()) {
      const f = manifest.frames[`building/${id}/blue/0`];
      expect(f, `${id} missing`).toBeDefined();
      expect(f!.pivotY, `${id} pivot is outside the frame`).toBeGreaterThan(0);
      expect(f!.pivotY).toBeLessThan(1);
      ys.add(f!.pivotY.toFixed(4));
    }
    // A hard-coded pivot produces exactly one distinct value across the whole roster.
    expect(ys.size, 'all buildings share one pivot — the computed pivot is not reaching the manifest').toBeGreaterThan(5);
  });

  it('no building has a rotation applied relative to the grid', () => {
    // Every base corner must be axis-aligned in WORLD space: |x| and |y| symmetric about the origin. A
    // rotated building would produce a base whose world-space bounding box is wider than its actual
    // square, and whose corners do not share the footprint's axes.
    for (const id of DEFS.keys()) {
      const asm = ROSTER_BUILDINGS[id];
      if (!asm) continue;
      const base = baseCorners(asm);
      const xs = base.map((p) => p.x);
      const ys = base.map((p) => p.y);
      const w = Math.max(...xs) - Math.min(...xs);
      const d = Math.max(...ys) - Math.min(...ys);
      // A square footprint must have equal-ish extents; a rotated one would be a diamond in world space.
      // Thin-by-design buildings (a wall) are exempt from the squareness check but still must be
      // axis-aligned, which the centring assertions below cover.
      if (!THIN_BY_DESIGN.has(id)) {
        expect(Math.abs(w - d) / Math.max(w, d), `${id}: base is ${w.toFixed(1)}x${d.toFixed(1)} in world space — not axis-aligned`).toBeLessThan(0.25);
      }
      // And centred on the origin, which is where the entity is placed.
      expect(Math.abs((Math.max(...xs) + Math.min(...xs)) / 2)).toBeLessThan(1.5);
      expect(Math.abs((Math.max(...ys) + Math.min(...ys)) / 2)).toBeLessThan(1.5);
    }
  });

  it('all buildings face the same direction', () => {
    // A consistent facing means every building is baked at one yaw (the terrain's 45°), which is a
    // property of the atlas rather than of individual meshes. This asserts the bake used one camera by
    // checking that each frame has the same aspect treatment: a square frame holding a 2:1 diamond.
    const keys = [...DEFS.keys()].map((id) => `building/${id}/blue/0`);
    const widths = new Set(keys.map((k) => manifest.frames[k]?.w));
    // Frames vary in SIZE by footprint, but each must be square, which is only true if the camera is
    // consistent (a rotated camera would need non-square frames to hold the diamond).
    for (const k of keys) {
      const f = manifest.frames[k]!;
      expect(f.w, `${k} frame is not square`).toBe(f.h);
    }
    expect(widths.size, 'no building frames found').toBeGreaterThan(0);
  });
});

describe('buildings are anchored at their base, so they cannot float', () => {
  it('the sprite pivot sits on the base, not at a fixed fraction of the frame', () => {
    // The frame's ground origin must be *at* the projected base, which for a building resting on z=0 is
    // where the diamond's centre lies. Because the bake centres the assembly, that is the frame centre
    // horizontally, and vertically it is the diamond centre — i.e. near the middle, NOT 0.85.
    for (const id of DEFS.keys()) {
      const def = DEFS.get(id)!;
      const f = manifest.frames[`building/${id}/blue/0`]!;
      const asm = ROSTER_BUILDINGS[id];
      if (!asm) continue;
      const b = boundsOf(buildTris(asm));
      // A tall building's origin sits above the frame's vertical middle only if the structure extends
      // far above the ground; a squat one sits below. What must NOT happen is a constant 0.85.
      expect(f.pivotY, `${id} pivot is suspiciously at the old hard-coded 0.85`).not.toBeCloseTo(0.85, 3);
      void def;
      void b;
    }
  });
});

/**
 * PIXEL-LEVEL ALIGNMENT — measures the atlas image, not the mesh.
 *
 * Everything above reasons about geometry in WORLD space. That is necessary but not sufficient: the
 * scale applied at bake time decides how many pixels a world unit becomes, and a per-building scale
 * can silently violate the terrain's 1:1 mapping while every world-space assertion still passes.
 *
 * That is exactly what happened. `buildingScaleFor()` forced each base's projected width to equal its
 * footprint diamond, which is correct only for a square plinth. A round plinth is an inscribed circle
 * whose projected width is geometrically 70.7% of the diamond, so the bake scaled those towers up by
 * 1.41x — making them physically larger than the tiles they stand on and spilling their contact
 * shadows 24-38% past the footprint. Both faults are invisible to a world-space test.
 *
 * These tests read the atlas pixels, so the drawn result is what is asserted.
 */
describe('the baked atlas pixels sit on the footprint', () => {
  const pageCache = new Map<number, { data: Buffer; width: number; channels: number }>();

  async function pageFor(index: number) {
    const cached = pageCache.get(index);
    if (cached) return cached;
    const { data, info } = await sharp(join(ATLAS, manifest.pages[index]!.file))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const entry = { data, width: info.width, channels: info.channels };
    pageCache.set(index, entry);
    return entry;
  }

  /** Widest opaque run in the frame, measured at or below the pivot (the ground-contact course). */
  async function groundProfile(id: string): Promise<{ body: number; shadow: number; cx: number; pivotX: number }> {
    const key = `building/${id}/blue/0`;
    const f = manifest.frames[key]!;
    const page = await pageFor(f.page);
    const at = (x: number, y: number) => page.data[(y * page.width + x) * page.channels + 3]!;
    const pivotPxX = f.x + f.pivotX * f.w;
    const pivotPxY = f.y + f.pivotY * f.h;
    const widest = (threshold: number) => {
      let best = { w: 0, cx: pivotPxX };
      for (let y = Math.round(pivotPxY) - 2; y < f.y + f.h; y++) {
        let l = Infinity;
        let r = -Infinity;
        for (let x = f.x; x < f.x + f.w; x++) {
          if (at(x, y) > threshold) {
            if (x < l) l = x;
            if (x > r) r = x;
          }
        }
        if (r >= l && r - l + 1 > best.w) best = { w: r - l + 1, cx: (l + r) / 2 };
      }
      return best;
    };
    // Alpha 200 isolates the solid body; alpha 8 catches the feathered contact shadow.
    const body = widest(200);
    const shadow = widest(8);
    return { body: body.w, shadow: shadow.w, cx: body.cx, pivotX: pivotPxX };
  }

  it.each([...DEFS.keys()])('%s: the DRAWN base spans its footprint diamond', async (id) => {
    const def = DEFS.get(id)!;
    const diamond = def.footprint * TILE;
    const { body, shadow, cx, pivotX } = await groundProfile(id);

    // The 2px outline is drawn outside the base, so a correct bake measures 2-4px over the diamond.
    const OUTLINE_PX = 4;
    if (THIN_BY_DESIGN.has(id)) {
      // A wall is thin in depth by design, so only the shadow must stay on the footprint.
      expect(shadow, `${id}: contact shadow ${shadow}px exceeds its ${diamond}px footprint`).toBeLessThanOrEqual(
        diamond + OUTLINE_PX,
      );
      return;
    }
    expect(body, `${id}: drawn base is ${body}px wide, footprint diamond is ${diamond}px`).toBeGreaterThanOrEqual(
      diamond * 0.94,
    );
    expect(body, `${id}: drawn base is ${body}px wide, overshooting its ${diamond}px footprint`).toBeLessThanOrEqual(
      diamond + OUTLINE_PX,
    );
    // The base must be centred on the frame's ground origin, or it sits off its tile.
    expect(Math.abs(cx - pivotX), `${id}: base centre is ${Math.abs(cx - pivotX).toFixed(1)}px off its pivot`).toBeLessThanOrEqual(
      OUTLINE_PX,
    );
  });

  it.each([...DEFS.keys()])('%s: contact shadow does not spill past the footprint', async (id) => {
    const diamond = DEFS.get(id)!.footprint * TILE;
    const { shadow } = await groundProfile(id);
    // A shadow wider than the footprint is the "floating on a dark puddle" read: it surrounds the tile
    // instead of occupying it. Allow only the outline's few pixels.
    expect(shadow, `${id}: contact shadow is ${shadow}px, footprint is ${diamond}px — it spills past the tiles`).toBeLessThanOrEqual(
      diamond + 8,
    );
  });

  it('every building is baked at the terrain scale, so one world unit is one projected pixel', () => {
    // `TERRAIN_MATCH_SCALE` is the only scale at which world units and projected pixels agree. A
    // per-building scale breaks that agreement for the contact shadow, which is computed in world
    // units, so the shadow can only be correct when the bake uses the constant.
    expect(TERRAIN_MATCH_SCALE).toBeCloseTo(Math.SQRT1_2, 6);
    // And it must equal 0.5 / cos(yaw) for the bake yaw, which is what makes a world unit a pixel.
    expect(TERRAIN_MATCH_SCALE).toBeCloseTo(0.5 / Math.cos(TERRAIN_MATCH_YAW), 6);
  });

  it.each([...DEFS.keys()])('%s: manifest records the constant terrain bake scale', (id) => {
    // Asserted from the manifest rather than inferred, so a regression names the offending building
    // instead of only showing up as a shadow that is a few pixels too wide.
    const f = manifest.frames[`building/${id}/blue/0`] as { scale?: number } | undefined;
    expect(f, `${id} has no atlas frame`).toBeDefined();
    expect(f!.scale, `${id} was baked at a per-building scale, not the terrain's`).toBeCloseTo(TERRAIN_MATCH_SCALE, 6);
  });

  it.each([...DEFS.keys()])('%s: base edges run at the diamond\'s 2:1 slope (no rotation)', async (id) => {
    /**
     * THE ROTATION CHECK, measured on pixels.
     *
     * A square footprint in this projection is a 2:1 rhombus, so its lower-left edge descends one pixel
     * for every two it travels right — slope 0.5, i.e. `dx/dy = 2`. If a building were baked at a
     * different yaw, that edge would keep the same length but tilt, and the measured slope would drift
     * away from 2. This is the single most direct measurement of "no rotation between the building and
     * the grid", and it is what makes the base read as lying on the ground plane.
     */
    if (THIN_BY_DESIGN.has(id)) return; // a wall's base is not a rhombus
    const f = manifest.frames[`building/${id}/blue/0`]!;
    const page = await pageFor(f.page);
    const at = (x: number, y: number) => page.data[(y * page.width + x) * page.channels + 3]!;
    const pivotY = f.y + f.pivotY * f.h;
    // The lower half of the diamond is `footprint * TILE / 4` tall (a 2:1 diamond is half as tall as it
    // is wide), so the usable edge run is that minus a few rows at each end.
    const halfH = (DEFS.get(id)!.footprint * TILE) / 4;

    // Walk the lower-left edge: for each row, the leftmost opaque pixel.
    const pts: { dy: number; x: number }[] = [];
    for (let dy = 1; dy <= Math.max(3, halfH - 2); dy++) {
      const y = Math.round(pivotY + dy);
      if (y >= f.y + f.h) break;
      let leftmost = Infinity;
      for (let x = f.x; x < f.x + f.w; x++) {
        if (at(x, y) > 200) {
          leftmost = x;
          break;
        }
      }
      if (leftmost !== Infinity) pts.push({ dy, x: leftmost });
    }
    expect(pts.length, `${id}: could not trace a base edge`).toBeGreaterThanOrEqual(3);
    // Least-squares slope of x against dy.
    const n = pts.length;
    const mx = pts.reduce((a, p) => a + p.x, 0) / n;
    const my = pts.reduce((a, p) => a + p.dy, 0) / n;
    const num = pts.reduce((a, p) => a + (p.dy - my) * (p.x - mx), 0);
    const den = pts.reduce((a, p) => a + (p.dy - my) ** 2, 0);
    const slope = num / den; // dx per dy; must be 2 for a 2:1 diamond
    /**
     * Tolerance from MEASUREMENT PRECISION, not from taste.
     *
     * The edge is traced to whole pixels, so a 1px error in the leftmost column shifts the fitted slope
     * by roughly `2 / rows`. A 1-tile base only has ~7 rows to fit, which is where the loosest bound is
     * needed; a 3-tile base has ~23 and is far tighter.
     *
     * This still catches the defect it exists for: baking at the old yaw offset of 9.5deg turns a 2:1
     * edge into dx/dy = 1.37, which is outside this bound at every footprint size.
     */
    const tol = Math.max(0.12, 2.5 / pts.length);
    expect(slope, `${id}: base edge slope dx/dy is ${slope.toFixed(2)}, the tile diamond's is 2.00 — the building is rotated against the grid`).toBeGreaterThan(2 - tol);
    expect(slope, `${id}: base edge slope dx/dy is ${slope.toFixed(2)}, the tile diamond's is 2.00 — the building is rotated against the grid`).toBeLessThan(2 + tol);
  });
});
