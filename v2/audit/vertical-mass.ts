// VERTICAL MASS — does the building rise out of its footprint, or sit on a plate?
//
// The previous metric was gamed and I own that: it counted the full-footprint base course as "structure", so a flat
// diamond with a small object in the middle scored 96%. The slab changed colour and the number changed; nothing rose.
//
// This measures what a player actually sees:
//
//   1. VERTICAL-MASS SHARE — of the opaque pixels in the baked sprite, how many sit ABOVE the projected ground-plane
//      diamond? The diamond is the footprint projected under the terrain camera, so its top vertex is a fixed screen row
//      (pivotY - footprint*TILE/4). Pixels above that row are the building standing up; pixels below it are the base
//      seen in plan.
//
//   2. FLAT BASE SURFACE — of the opaque pixels, how many are low geometry (the base course and anything at its height)
//      that is actually VISIBLE? Measured by rendering the low band on its own, then subtracting everything the upper
//      structure covers. A flat top surface showing around a tower is exactly the "big flat diamond" Zachary described.
//
// Both are shares of the same denominator (the sprite's opaque pixels), so they are directly comparable.
//
// Usage: npx vite-node audit/vertical-mass.ts [out.json]
import { buildTris, type Assembly } from '../art/mesh2';
import { ROSTER_BUILDINGS } from '../art/roster';
import { rasterise } from '../art/raster2';
import { TERRAIN_MATCH_PITCH, TERRAIN_MATCH_SCALE, TERRAIN_MATCH_YAW, TILE } from '../art/bake-camera';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const SIZE = 192;

/**
 * World height at which "the base" ends and "the building" begins.
 *
 * 9 units is a little above the 8-unit base course every building shares, so it captures the base course's top face plus
 * anything else sitting at that level — the flat surface a player reads as a pad.
 */
const BASE_BAND_TOP = 9.0;

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

/**
 * Where the ground-plane diamond's TOP VERTEX sits, as a screen offset above the pivot.
 *
 * The footprint square has corners at (+-h, +-h) with h = footprint*TILE/2. Under the bake camera a world point maps to
 * screen y = (x + y) * 0.25 - z * sin(pitch) * scale, so the corner at (-h, -h) lands at (-2h) * 0.25 = -h/2. Everything
 * above that row is outside the footprint's own projection — it can only be the building standing up.
 */
function diamondTopOffset(footprint: number): number {
  const h = (footprint * TILE) / 2;
  return -h / 2;
}

/** Parts entirely within the base band (their highest vertex is at or below BASE_BAND_TOP). */
function lowParts(asm: Assembly): Assembly {
  const parts = asm.parts.filter((p) => {
    const tris = buildTris({ parts: [p] });
    let maxZ = -Infinity;
    for (const t of tris) for (const v of [t.a, t.b, t.c]) if (v.z > maxZ) maxZ = v.z;
    return maxZ <= BASE_BAND_TOP;
  });
  return { parts };
}

/** Parts that rise above the base band. */
function highParts(asm: Assembly): Assembly {
  const parts = asm.parts.filter((p) => {
    const tris = buildTris({ parts: [p] });
    let maxZ = -Infinity;
    for (const t of tris) for (const v of [t.a, t.b, t.c]) if (v.z > maxZ) maxZ = v.z;
    return maxZ > BASE_BAND_TOP;
  });
  return { parts };
}

export interface VerticalStats {
  id: string;
  footprint: number;
  /** Opaque pixels above the projected ground diamond. */
  verticalPixels: number;
  /** Visible low geometry — the flat base surface a player reads as a pad. */
  flatBasePixels: number;
  /** All opaque pixels in the sprite. */
  totalPixels: number;
  verticalShare: number;
  flatBaseShare: number;
  /** Height of the structure above the diamond's top vertex, as a multiple of the diamond's own height. */
  riseOverDiamond: number;
  heightWu: number;
}

function measure(id: string, footprint: number): VerticalStats {
  const asm = ROSTER_BUILDINGS[id];
  if (!asm) throw new Error(`no art for ${id}`);
  const full = rasterise(asm, RASTER);
  const low = rasterise(lowParts(asm), RASTER);
  const high = rasterise(highParts(asm), RASTER);

  const frame = manifestFrame(id);
  const pivotY = frame.pivotY * SIZE;
  const diamondTop = pivotY + diamondTopOffset(footprint);

  let vertical = 0;
  let flatBase = 0;
  let total = 0;
  let topRow = Infinity;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      if (full.rgba[i + 3]! <= 60) continue;
      total++;
      if (y < diamondTop) vertical++;
      if (y < topRow) topRow = y;
      // Visible low geometry: drawn by the base band and not covered by anything rising above it.
      const lowA = low.rgba[i + 3]!;
      const highA = high.rgba[i + 3]!;
      if (lowA > 60 && highA <= 60) flatBase++;
    }
  }

  const diamondHeight = (footprint * TILE) / 2; // screen px, top vertex to bottom vertex
  const structureTop = Number.isFinite(topRow) ? topRow : pivotY;
  const rise = pivotY + diamondTopOffset(footprint) - structureTop;

  const tris = buildTris(asm);
  let maxZ = -Infinity;
  for (const t of tris) for (const v of [t.a, t.b, t.c]) if (v.z > maxZ) maxZ = v.z;

  return {
    id,
    footprint,
    verticalPixels: vertical,
    flatBasePixels: flatBase,
    totalPixels: total,
    verticalShare: total ? vertical / total : 0,
    flatBaseShare: total ? flatBase / total : 0,
    riseOverDiamond: rise / diamondHeight,
    heightWu: maxZ,
  };
}

/**
 * The pivot row, from the real bake.
 *
 * `renderTo` centres the assembly in the frame, so the pivot is not a constant — it depends on the building's own
 * bounds. The baked manifest has it, so the measurement reads the same number the renderer uses rather than guessing.
 */
const manifestPath = join(ROOT, 'public/atlas-final/buildings.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
  frames: Record<string, { pivotY: number }>;
};
function manifestFrame(id: string): { pivotY: number } {
  const f = manifest.frames[`building/${id}/blue/0`];
  if (!f) throw new Error(`no atlas frame for ${id}`);
  // The manifest pivot is a fraction of the FRAME the atlas was baked at; this probe renders at SIZE, and the pivot is
  // the same fraction of its own frame, so the fraction carries over directly.
  return { pivotY: f.pivotY };
}

const DEFS = defs();
const rows: VerticalStats[] = [];
for (const [id, def] of [...DEFS.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  rows.push(measure(id, def.footprint));
}

const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
console.log(
  'id'.padEnd(19),
  'fp',
  'vertPx'.padStart(7),
  'flatPx'.padStart(7),
  'total'.padStart(6),
  'VERT%'.padStart(6),
  'FLAT%'.padStart(6),
  'rise/dia'.padStart(9),
  'height'.padStart(7),
);
for (const r of rows) {
  console.log(
    r.id.padEnd(19),
    String(r.footprint).padEnd(2),
    String(r.verticalPixels).padStart(7),
    String(r.flatBasePixels).padStart(7),
    String(r.totalPixels).padStart(6),
    pct(r.verticalShare).padStart(6),
    pct(r.flatBaseShare).padStart(6),
    r.riseOverDiamond.toFixed(2).padStart(9),
    r.heightWu.toFixed(0).padStart(7),
  );
}

const gatedIds = rows.filter((r) => r.id !== 'stone_wall');
const worstVert = [...gatedIds].sort((a, b) => a.verticalShare - b.verticalShare)[0]!;
const worstFlat = [...gatedIds].sort((a, b) => b.flatBaseShare - a.flatBaseShare)[0]!;
const sortedVert = gatedIds.map((r) => r.verticalShare).sort((a, b) => a - b);
const medianVert = sortedVert[Math.floor(sortedVert.length / 2)] ?? 0;
console.log(
  `\nworst vertical share: ${worstVert.id} ${pct(worstVert.verticalShare)}` +
    `   worst flat base: ${worstFlat.id} ${pct(worstFlat.flatBaseShare)}` +
    `   median vertical: ${pct(medianVert)}`,
);
const failing = gatedIds.filter((r) => r.verticalShare < 0.5 || r.flatBaseShare > 0.2);
console.log(`buildings failing the gate: ${failing.length} of ${gatedIds.length}`);
for (const f of failing) console.log(`  ${f.id}: vertical ${pct(f.verticalShare)}, flat ${pct(f.flatBaseShare)}`);

const out = process.argv[2];
if (out) {
  writeFileSync(out, JSON.stringify(rows, null, 2));
  console.log(`wrote ${out}`);
}
