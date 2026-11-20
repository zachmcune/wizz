// FULL-ROSTER ATLAS BUILDER.
//
// Bakes the pilot set (5 units x 8 facings x 4 teams, 5 buildings x 4 teams) into WebP atlases so the
// in-game renderer can be judged at real zoom. Same structure as build-atlas.ts; it exists separately
// because the pilot uses the new mesh system and is reviewed before the full roster is rebuilt.
//
//   npx esbuild art/build-atlas2.ts --bundle --platform=node --format=esm --outfile=.a2.mjs --external:sharp
//   node .a2.mjs

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { rasterise } from './raster2';
import { buildTris, boundsOf, type Assembly } from './mesh2';
import { TEAM_RAMP } from './palette';
import { ROSTER_UNITS, ROSTER_BUILDINGS } from './roster';

const OUT = join(process.cwd(), 'public', 'atlas-final');
mkdirSync(OUT, { recursive: true });

/**
 * UNIT FRAME SIZE — this is the number that decides readability on a phone.
 *
 * At default zoom a 667x375 view spans ~25 tiles, so 1 world unit is ~0.82 screen px. A unit drawn at
 * 34 world units tall (2.1x its 16-unit collision diameter) is ~28 px on screen. The frame is authored
 * at 192 px so that a 28 px on-screen sprite is downscaled from 6.8x detail, which keeps edges clean.
 */
// FRAME SIZES ARE A BUDGET DECISION, and they are derived from the zoom range rather than guessed.
//
// MAX_ZOOM is 2.0 (src/core/constants.ts). A Stone Golem is 29 world units tall and is drawn at 2.6x
// its collision diameter, so at max zoom it is at most ~57 screen px tall. A 128 px frame therefore
// still holds 2.2x the pixels the display can use, which is plenty of headroom for downscaling. The
// pilot used 192 px, which was ~3.4x more than any screen could show and cost most of the byte budget.
//
// Buildings are larger on screen (3x3 footprints) so they keep a bigger frame.
const UNIT_FRAME = 128;
const UNIT_FACINGS = 8;
const PITCH = 0.5;

/**
 * BUILDING PROJECTION MUST MATCH THE TERRAIN EXACTLY.
 *
 * The terrain draws with a fixed dimetric projection (`core/projection.ts`):
 *
 *     sx = (x - y) * 0.5
 *     sy = (x + y) * 0.25
 *
 * The rasteriser projects with its own rotation/pitch (`projectPoint`):
 *
 *     sx = s * (x cos(yaw) - y sin(yaw))
 *     sy = s * cos(pitch) * (x sin(yaw) + y cos(yaw))
 *
 * Setting those equal term by term gives the ONLY camera that lines a building up with its tiles:
 *
 *     s cos(yaw)          = 0.5
 *     s sin(yaw)          = 0.5   -> yaw  = 45 deg, s = 0.7071
 *     s cos(pitch) * 0.7071 = 0.25 -> cos(pitch) = 0.5 -> pitch = 60 deg
 *
 * The previous bake used yaw 0.62 (35.5 deg) and pitch 0.5 (28.6 deg), so every building was drawn
 * from the wrong angle: its square base projected as a parallelogram rotated ~9.5 deg off the tile
 * diamond, which is exactly the "tilted / floating" look that was reported.
 *
 * The constants live in `bake-camera.ts` so the alignment test can import them without triggering the
 * atlas bake that this module runs at load time.
 */
import { TERRAIN_MATCH_PITCH, TERRAIN_MATCH_SCALE, TERRAIN_MATCH_YAW, TILE } from './bake-camera';
export { TERRAIN_MATCH_PITCH, TERRAIN_MATCH_SCALE, TERRAIN_MATCH_YAW, TILE };

interface F { page: number; x: number; y: number; w: number; h: number; pivotX: number; pivotY: number }

/**
 * Projected centre of the geometry that touches the ground.
 *
 * The shadow ellipse is drawn at the assembly origin by default; offsetting it to this point keeps it under the
 * feet for a model whose stance is not centred on its own origin.
 */
function groundContactCentre(tris: import('./mesh2').Tri[], yaw: number, pitch: number): { x: number; y: number } {
  let minZ = Infinity;
  for (const t of tris) for (const p of [t.a, t.b, t.c]) if (p.z < minZ) minZ = p.z;
  const cyw = Math.cos(yaw);
  const syw = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const t of tris) {
    for (const p of [t.a, t.b, t.c]) {
      if (p.z > minZ + 1.5) continue;
      const x = p.x * cyw - p.y * syw;
      const y = p.x * syw + p.y * cyw;
      sx += x;
      sy += y * cp - p.z * sp;
      n++;
    }
  }
  return n > 0 ? { x: sx / n, y: sy / n } : { x: 0, y: 0 };
}

/** Units whose art is authored to hover, so the bake can give them a smaller ground shadow. */
const HOVER_UNITS = new Set(['wisp', 'rift_skimmer']);

/**
 * Screen-pixel gap held between a hovering unit's lowest pixel and the ground plane.
 *
 * Expressed in BAKED pixels (the atlas is authored at 128px and drawn at roughly 31px on a 667x375 phone, so this
 * is ~3-4 device pixels of visible daylight — enough to read as flight rather than as a broken walker).
 */
const HOVER_CLEARANCE_PX = 14;

/** Unit definitions, so a bake can read the collision radius. */
const REGISTRY_UNITS = new Map<string, { radius: number }>();
for (const f of readdirSync(join(process.cwd(), 'data', 'units'))) {
  const j = JSON.parse(readFileSync(join(process.cwd(), 'data', 'units', f), 'utf8')) as { id: string; radius: number };
  REGISTRY_UNITS.set(j.id, { radius: j.radius });
}

/** Building definitions, so a bake can read the declared footprint in tiles. */
const REGISTRY_BUILDINGS = new Map<string, { footprint: number }>();
for (const f of readdirSync(join(process.cwd(), 'data', 'buildings'))) {
  const j = JSON.parse(readFileSync(join(process.cwd(), 'data', 'buildings', f), 'utf8')) as {
    id: string;
    footprint: number;
  };
  REGISTRY_BUILDINGS.set(j.id, { footprint: j.footprint });
}

/** World units per footprint tile. Mirrors `TILE` in `core/constants.ts`. */

/**
 * Projected half-width of a footprint square, in world units.
 *
 * A `footprint x footprint` tile square spans `footprint * TILE` world units on each axis. Under the
 * terrain's oblique projection its screen width is `(dx - dy) * 0.5`, whose extreme is
 * `footprint * TILE * 0.5` — so the diamond is `footprint * TILE` pixels wide in total.
 */
function footprintProjectedWidth(footprint: number): number {
  return footprint * TILE;
}

/** Projected height of the same diamond (2:1 dimetric), used for framing only. */
function footprintProjectedDepth(footprint: number): number {
  return footprint * TILE * 0.5;
}

/**
 * Frame size for a building: its footprint diamond plus headroom for height.
 *
 * The frame must be big enough that neither the diamond nor the tallest spire is clipped. The diamond
 * width is `footprint * TILE` projected pixels; the structure can be up to ~2.2x that tall.
 */
function buildingFrameSize(asm: Assembly, footprint: number): number {
  const tris = buildTris(asm);
  const b = boundsOf(tris);
  const projectedW = footprintProjectedWidth(footprint);
  const projectedDepth = footprintProjectedDepth(footprint);
  // Height contributes `z * sin(pitch)` to the vertical extent.
  const projectedH = b.maxZ * Math.sin(TERRAIN_MATCH_PITCH);
  const need = Math.max(projectedW, projectedDepth + projectedH) * 1.12;
  // Round up to a power-of-two-ish frame so atlas pages pack predictably.
  return Math.ceil(need / 32) * 32;
}

/**
 * Scale for a building bake: ALWAYS the terrain's own scale, so one world unit is one projected pixel.
 *
 * This used to derive a per-building scale that forced each base's projected width to equal its
 * footprint diamond. That is right for a square plinth and wrong for everything else:
 *
 *   - A round plinth is an inscribed circle, so its projected width is geometrically only
 *     `1/sqrt(2)` (70.7%) of the diamond's. Forcing it to 100% scaled the tower up by 1.41x, making it
 *     physically larger than the tiles it stands on.
 *   - Worse, the contact shadow is computed from `footprintWorld` in WORLD units, so it is only
 *     correct when `scale = TERRAIN_MATCH_SCALE`. A per-building scale inflated the shadow with the
 *     body: round-base buildings ended up with shadows 24-38% wider than their own footprint, which is
 *     exactly the "not sitting flat on the ground" read.
 *
 * One constant scale fixes both. A square base now spans exactly its diamond; a round one is correctly
 * inscribed; and every shadow lands on its footprint because world units and pixels agree again.
 *
 * `baseW` is still returned (measured from the base geometry) so the bake report can state the ratio.
 */
function buildingScaleFor(asm: Assembly, footprint: number, frame: number): { scale: number; baseW: number } {
  const tris = buildTris(asm);
  let minZ = Infinity;
  for (const t of tris) for (const p of [t.a, t.b, t.c]) if (p.z < minZ) minZ = p.z;
  /**
   * The base's WORLD-space span along x.
   *
   * This must be the world extent, not the rotated one. Under the terrain's projection
   * `sx = (x - y) * 0.5`, an axis-aligned square of side w projects to a diamond of total width
   * `2 * (w/2 - (-w/2)) * 0.5 = w` — the diamond is exactly as wide as the square's side.
   *
   * An earlier version measured `x*cos45 - y*sin45`, which is the RASTERISER's rotated axis, and that
   * differs by a factor of sqrt(2) from the terrain's screen x. The result was every building being
   * baked at ~0.68x the size it needed, so bases filled only about two-thirds of their diamonds.
   */
  let minX = Infinity;
  let maxX = -Infinity;
  for (const t of tris) {
    for (const p of [t.a, t.b, t.c]) {
      if (p.z > minZ + 1.0) continue;
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
    }
  }
  /**
   * The base's PROJECTED width, measured through the rasteriser's own transform.
   *
   * Not the world span: a round base and a square base of the same world diameter project to different
   * widths (a circle inscribed in a square reaches only its edge midpoints, so its diamond is ~0.71x the
   * square's). Measuring the projected width of the ACTUAL base geometry handles both shapes, and any
   * future one, without special cases.
   */
  const cyw = Math.cos(TERRAIN_MATCH_YAW);
  const syw = Math.sin(TERRAIN_MATCH_YAW);
  let minPx = Infinity;
  let maxPx = -Infinity;
  for (const t of tris) {
    for (const p of [t.a, t.b, t.c]) {
      if (p.z > minZ + 1.0) continue;
      const px = p.x * cyw - p.y * syw;
      if (px < minPx) minPx = px;
      if (px > maxPx) maxPx = px;
    }
  }
  const baseW = Math.max(1e-6, maxPx - minPx);
  /**
   * The scale is the terrain's, unconditionally.
   *
   * Do NOT derive it from `baseW`: that makes the drawn size depend on the SHAPE of the base rather
   * than on the world, so an inscribed circle grows 1.41x to fill a square diamond and its contact
   * shadow — which is computed in world units — spills past the footprint.
   */
  void footprint;
  void frame;
  return { scale: TERRAIN_MATCH_SCALE, baseW };
}

interface BakeResult {
  rgba: Uint8ClampedArray;
  pivotX: number;
  pivotY: number;
  w: number;
  h: number;
  /** Pixels per world unit actually used, so a caller can map world corners into the frame. */
  scale: number;
  /** Where the assembly's ground origin (0,0,0) landed, in frame pixels. */
  originX: number;
  originY: number;
}

function renderTo(
  asm: Assembly,
  frame: number,
  yaw: number,
  team: [number, number, number],
  opts: {
    pitch?: number;
    fixedScale?: number;
    contactShadow?: boolean;
    footprintWorld?: number;
    /** Anchor the pivot at z = 0 rather than at the lowest geometry (see the comment on `groundZ`). */
    anchorAtOrigin?: boolean;
  } = {},
): BakeResult {
  const pitch = opts.pitch ?? PITCH;
  const tris = buildTris(asm);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  for (const t of tris) for (const p of [t.a, t.b, t.c]) {
    const x = p.x * cyw - p.y * syw;
    const y = p.x * syw + p.y * cyw;
    const sx = x, sy = y * cp - p.z * sp;
    minX = Math.min(minX, sx); maxX = Math.max(maxX, sx);
    minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
  }
  /**
   * A HOVERING UNIT'S FRAME MUST INCLUDE THE GROUND IT IS ABOVE.
   *
   * The frame is centred on the mesh's own bounds, which for a hovering wisp is a teardrop floating in space — no
   * ground reference at all. Anchoring the pivot at z = 0 then simply shifted the pivot down to the body, and the
   * authored clearance vanished (measured: body bottom only 0.9px above the pivot, i.e. the gap was gone).
   *
   * Extending the vertical bounds down to the projected z = 0 plane gives the frame a real floor, so the gap exists
   * inside the sprite and the shadow has somewhere to sit.
   */
  const extent = Math.max(maxX - minX, maxY - minY);
  const scale = opts.fixedScale ?? (frame * 0.9) / Math.max(1, extent);
  const img = rasterise(asm, {
    width: frame,
    height: frame,
    yaw,
    pitch,
    scale,
    offsetX: -(((minX + maxX) / 2) * scale),
    offsetY: -(((minY + maxY) / 2) * scale),
    teamColor: team,
    exposure: 1.0,
    ss: 4,
    outline: true,
    shadow: opts.contactShadow ?? true,
    footprintWorld: opts.footprintWorld,
  });
  /**
   * PIVOT = WHERE THE FEET ACTUALLY TOUCH THE GROUND, not the assembly's origin.
   *
   * For a building or a humanoid standing on the origin those are the same point, and (0,0,0) was correct. But a
   * wide vehicle's contact patches are offset from its origin: the Obsidian Siege's four feet sit at y = +-9.4, so
   * the lowest geometry projects BELOW the origin. Anchoring on (0,0,0) then lifted the vehicle by that offset —
   * measured 4.6-7.7px, and worse across facings as the projection rotated — which is exactly the "golem is not on
   * the ground" read.
   *
   * So the pivot is the ground-contact point of the base geometry: the lowest `minY` (screen) among vertices within
   * a small epsilon of the assembly's minimum z, i.e. whatever is actually standing on the floor. That makes
   * "lowest opaque pixel == pivot" true by construction for every shape, at every facing.
   */
  /**
   * A HOVERING UNIT ANCHORS AT THE GROUND PLANE (z = 0), NOT AT ITS LOWEST GEOMETRY.
   *
   * Ground-contact anchoring is right for a walker: its feet are the contact point. But a wisp has no feet — its
   * lowest geometry is the tip of a teardrop that is meant to be a visible gap above the floor. Anchoring on that
   * tip would pin the wisp to the ground and destroy the only cue that it flies.
   *
   * `opts.anchorAtOrigin` keeps the anchor at z=0 for those units, so the authored gap survives into the sprite
   * and the shadow is drawn on the ground beneath them.
   */
  let groundZ = Infinity;
  if (opts.anchorAtOrigin) {
    // Pretend the ground plane is at z = 0 for this bake.
    groundZ = 0;
  } else {
    for (const t of tris) for (const p of [t.a, t.b, t.c]) if (p.z < groundZ) groundZ = p.z;
  }
  let groundSx = 0;
  let groundSy = -Infinity;
  let groundCount = 0;
  for (const t of tris) {
    for (const p of [t.a, t.b, t.c]) {
      if (p.z > groundZ + 1.0) continue;
      const x = p.x * cyw - p.y * syw;
      const y = p.x * syw + p.y * cyw;
      const sy = y * cp - p.z * sp;
      groundSx += x;
      groundCount++;
      if (sy > groundSy) groundSy = sy;
    }
  }
  const anchorSx = groundCount > 0 ? groundSx / groundCount : 0;
  const anchorSy = groundCount > 0 ? groundSy : 0;
  const originX = frame / 2 + (anchorSx - ((minX + maxX) / 2)) * scale;
  /**
   * HOVER CLEARANCE IS APPLIED TO THE PIVOT, IN SCREEN PIXELS.
   *
   * A hovering unit's pivot is the GROUND PLANE under it, not its own lowest pixel. Pushing the pivot down by
   * `HOVER_CLEARANCE_PX` means the sprite draws with its body that far above the sim position — a real gap the
   * player can see — while the contact shadow (drawn from `footprintWorld` at the origin) lands correctly on the
   * ground beneath it.
   *
   * Expressed in bake pixels on purpose: "does it read as flying" is a question about the rendered sprite, and
   * trusting the mesh's own geometry gave no reliable gap (a wisp's teardrop tip projects to within 2px of the
   * ground plane even though it is authored 25 world units up).
   */
  /**
   * The lift moves the PIVOT DOWN in the frame, which draws the sprite HIGHER on screen — a larger y pivot means
   * the anchor is lower in the image, so the art above it appears lifted relative to the sim position. That is the
   * effect we want for the body.
   *
   * The shadow is drawn at the mesh origin, which does NOT move, so it ends up above the lifted pivot by exactly
   * the clearance. That is the correct world position (the ground under the unit) and the test asserts it.
   */
  const hoverLift = opts.anchorAtOrigin ? HOVER_CLEARANCE_PX : 0;
  const originY = frame / 2 + (anchorSy - ((minY + maxY) / 2)) * scale + hoverLift;
  return { rgba: img.rgba, pivotX: originX / frame, pivotY: originY / frame, w: frame, h: frame, scale, originX, originY };
}

interface Item {
  key: string;
  data: Uint8ClampedArray;
  size: number;
  /**
   * Ground-origin pivot, as a fraction of the frame.
   *
   * This used to be dropped on the floor: `bake()` hard-coded `pivotX: 0.5, pivotY: 0.85` into the
   * manifest while writing the computed values to a separate `pivots.json` the loader never read. Every
   * building was therefore anchored at 85% of its frame height instead of its own ground origin, which
   * lifted it off the terrain plane. The pivot now travels with the item.
   */
  pivotX: number;
  pivotY: number;
  /**
   * Pixels per world unit this frame was baked at.
   *
   * Recorded in the manifest so the alignment test can assert the camera contract DIRECTLY instead of
   * inferring it from pixels: buildings must be baked at `TERRAIN_MATCH_SCALE`, because that is the only
   * scale at which a world unit is a projected pixel and the world-space contact shadow lands on the
   * footprint.
   */
  scale?: number;
}

async function bake(name: string, items: Item[], maxWidth: number): Promise<void> {
  // Shelf pack.
  const placed: { item: Item; x: number; y: number; page: number }[] = [];
  const pages: { w: number; h: number; data: Float32Array }[] = [];
  let page = { w: maxWidth, h: 0, data: new Float32Array(maxWidth * maxWidth * 4) };
  pages.push(page);
  let used = 0, shelfY = 0, shelfH = 0, pageIdx = 0;
  for (const it of items) {
    const s = it.size;
    if (used + s > page.w) { shelfY += shelfH; used = 0; shelfH = 0; }
    if (shelfY + s > maxWidth) {
      page.h = Math.max(page.h, shelfY);
      page = { w: maxWidth, h: 0, data: new Float32Array(maxWidth * maxWidth * 4) };
      pages.push(page);
      pageIdx++;
      used = 0; shelfY = 0; shelfH = 0;
    }
    for (let py = 0; py < s; py++) {
      for (let px = 0; px < s; px++) {
        const si = (py * s + px) * 4;
        const di = ((shelfY + py) * page.w + (used + px)) * 4;
        page.data[di] = it.data[si]!;
        page.data[di + 1] = it.data[si + 1]!;
        page.data[di + 2] = it.data[si + 2]!;
        page.data[di + 3] = it.data[si + 3]!;
      }
    }
    placed.push({ item: it, x: used, y: shelfY, page: pageIdx });
    used += s;
    shelfH = Math.max(shelfH, s);
    page.h = Math.max(page.h, shelfY + s);
  }

  const manifestPages: { file: string; width: number; height: number }[] = [];
  let bytes = 0;
  for (let i = 0; i < pages.length; i++) {
    const pg = pages[i]!;
    const h = Math.max(1, pg.h);
    const buf = Buffer.alloc(pg.w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < pg.w; x++) {
      const si = (y * pg.w + x) * 4;
      buf[si] = clamp(pg.data[si]!);
      buf[si + 1] = clamp(pg.data[si + 1]!);
      buf[si + 2] = clamp(pg.data[si + 2]!);
      buf[si + 3] = clamp(pg.data[si + 3]!);
    }
    const file = `${name}-${i}.webp`;
    const out = await sharp(buf, { raw: { width: pg.w, height: h, channels: 4 } })
      .webp({ quality: 90, alphaQuality: 100, effort: 6 })
      .toBuffer();
    writeFileSync(join(OUT, file), out);
    bytes += out.length;
    manifestPages.push({ file, width: pg.w, height: h });
  }

  const frames: Record<string, F> = {};
  for (const p of placed) {
    frames[p.item.key] = {
      page: p.page,
      x: p.x,
      y: p.y,
      w: p.item.size,
      h: p.item.size,
      pivotX: p.item.pivotX,
      pivotY: p.item.pivotY,
      ...(p.item.scale === undefined ? {} : { scale: p.item.scale }),
    };
  }
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify({ pages: manifestPages, frames }));
  console.log(`${name}: ${items.length} frames, ${pages.length} pages, ${(bytes / 1048576).toFixed(2)} MB`);
}

function clamp(v: number): number { return v < 0 ? 0 : v > 255 ? 255 : v; }

async function main(): Promise<void> {
  const unitItems: Item[] = [];
  const pivots: Record<string, { x: number; y: number }> = {};
  for (const [id, asm] of Object.entries(ROSTER_UNITS)) {
    for (const team of TEAM_RAMP) {
      for (let f = 0; f < UNIT_FACINGS; f++) {
        const yaw = (f / UNIT_FACINGS) * Math.PI * 2;
        /**
         * UNITS ARE BAKED WITH THE TERRAIN CAMERA, LIKE BUILDINGS.
         *
         * These used to be baked with `PITCH` (0.5 rad = 28.6deg) while the terrain draws at 60deg. A unit is
         * mostly vertical, so the wrong pitch did not distort its silhouette enough to notice in isolation — but
         * it moved the ground contact: feet authored against a shallow pitch project to a different screen
         * offset than the ground plane does, so a golem's feet sat a few pixels off its own shadow and it read as
         * hovering. Zachary spotted exactly that.
         *
         * The units now share `TERRAIN_MATCH_*` with the buildings, so one camera describes the whole world.
         */
        /**
         * Grounded units get a contact shadow; hoverers get a SMALLER one on the ground plane.
         *
         * `footprintWorld` drives the diamond/ellipse shadow in the rasteriser. Passing the unit's collision
         * diameter keeps the shadow in proportion to the body, and the hover units scale it down so the shadow
         * reads as "above the ground" rather than "touching it".
         */
        /**
         * SIZE THE SHADOW FROM THE ART'S OWN WIDTH, NOT THE COLLISION RADIUS.
         *
         * Collision radius is a gameplay number tuned tiny so 90 units fit in a fight (an Imp is 8 units). Using
         * it for the shadow made the ellipse smaller than the drawn body, so a wide silhouette like the Storm
         * Caster's robe covered it completely — measured: **zero visible shadow pixels**, i.e. the unit read as
         * having no ground contact at all. Scaling from the geometry's own X extent guarantees the shadow is at
         * least as wide as what is standing on it.
         */
        /**
         * The shadow tracks the FEET, not the widest part of the figure.
         *
         * Using the full art bounds overshot: an archer's bow and quiver make its silhouette much wider than where it
         * stands, so the shadow came out at 167% of the body and read as a puddle. The geometry within the lowest
         * couple of world units is what is actually in contact, and its extent is the honest shadow size.
         */
        const groundTris = buildTris(asm);
        let gMinZ = Infinity;
        for (const t of groundTris) for (const p of [t.a, t.b, t.c]) if (p.z < gMinZ) gMinZ = p.z;
        let gMinX = Infinity;
        let gMaxX = -Infinity;
        let gMinY = Infinity;
        let gMaxY = -Infinity;
        for (const t of groundTris) {
          for (const p of [t.a, t.b, t.c]) {
            if (p.z > gMinZ + 1.5) continue;
            if (p.x < gMinX) gMinX = p.x;
            if (p.x > gMaxX) gMaxX = p.x;
            if (p.y < gMinY) gMinY = p.y;
            if (p.y > gMaxY) gMaxY = p.y;
          }
        }
        const footSpan = Math.max(gMaxX - gMinX, gMaxY - gMinY);
        /**
         * SHADOW DIAMETER — derived from the unit's own silhouette.
         *
         * The shadow must be visible around the feet yet never wider than the body. Neither obvious reference
         * works on its own: the collision radius is a gameplay number far smaller than the art (90 units must fit
         * in one fight), and the foot span is tiny for a figure on two legs (an archer's stance is a few units
         * across, giving a 2px sliver of shadow that the legs then cover completely).
         *
         * A fraction of the SILHOUETTE satisfies both: 0.55 leaves a visible rim either side of even a narrow
         * stance, and stays comfortably inside the body so it cannot read as a puddle.
         */
        const bodyBounds = boundsOf(groundTris);
        const fullW = Math.max(bodyBounds.maxX - bodyBounds.minX, bodyBounds.maxY - bodyBounds.minY);
        /**
 * Shadow diameter.
 *
 * Three references, each wrong alone: the collision radius is far smaller than the art; the foot span is tiny
 * for two-legged figures; the full silhouette is too wide for a figure with outstretched arms or a bow. The
 * largest of `silhouette * 0.42` (a rim either side without becoming a puddle) and the collision diameter (a
 * floor, so nothing ends up with a pinprick) works across the roster.
 */
const collide = Math.max(fullW * 0.42, (REGISTRY_UNITS.get(id)?.radius ?? 8) * 2.2, footSpan * 1.05);
        /**
         * The shadow is centred on the FEET, not the assembly origin.
         *
         * A golem's stance is not symmetric about its own origin, so a shadow pinned to the origin slid 7px sideways
         * as the model turned — visibly detached from the feet at some facings. `footCentre` is the mean of the
         * ground-contact vertices, projected, so the ellipse tracks wherever the unit actually stands.
         */
        const footCentre = groundContactCentre(groundTris, yaw, TERRAIN_MATCH_PITCH);
        const r = renderTo(asm, UNIT_FRAME, yaw, team.color, {
          pitch: TERRAIN_MATCH_PITCH,
          fixedScale: TERRAIN_MATCH_SCALE,
          contactShadow: true,
          footprintWorld: HOVER_UNITS.has(id) ? collide * 0.6 : collide,
          anchorAtOrigin: HOVER_UNITS.has(id),
          shadowOffsetX: footCentre.x * TERRAIN_MATCH_SCALE,
          shadowOffsetY: footCentre.y * TERRAIN_MATCH_SCALE,
        });
        const key = `unit/${id}/${team.id}/${f}`;
        unitItems.push({ key, data: r.rgba, size: UNIT_FRAME, pivotX: r.pivotX, pivotY: r.pivotY, scale: r.scale });
        pivots[key] = { x: r.pivotX, y: r.pivotY };
      }
    }
  }
  await bake('units', unitItems, 2048);

  /**
   * BUILDINGS ARE BAKED WITH THE TERRAIN'S OWN CAMERA — see the long note in `bake()` and in
   * `bake-camera.ts`. Buildings read their footprint from the registry so a base fills its tiles exactly.
   */
  const bItems: Item[] = [];
  for (const [id, asm] of Object.entries(ROSTER_BUILDINGS)) {
    const def = REGISTRY_BUILDINGS.get(id) ?? { footprint: 1 };
    if (!REGISTRY_BUILDINGS.has(id) && id !== 'mana_node') {
      throw new Error(`no building def for ${id}`);
    }
    const frame = buildingFrameSize(asm, def.footprint);
    const fit = buildingScaleFor(asm, def.footprint, frame);
    for (const team of TEAM_RAMP) {
      const r = renderTo(asm, frame, TERRAIN_MATCH_YAW, team.color, {
        pitch: TERRAIN_MATCH_PITCH,
        fixedScale: fit.scale,
        contactShadow: true,
        footprintWorld: def.footprint * TILE,
      });
      const key = `building/${id}/${team.id}/0`;
      bItems.push({ key, data: r.rgba, size: frame, pivotX: r.pivotX, pivotY: r.pivotY, scale: r.scale });
      pivots[key] = { x: r.pivotX, y: r.pivotY };
    }
  }
  await bake('buildings', bItems, 2048);

  writeFileSync(join(OUT, 'pivots.json'), JSON.stringify(pivots));
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
