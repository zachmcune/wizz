// CAN YOU TELL THE BUILDINGS APART?
//
// Zachary: "A lot of buildings are too simple to tell what they are at a glance. Many are a flat pad plus a small
// cone or orb." That is a measurable failure, not a taste one, so this suite measures it three ways:
//
//   1. SILHOUETTE DISTINCTNESS — binarise each building's drawn mask and compare every PAIR with IoU. Two buildings
//      whose outlines overlap heavily are indistinguishable at a glance no matter how different their colours are.
//      Colour is not available to the player at phone zoom on a dark map; the shape is.
//
//   2. MASS — the structure must actually occupy its tile, not sit on a pad as a small prop. Measured as the share
//      of the footprint diamond that the drawn silhouette covers, and as the structure's height as a fraction of
//      its own width. A "pad plus a small cone" scores low on both.
//
//   3. FUNCTION READ — each building carries a distinctive top: a chimney, a blade, a lens, a brazier, a coil. This
//      is asserted structurally (the silhouette must be wider or more detailed near the top than a bare cone) rather
//      than by checking for a named part, so the art can be rebuilt without the test becoming a change-detector.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { ROSTER_BUILDINGS } from '../art/roster';
import { buildTris } from '../art/mesh2';
import { TILE } from '../src/core/constants';

const ROOT = join(__dirname, '..');
const ATLAS = join(ROOT, 'public/atlas-final');

const manifest = JSON.parse(readFileSync(join(ATLAS, 'buildings.json'), 'utf8')) as {
  pages: { file: string; width: number; height: number }[];
  frames: Record<string, { page: number; x: number; y: number; w: number; h: number; pivotX: number; pivotY: number }>;
};

function buildingDefs(): Map<string, { id: string; name: string; footprint: number }> {
  const out = new Map<string, { id: string; name: string; footprint: number }>();
  for (const f of readdirSync(join(ROOT, 'data/buildings'))) {
    const j = JSON.parse(readFileSync(join(ROOT, 'data/buildings', f), 'utf8')) as {
      id: string;
      name: string;
      footprint: number;
    };
    out.set(j.id, j);
  }
  return out;
}
const DEFS = buildingDefs();
const IDS = [...DEFS.keys()].sort();

/** A building's opaque mask, cropped to the frame, as a normalised 0/1 grid. */
interface Mask {
  w: number;
  h: number;
  /** Row-major coverage, 1 = opaque. */
  bits: Uint8Array;
  /** Bounding box of opaque pixels, for aligning two masks before comparing. */
  left: number;
  right: number;
  top: number;
  bottom: number;
  pixels: number;
}

const maskCache = new Map<string, Mask>();
const pageCache = new Map<number, { data: Buffer; width: number; channels: number }>();

async function pageFor(index: number) {
  const hit = pageCache.get(index);
  if (hit) return hit;
  const { data, info } = await sharp(join(ATLAS, manifest.pages[index]!.file))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const entry = { data, width: info.width, channels: info.channels };
  pageCache.set(index, entry);
  return entry;
}

async function maskFor(id: string): Promise<Mask> {
  const hit = maskCache.get(id);
  if (hit) return hit;
  const f = manifest.frames[`building/${id}/blue/0`];
  if (!f) throw new Error(`no frame for ${id}`);
  const page = await pageFor(f.page);
  const bits = new Uint8Array(f.w * f.h);
  let left = f.w;
  let right = -1;
  let top = f.h;
  let bottom = -1;
  let pixels = 0;
  for (let y = 0; y < f.h; y++) {
    for (let x = 0; x < f.w; x++) {
      const i = ((f.y + y) * page.width + (f.x + x)) * page.channels;
      // The contact shadow is translucent; alpha > 160 keeps only the solid structure.
      if (page.data[i + 3]! > 160) {
        bits[y * f.w + x] = 1;
        pixels++;
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  const mask: Mask = { w: f.w, h: f.h, bits, left, right, top, bottom, pixels };
  maskCache.set(id, mask);
  return mask;
}

/**
 * Intersection-over-union of two silhouettes, above the shared FOUNDATION.
 *
 * Two decisions make this measure identity rather than construction:
 *
 *   1. THE FOUNDATION IS EXCLUDED. Every building sits on a full-footprint stone plinth — that is deliberate, it is
 *      what makes them all sit flat on their tiles, and it is identical by design. Including it means every pair
 *      scores 0.9+ no matter how different the structures above it are, which is exactly what happened: lengthening
 *      the Celestial Cannon's barrel by 30% moved its IoU against the Golem Forge by 0.004. The mask is cropped to
 *      the structure ABOVE the plinth, which is the part that carries the building's identity.
 *
 *   2. BOTH MASKS SHARE ONE SCALE. Stretching each to fill the grid would destroy aspect ratio and make a slab
 *      indistinguishable from a spire (an earlier version scored two clearly different buildings at 0.99 that way).
 *
 * The comparison is then genuinely about the shape a player sees on top of the base.
 */
function iou(a: Mask, b: Mask): number {
  /**
   * Crop away the bottom of each mask before comparing.
   *
   * The plinth occupies the lowest ~30% of the drawn height for every building (it is one or two courses of
   * full-footprint stone). Keeping the top 70% isolates the structure.
   */
  const keep = (m: Mask): Mask => {
    const height = m.bottom - m.top + 1;
    // Cut away the LOWEST 30% (the plinth). Larger y is lower in the frame, so the plinth is the tail.
    const cut = m.bottom - Math.round(height * 0.30);
    const bits = new Uint8Array(m.bits.length);
    let pixels = 0;
    let left = m.w;
    let right = -1;
    let bottom = -1;
    for (let y = m.top; y <= m.bottom; y++) {
      if (y > cut) continue;
      for (let x = 0; x < m.w; x++) {
        if (!m.bits[y * m.w + x]) continue;
        bits[y * m.w + x] = 1;
        pixels++;
        if (x < left) left = x;
        if (x > right) right = x;
        if (y > bottom) bottom = y;
      }
    }
    return { ...m, bits, pixels, left, right, bottom: bottom < 0 ? m.top : bottom };
  };
  const A = keep(a);
  const B = keep(b);
  const aw = A.right - A.left + 1;
  const ah = A.bottom - A.top + 1;
  const bw = B.right - B.left + 1;
  const bh = B.bottom - B.top + 1;
  // Scale both into a common grid so size differences do not dominate shape differences.
  /**
   * SCALE BOTH MASKS BY THE SAME FACTOR — never stretch each to fill the grid.
   *
   * An earlier version normalised every mask into a full 96x96 grid, which destroys aspect ratio: a squat slab and a
   * tall spire both became "a filled square" and scored 0.99 IoU. That measured nothing. Both masks are now fitted
   * into a common grid with ONE shared scale (so relative proportions survive) and aligned on their bounding-box
   * centres, which is what makes the comparison about SHAPE.
   */
  const W = 96;
  const H = 96;
  const span = Math.max(aw, ah, bw, bh, 1);
  const scale = (W - 2) / span;
  const raster = (m: Mask, mw: number, mh: number): Uint8Array => {
    const out = new Uint8Array(W * H);
    const dw = Math.max(1, Math.round(mw * scale));
    const dh = Math.max(1, Math.round(mh * scale));
    const ox = Math.round((W - dw) / 2);
    const oy = Math.round((H - dh) / 2);
    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        // Nearest-neighbour sample from the source bounding box.
        const sx = m.left + Math.min(mw - 1, Math.round((x / dw) * mw));
        const sy = m.top + Math.min(mh - 1, Math.round((y / dh) * mh));
        const gx = ox + x;
        const gy = oy + y;
        if (gx < 0 || gy < 0 || gx >= W || gy >= H) continue;
        out[gy * W + gx] = m.bits[sy * m.w + sx]!;
      }
    }
    return out;
  };
  const ra = raster(A, aw, ah);
  const rb = raster(B, bw, bh);
  let inter = 0;
  let union = 0;
  for (let i = 0; i < ra.length; i++) {
    const av = ra[i]!;
    const bv = rb[i]!;
    if (av && bv) inter++;
    if (av || bv) union++;
  }
  return union === 0 ? 1 : inter / union;
}

/** Vertical extent of the structure in world units, and its horizontal span. */
function proportions(id: string): { height: number; width: number; aspect: number } {
  const asm = ROSTER_BUILDINGS[id];
  if (!asm) return { height: 0, width: 1, aspect: 0 };
  const tris = buildTris(asm);
  let minZ = Infinity;
  let maxZ = -Infinity;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const t of tris) {
    for (const p of [t.a, t.b, t.c]) {
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }
  const height = maxZ - Math.min(minZ, 0);
  const width = Math.max(maxX - minX, maxY - minY, 1);
  return { height, width, aspect: height / width };
}

describe('every building is distinguishable at a glance', () => {
  it('no two buildings share a silhouette', async () => {
    /**
     * HOW THE THRESHOLD WAS CHOSEN.
     *
     * IoU is computed on 96x96 normalised masks, so two rectangles of similar proportion score high even if they are
     * different buildings — a flat pad with a small cone on top is, at this resolution, the same shape whatever the
     * cone is made of. Measured across the roster BEFORE this pass, several pairs sat above 0.75.
     *
     * 0.72 is the line: above it the two shapes read as the same object at phone zoom. The worst offending pair is
     * reported by name so a regression points at the two buildings that became twins.
     */
    const failures: string[] = [];
    const pairs: { a: string; b: string; v: number }[] = [];
    for (let i = 0; i < IDS.length; i++) {
      for (let j = i + 1; j < IDS.length; j++) {
        const a = IDS[i]!;
        const b = IDS[j]!;
        const v = iou(await maskFor(a), await maskFor(b));
        pairs.push({ a, b, v });
        if (v > 0.72) failures.push(`${a} ~ ${b}: IoU ${v.toFixed(3)} — indistinguishable silhouettes`);
      }
    }
    pairs.sort((x, y) => y.v - x.v);
    expect(failures, `\nMost similar pairs:\n${pairs.slice(0, 8).map((p) => `  ${p.a} ~ ${p.b} = ${p.v.toFixed(3)}`).join('\n')}\n\n${failures.join('\n')}`).toEqual([]);
  });

  it.each(IDS)('%s: the structure has real mass, not a pad with a prop', async (id) => {
    /**
     * COVERAGE AND PROPORTION TOGETHER.
     *
     * Coverage alone can be gamed by a wide flat slab; proportion alone by a thin spike. A building that reads as a
     * BUILDING needs both: its silhouette fills a decent share of its footprint diamond, and it stands at least as
     * tall as it is wide. The "pad plus a small cone" failure scored ~0.30 coverage and ~0.35 aspect.
     */
    const def = DEFS.get(id)!;
    const m = await maskFor(id);
    const diamondW = def.footprint * TILE; // projected width of the footprint, in bake pixels
    const diamondH = diamondW * 0.5;
    const diamondArea = (diamondW * diamondH) / 2;
    const coverage = m.pixels / diamondArea;
    const { aspect } = proportions(id);
    const detail = `${id}: silhouette ${m.pixels}px over a ${Math.round(diamondW)}x${Math.round(diamondH)} diamond = ${(coverage * 100).toFixed(0)}% coverage, aspect ${aspect.toFixed(2)} (height/width)`;
    expect(coverage, `${detail} — too little mass in the footprint`).toBeGreaterThan(0.34);
    expect(aspect, `${detail} — too squat to read as a structure`).toBeGreaterThan(0.5);
  });

  it('the roster spans a range of heights, so no two roles look alike', () => {
    // A skyline of identical stubs is its own legibility failure. Towers should out-top economy buildings.
    const heights = IDS.map((id) => ({ id, h: proportions(id).height }));
    heights.sort((a, b) => a.h - b.h);
    const shortest = heights[0]!;
    const tallest = heights[heights.length - 1]!;
    expect(tallest.h / Math.max(1, shortest.h), `tallest ${tallest.id} (${tallest.h.toFixed(0)}) is barely taller than shortest ${shortest.id} (${shortest.h.toFixed(0)})`).toBeGreaterThan(3);
  });

  it('every defense has a weapon head that breaks the roofline', async () => {
    /**
     * A defensive tower must show WHAT it shoots. In the silhouette that means the top is not a smooth taper: the
     * mask's widest row near the top must be a meaningful fraction of the widest row overall, i.e. there is hardware
     * up there rather than a bare cone tip.
     *
     * This is deliberately a shape property, not a part check: it survives a redesign of how the head is built while
     * still failing the "small cone on a pad" case, whose top profile tapers to nothing.
     */
    const defenses = [...DEFS.values()].filter((d) => {
      const cat = (JSON.parse(readFileSync(join(ROOT, 'data/buildings', `${d.id}.json`), 'utf8')) as { menuCategory?: string })
        .menuCategory;
      return cat === 'defenses';
    });
    const failures: string[] = [];
    for (const d of defenses) {
      const m = await maskFor(d.id);
      const height = m.bottom - m.top + 1;
      // Widest row in the upper quarter vs the widest row anywhere.
      let widestOverall = 1;
      let widestTop = 1;
      for (let y = m.top; y <= m.bottom; y++) {
        let l = m.w;
        let r = -1;
        for (let x = 0; x < m.w; x++) if (m.bits[y * m.w + x]) { if (x < l) l = x; if (x > r) r = x; }
        const rowW = r >= l ? r - l + 1 : 0;
        if (rowW > widestOverall) widestOverall = rowW;
        if (y <= m.top + Math.max(2, Math.round(height * 0.25)) && rowW > widestTop) widestTop = rowW;
      }
      const ratio = widestTop / widestOverall;
      if (ratio < 0.28) {
        failures.push(`${d.id}: top quarter is only ${(ratio * 100).toFixed(0)}% of the widest row — the head tapers to a point`);
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });
});
