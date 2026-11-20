// DOES THE BUILDING RISE OUT OF ITS FOOTPRINT?
//
// Zachary, reviewing head aa5c5f6: "The 96% structure share comes mostly from relabeling the full-footprint flat base course
// as 'building'. Visually it's still a big flat diamond with a small object in the middle; the slab just changed from grey
// to cream."
//
// That criticism is correct and the previous metric was gameable exactly as described — it asked "is this pixel foundation
// or not", and the answer was changed by editing a tag rather than by changing the art. This suite asks the question a
// player's eye actually asks:
//
//   1. VERTICAL-MASS SHARE. Of the opaque pixels in the baked sprite, what fraction sits ABOVE the projected ground-plane
//      diamond? The diamond is the footprint projected under the terrain camera, so its top vertex is a fixed screen row.
//      Pixels above that row cannot be the footprint at all — they are the building standing up. Target: >= 50%.
//
//   2. FLAT BASE SURFACE. What fraction of the sprite is low geometry (the base band and anything at its height) that is
//      still VISIBLE, i.e. not covered by anything rising above it? That is the flat top a player reads as a pad. A tower
//      on a plate shows a lot of it. Target: <= 20%.
//
// Together these say "the vertical mass fills the footprint": the walls rise from near the footprint edge, so most of the
// silhouette is above the ground diamond, and there is little flat surface left showing around them.
//
// Measured on aa5c5f6 this suite fails 18 of 20 buildings, worst `waystone_camp` at 11% vertical.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildTris, type Assembly } from '../art/mesh2';
import { ROSTER_BUILDINGS } from '../art/roster';
import { rasterise } from '../art/raster2';
import { TERRAIN_MATCH_PITCH, TERRAIN_MATCH_SCALE, TERRAIN_MATCH_YAW, TILE } from '../art/bake-camera';

const ROOT = join(__dirname, '..');
const SIZE = 192;

/**
 * World height at which "the base" ends and "the building" begins.
 *
 * Sits just above the height a full-footprint skirt or plinth reaches, so it captures the flat top surface a player reads
 * as a pad rather than the lowest course of the walls.
 */
const BASE_BAND_TOP = 9.0;

/** A wall is a thin barrier: it has no footprint to fill, so it is exempt from both thresholds. */
const THIN_BY_DESIGN = new Set(['stone_wall']);

const RASTER = {
  width: SIZE,
  height: SIZE,
  yaw: TERRAIN_MATCH_YAW,
  pitch: TERRAIN_MATCH_PITCH,
  scale: TERRAIN_MATCH_SCALE,
  offsetX: 0,
  offsetY: 0,
  teamColor: [79, 157, 255] as [number, number, number],
  exposure: 1,
  ss: 1,
  outline: false,
  shadow: false,
};

interface Def {
  id: string;
  name: string;
  footprint: number;
}

function defs(): Map<string, Def> {
  const out = new Map<string, Def>();
  for (const f of readdirSync(join(ROOT, 'data/buildings'))) {
    const j = JSON.parse(readFileSync(join(ROOT, 'data/buildings', f), 'utf8')) as Def;
    out.set(j.id, j);
  }
  return out;
}
const DEFS = defs();
const IDS = [...DEFS.keys()].sort();

const manifest = JSON.parse(readFileSync(join(ROOT, 'public/atlas-final/buildings.json'), 'utf8')) as {
  frames: Record<string, { pivotY: number }>;
};

/**
 * Screen row of the projected ground-plane diamond's TOP VERTEX.
 *
 * The footprint square has corners at (±h, ±h) with h = footprint*TILE/2. Under the bake camera the corner at (-h, -h)
 * projects to screen y = (-2h) * 0.25 = -h/2 relative to the origin, so the top vertex sits h/2 pixels above the pivot.
 * The pivot itself is a fraction of the frame, taken from the manifest so this reads the same number the renderer uses.
 */
function diamondTopRow(id: string, footprint: number): number {
  const f = manifest.frames[`building/${id}/blue/0`];
  if (!f) throw new Error(`no atlas frame for ${id}`);
  const pivotY = f.pivotY * SIZE;
  const h = (footprint * TILE) / 2;
  return pivotY - h / 2;
}

function maxZOf(asm: Assembly): number {
  let maxZ = -Infinity;
  for (const t of buildTris(asm)) for (const v of [t.a, t.b, t.c]) if (v.z > maxZ) maxZ = v.z;
  return maxZ;
}

/** Parts whose highest vertex is at or below the base band. */
function lowParts(asm: Assembly): Assembly {
  return {
    parts: asm.parts.filter((p) => maxZOf({ parts: [p] }) <= BASE_BAND_TOP),
  };
}

/** Parts that rise above the base band. */
function highParts(asm: Assembly): Assembly {
  return {
    parts: asm.parts.filter((p) => maxZOf({ parts: [p] }) > BASE_BAND_TOP),
  };
}

interface VerticalStats {
  verticalShare: number;
  flatBaseShare: number;
  riseOverDiamond: number;
  verticalPixels: number;
  flatBasePixels: number;
  totalPixels: number;
}

const cache = new Map<string, VerticalStats>();
function stats(id: string): VerticalStats {
  const hit = cache.get(id);
  if (hit) return hit;
  const def = DEFS.get(id)!;
  const asm = ROSTER_BUILDINGS[id]!;
  const full = rasterise(asm, RASTER);
  const low = rasterise(lowParts(asm), RASTER);
  const high = rasterise(highParts(asm), RASTER);

  const topRow = diamondTopRow(id, def.footprint);

  let vertical = 0;
  let flatBase = 0;
  let total = 0;
  let highest = Infinity;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      if (full.rgba[i + 3]! <= 60) continue;
      total++;
      if (y < topRow) vertical++;
      if (y < highest) highest = y;
      if (low.rgba[i + 3]! > 60 && high.rgba[i + 3]! <= 60) flatBase++;
    }
  }

  const diamondHeight = (def.footprint * TILE) / 2;
  const st: VerticalStats = {
    verticalPixels: vertical,
    flatBasePixels: flatBase,
    totalPixels: total,
    verticalShare: total ? vertical / total : 0,
    flatBaseShare: total ? flatBase / total : 0,
    riseOverDiamond: (topRow - (Number.isFinite(highest) ? highest : topRow)) / diamondHeight,
  };
  cache.set(id, st);
  return st;
}

describe('buildings rise out of their footprint instead of sitting on a plate', () => {
  it.each(IDS.filter((id) => !THIN_BY_DESIGN.has(id)))('%s: most of the silhouette is above the ground diamond', (id) => {
    /**
     * THE HONEST METRIC.
     *
     * Measured on aa5c5f6's art this fails 18 of 20 buildings, worst `waystone_camp` at 11% and `celestial_cannon` at 24%
     * — which is precisely the "big flat diamond with a small object in the middle" Zachary described, and precisely what
     * the previous foundation-tag metric reported as 96%.
     */
    const s = stats(id);
    expect(
      s.verticalShare,
      `${id}: only ${(s.verticalShare * 100).toFixed(0)}% of its pixels are above the ground diamond ` +
        `(${s.verticalPixels} of ${s.totalPixels}) — the footprint is showing, not the building`,
    ).toBeGreaterThanOrEqual(0.5);
  });

  it.each(IDS.filter((id) => !THIN_BY_DESIGN.has(id)))('%s: little flat base surface is left showing', (id) => {
    // The flat top around a tower is the pad the player sees. A building whose walls rise from near the footprint edge
    // leaves very little of it.
    const s = stats(id);
    expect(
      s.flatBaseShare,
      `${id}: ${(s.flatBaseShare * 100).toFixed(0)}% of its pixels are visible flat base surface ` +
        `(${s.flatBasePixels} of ${s.totalPixels}) — that is a pad with something on it`,
    ).toBeLessThanOrEqual(0.2);
  });

  it.each(IDS.filter((id) => !THIN_BY_DESIGN.has(id)))('%s: the structure rises at least one diamond-height', (id) => {
    /**
     * Zachary: "the part above the ground diamond is at least as tall as the diamond itself for most buildings."
     *
     * This is the same requirement stated from the other direction: the structure must stand tall enough that the part
     * above the diamond's top vertex is at least the diamond's own height. Reported per building so a regression names
     * the one that got shorter.
     */
    const s = stats(id);
    expect(
      s.riseOverDiamond,
      `${id}: the structure rises ${s.riseOverDiamond.toFixed(2)}x the diamond's height above it (want >= 1.0)`,
    ).toBeGreaterThanOrEqual(1.0);
  });
});
