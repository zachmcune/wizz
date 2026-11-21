// Per-building pad/structure report, using EXACTLY the method the gate uses (tag-based two-render diff).
// Run: npx vite-node audit/mass-report.ts out.json
import { buildTris, type Assembly } from '../art/mesh2';
import { ROSTER_BUILDINGS } from '../art/roster';
import { rasterise } from '../art/raster2';
import { TERRAIN_MATCH_PITCH, TERRAIN_MATCH_SCALE, TERRAIN_MATCH_YAW, TILE } from '../art/bake-camera';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
const SIZE = 160;
const opts = {
  width: SIZE, height: SIZE, yaw: TERRAIN_MATCH_YAW, pitch: TERRAIN_MATCH_PITCH, scale: TERRAIN_MATCH_SCALE,
  offsetX: 0, offsetY: 0, teamColor: [79, 157, 255] as [number, number, number], exposure: 1, ss: 1,
  outline: false, shadow: false,
};
function planCoverage(asm: Assembly, footprint: number): number {
  const tris = buildTris(asm);
  const side = footprint * TILE, half = side / 2, N = Math.max(16, Math.round(side)), cell = side / N;
  const grid = new Uint8Array(N * N);
  for (const t of tris) {
    if (t.a.z <= 0 && t.b.z <= 0 && t.c.z <= 0) continue;
    if (asm.parts.length && Math.max(t.a.z, t.b.z, t.c.z) < 1.4) continue;
    const xs = [t.a.x, t.b.x, t.c.x], ys = [t.a.y, t.b.y, t.c.y];
    const x0 = Math.max(0, Math.floor((Math.min(...xs) + half) / cell)), x1 = Math.min(N - 1, Math.ceil((Math.max(...xs) + half) / cell));
    const y0 = Math.max(0, Math.floor((Math.min(...ys) + half) / cell)), y1 = Math.min(N - 1, Math.ceil((Math.max(...ys) + half) / cell));
    const ax = t.a.x, ay = t.a.y, bx = t.b.x, by = t.b.y, cx = t.c.x, cy = t.c.y;
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(den) < 1e-9) continue;
    for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
      const px = -half + (gx + 0.5) * cell, py = -half + (gy + 0.5) * cell;
      const w0 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den;
      const w1 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den;
      if (w0 < 0 || w1 < 0 || 1 - w0 - w1 < 0) continue;
      grid[gy * N + gx] = 1;
    }
  }
  let cov = 0;
  for (const v of grid) if (v) cov++;
  return cov / (N * N);
}
const defs = readdirSync('data/buildings').map((f) => JSON.parse(readFileSync(`data/buildings/${f}`, 'utf8'))).sort((a, b) => a.id.localeCompare(b.id));
const rows = defs.map((def) => {
  const asm = ROSTER_BUILDINGS[def.id] as Assembly;
  const building = { parts: asm.parts.filter((p) => p.foundation !== true) };
  const full = rasterise(asm, opts);
  const b = building.parts.length ? rasterise(building, opts) : null;
  let pad = 0, structure = 0;
  for (let i = 0; i < SIZE * SIZE; i++) {
    if (full.rgba[i * 4 + 3]! <= 60) continue;
    if (b && b.rgba[i * 4 + 3]! > 60) structure++; else pad++;
  }
  let maxZ = -Infinity;
  for (const t of buildTris(asm)) for (const v of [t.a, t.b, t.c]) if (v.z > maxZ) maxZ = v.z;
  return {
    id: def.id, footprint: def.footprint, padPixels: pad, structurePixels: structure,
    structureShare: pad + structure ? structure / (pad + structure) : 0,
    planCoverage: planCoverage(asm, def.footprint),
    heightWu: maxZ, heightRatio: maxZ / (def.footprint * TILE),
  };
});
const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
console.log('id'.padEnd(19), 'fp', 'padPx'.padStart(6), 'strPx'.padStart(6), 'str%'.padStart(5), 'plan%'.padStart(6), 'height'.padStart(7), 'h/fpW'.padStart(6));
for (const r of rows) console.log(r.id.padEnd(19), String(r.footprint).padEnd(2), String(r.padPixels).padStart(6), String(r.structurePixels).padStart(6), pct(r.structureShare).padStart(5), pct(r.planCoverage).padStart(6), r.heightWu.toFixed(0).padStart(7), r.heightRatio.toFixed(2).padStart(6));
const sorted = rows.map((r) => r.structureShare).sort((a, b) => a - b);
const cov = rows.map((r) => r.planCoverage).sort((a, b) => a - b);
console.log(`\nmedian structure share ${pct(sorted[Math.floor(sorted.length / 2)] ?? 0)}  worst ${pct(sorted[0] ?? 0)}  |  median plan ${pct(cov[Math.floor(cov.length / 2)] ?? 0)}`);
if (process.argv[2]) { writeFileSync(process.argv[2], JSON.stringify(rows, null, 2)); console.log('wrote', process.argv[2]); }
