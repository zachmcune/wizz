// IS THE BUILDING BIGGER THAN ITS PAD?
//
// Zachary, at head 2177768: "make every building BIGGER and TALLER on its footprint so the main structure dominates, not
// the stone pad... the main structure should cover most of its footprint (target: structure covers >=70% of the
// footprint tile area in plan view) and rise noticeably taller, with the pad reduced to a thin trim/rim, not a slab."
//
// This suite measures exactly that, in the baked sprite, three ways:
//
//   1. STRUCTURE SHARE — of the pixels the player sees, how many are building and how many are foundation? Measured by
//      rendering each assembly twice: once whole, once with only its parts above the foundation top. This is exact and
//      cannot be fooled by projection (an earlier row-split version was, badly — it reported 95% on art that measured
//      18% by this method).
//
//   2. PLAN-VIEW COVERAGE — the literal target Zachary stated. Every triangle above the plinth is projected straight down
//      and rasterised into the footprint square, so "covers 70% of the tile" is measured on the tile.
//
//   3. HEIGHT — the structure must rise noticeably: height over footprint width.
//
// A note on why (1) needed the two-render method: a foundation course spans the whole footprint, so it projects to the
// SAME diamond the building would. Counting pad pixels by screen row therefore credits the building's own wide flanks to
// the pad, and counting foundation-alone pixels double-counts everything the building covers. Only the difference between
// "whole" and "building parts" answers the question.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildTris, type Assembly } from '../art/mesh2';
import { ROSTER_BUILDINGS } from '../art/roster';
import { rasterise } from '../art/raster2';
import { FOUNDATION_TOP } from '../art/shapes';
import { TERRAIN_MATCH_PITCH, TERRAIN_MATCH_SCALE, TERRAIN_MATCH_YAW, TILE } from '../art/bake-camera';

const ROOT = join(__dirname, '..');
const SIZE = 160;

/**
 * Buildings whose foundation is deliberately not filled.
 *
 * A wall is a barrier: it is thin in depth by design, so its structure cannot cover a square tile in plan view and never
 * should. It is exempt from the coverage and share thresholds only; its grounding and alignment are still asserted by the
 * other suites.
 */
const THIN_BY_DESIGN = new Set(['stone_wall']);

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

const RASTER_OPTS = {
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

/**
 * Which parts are foundation, and which are building?
 *
 * By the explicit `foundation` tag on the part, not by height. Height was wrong in a way that mattered: a thick slab's
 * upper course reaches z=4, above any sensible threshold, so it was classified as BUILDING and the gate passed with the
 * very slab it exists to catch restored. The tag is set where the foundation is authored, so it cannot drift.
 */
function splitParts(asm: Assembly): { foundation: Assembly; building: Assembly } {
  const foundationParts = asm.parts.filter((p) => p.foundation === true);
  const buildingParts = asm.parts.filter((p) => p.foundation !== true);
  return { foundation: { parts: foundationParts }, building: { parts: buildingParts } };
}

interface Mass {
  padPixels: number;
  structurePixels: number;
  structureShare: number;
  planCoverage: number;
  heightWu: number;
  heightRatio: number;
}

/** Plan-view coverage: share of the footprint square that geometry above the foundation stands over. */
function planCoverage(asm: Assembly, footprint: number): number {
  const tris = buildTris(asm);
  const side = footprint * TILE;
  const half = side / 2;
  const N = Math.max(16, Math.round(side));
  const cell = side / N;
  const grid = new Uint8Array(N * N);
  for (const t of tris) {
    if (Math.max(t.a.z, t.b.z, t.c.z) <= FOUNDATION_TOP + 0.6) continue;
    const xs = [t.a.x, t.b.x, t.c.x];
    const ys = [t.a.y, t.b.y, t.c.y];
    const x0 = Math.max(0, Math.floor((Math.min(...xs) + half) / cell));
    const x1 = Math.min(N - 1, Math.ceil((Math.max(...xs) + half) / cell));
    const y0 = Math.max(0, Math.floor((Math.min(...ys) + half) / cell));
    const y1 = Math.min(N - 1, Math.ceil((Math.max(...ys) + half) / cell));
    const ax = t.a.x;
    const ay = t.a.y;
    const bx = t.b.x;
    const by = t.b.y;
    const cx = t.c.x;
    const cy = t.c.y;
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(den) < 1e-9) continue;
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        const px = -half + (gx + 0.5) * cell;
        const py = -half + (gy + 0.5) * cell;
        const w0 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den;
        const w1 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        grid[gy * N + gx] = 1;
      }
    }
  }
  let covered = 0;
  for (const v of grid) if (v) covered++;
  return covered / (N * N);
}

/** Measure one building. Rendering is done once per building and memoised. */
const cache = new Map<string, Mass>();
function massOf(id: string): Mass {
  const hit = cache.get(id);
  if (hit) return hit;
  const def = DEFS.get(id)!;
  const asm = ROSTER_BUILDINGS[id]!;
  const full = rasterise(asm, RASTER_OPTS);
  const { building } = splitParts(asm);
  const buildingOnly = building.parts.length > 0 ? rasterise(building, RASTER_OPTS) : null;

  let pad = 0;
  let structure = 0;
  for (let i = 0; i < SIZE * SIZE; i++) {
    if (full.rgba[i * 4 + 3]! <= 60) continue;
    // A pixel is structure when the building's own parts (above the foundation) draw it.
    if (buildingOnly && buildingOnly.rgba[i * 4 + 3]! > 60) structure++;
    else pad++;
  }

  const tris = buildTris(asm);
  let maxZ = -Infinity;
  for (const t of tris) for (const v of [t.a, t.b, t.c]) if (v.z > maxZ) maxZ = v.z;
  const height = maxZ - Math.min(0, maxZ);

  const m: Mass = {
    padPixels: pad,
    structurePixels: structure,
    structureShare: pad + structure === 0 ? 0 : structure / (pad + structure),
    planCoverage: planCoverage(asm, def.footprint),
    heightWu: height,
    heightRatio: height / (def.footprint * TILE),
  };
  cache.set(id, m);
  return m;
}

describe('every building dominates its own footprint, not the pad', () => {
  it.each(IDS.filter((id) => !THIN_BY_DESIGN.has(id)))(
    '%s: the structure is most of what you see',
    (id) => {
      /**
       * The threshold is 70%, matching Zachary's stated target.
       *
       * Measured at head 2177768 the median was **18%** with `waystone_camp` at **5%** — the stone plate covered the whole
       * projected diamond, so whatever stood on it could only ever be a sliver. After the thin-lip plus full-footprint
       * base-course change the median is in the nineties.
       */
      const m = massOf(id);
      const detail = `${id}: ${m.structurePixels} structure px vs ${m.padPixels} pad px = ${(m.structureShare * 100).toFixed(0)}% structure`;
      expect(m.structureShare, `${detail} — the pad is reading louder than the building`).toBeGreaterThanOrEqual(0.7);
    },
  );

  it.each(IDS.filter((id) => !THIN_BY_DESIGN.has(id)))('%s: the structure covers its tile in plan view', (id) => {
    // Zachary's literal target: >=70% of the footprint tile area.
    const m = massOf(id);
    expect(
      m.planCoverage,
      `${id}: structure covers ${(m.planCoverage * 100).toFixed(0)}% of its footprint in plan view (target 70%)`,
    ).toBeGreaterThanOrEqual(0.7);
  });

  it.each(IDS.filter((id) => !THIN_BY_DESIGN.has(id)))('%s: it rises noticeably above its footprint', (id) => {
    // "Rise noticeably taller." Height over footprint width: below ~0.5 a building reads as a slab however wide it is.
    const m = massOf(id);
    expect(
      m.heightRatio,
      `${id}: ${m.heightWu.toFixed(0)} units tall on a ${DEFS.get(id)!.footprint * TILE}-unit footprint = ${m.heightRatio.toFixed(2)} (want >= 0.5)`,
    ).toBeGreaterThanOrEqual(0.5);
  });

  it('the pad is a thin rim, not a slab — reported per building', () => {
    /**
     * A cross-check on the same fault from the other direction.
     *
     * `structureShare` already covers it, but this asserts the absolute pad pixel budget so a regression that inflates the
     * foundation reports a clear number rather than a percentage. The lip is deliberately at the tile edge (it is what
     * shows the footprint), so a few hundred pixels at 3x3 is expected and correct; thousands would mean the plate is
     * back.
     */
    const offenders: string[] = [];
    for (const id of IDS) {
      const def = DEFS.get(id)!;
      const m = massOf(id);
      // Generous ceiling: the rim scales with the diamond's perimeter, not its area.
      const budget = 260 + def.footprint * 120;
      if (m.padPixels > budget) offenders.push(`${id}: ${m.padPixels} pad px (budget ${budget})`);
    }
    expect(offenders, `pad pixel budget exceeded:\n  ${offenders.join('\n  ')}`).toEqual([]);
  });
});
