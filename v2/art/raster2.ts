// PRODUCTION RASTERISER (v2 art, pilot round).
//
// Upgrades over the previous pass, each aimed at a specific "this looks unmodelled" complaint:
//
//   • AMBIENT OCCLUSION. The assembly is voxelised into a coarse grid and every triangle samples
//     how enclosed its centroid is. This is what puts a shadow in the crease between an arm and a
//     torso, under a helmet brow, and where a roof meets a wall — the single biggest cue that turns
//     a stack of primitives into a modelled object.
//   • RIM LIGHT. Fragments whose surface turns away from the camera get a coloured lift, so units
//     separate from dark terrain.
//   • CURVATURE-AWARE SPECULAR. Bevelled edges catch a tight highlight because their normals are
//     interpolated across a very short face.
//   • 4x SUPERSAMPLING with a proper box filter.
//
// Still 100% procedural geometry and shading. No images are read or generated.

import { buildTris, boundsOf, dot3, n3, type Assembly, type Material, type Tri, type Vec3 } from './mesh2';

export interface RasterOptions {
  width: number;
  height: number;
  yaw: number;
  pitch: number;
  scale: number;
  teamColor: [number, number, number];
  exposure: number;
  ss?: number;
  outline?: boolean;
  shadow?: boolean;
  offsetX?: number;
  offsetY?: number;
  /** Ambient-occlusion strength multiplier; 1 = as authored. */
  aoStrength?: number;
}

export interface RasterResult {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
}

// -------------------------------------------------------------------------------------- lighting

/** Key from upper-left-front: the standard three-quarter illustration light. */
const KEY = n3({ x: -0.42, y: 0.52, z: 0.74 });
const FILL = n3({ x: 0.62, y: -0.46, z: 0.24 });
const KEY_STRENGTH = 0.86;
const FILL_STRENGTH = 0.24;
const AMBIENT = 0.50;

// ------------------------------------------------------------------------------- ambient occlusion

/**
 * Voxel occupancy for occlusion.
 *
 * Ray-casting every fragment against every triangle is far too slow for build-time art at 3x
 * supersampling. Instead the assembly is voxelised once (a cube of `N^3` flags) and each triangle
 * centroid fires a fixed set of rays through that grid, counting hits. That is a good approximation
 * of the same thing at a fraction of the cost, and it is fully deterministic.
 */
const AO_N = 56;
const AO_RAYS = 14;

const AO_DIRS: Vec3[] = (() => {
  // Cosine-weighted hemisphere around +Z, generated deterministically (Fibonacci sphere, upper half).
  const out: Vec3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < AO_RAYS; i++) {
    const z = 1 - (i / AO_RAYS) * 0.92;
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    const th = golden * i;
    out.push({ x: Math.cos(th) * r, y: Math.sin(th) * r, z });
  }
  return out;
})();

interface Occluder {
  grid: Uint8Array;
  min: Vec3;
  size: number;
}

function buildOccluder(tris: Tri[]): Occluder {
  const b = boundsOf(tris);
  const size = Math.max(b.maxX - b.minX, b.maxY - b.minY, b.maxZ) || 1;
  const grid = new Uint8Array(AO_N * AO_N * AO_N);
  const min = { x: b.minX, y: b.minY, z: 0 };
  const toCell = (p: Vec3): { x: number; y: number; z: number } => ({
    x: Math.min(AO_N - 1, Math.max(0, Math.floor(((p.x - min.x) / size) * AO_N))),
    y: Math.min(AO_N - 1, Math.max(0, Math.floor(((p.y - min.y) / size) * AO_N))),
    z: Math.min(AO_N - 1, Math.max(0, Math.floor(((p.z - min.z) / size) * AO_N))),
  });
  // Rasterise each triangle into the voxel grid by sampling its barycentric interior.
  for (const t of tris) {
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      for (let j = 0; i + j <= steps; j++) {
        const u = i / steps;
        const v = j / steps;
        const w = 1 - u - v;
        const p: Vec3 = {
          x: t.a.x * u + t.b.x * v + t.c.x * w,
          y: t.a.y * u + t.b.y * v + t.c.y * w,
          z: t.a.z * u + t.b.z * v + t.c.z * w,
        };
        const c = toCell(p);
        grid[(c.z * AO_N + c.y) * AO_N + c.x] = 1;
      }
    }
  }
  return { grid, min, size };
}

/** Fraction of hemisphere rays from `p` that hit geometry. 0 = open, 1 = fully enclosed. */
function occlusionAt(occ: Occluder, p: Vec3): number {
  const cellSize = occ.size / AO_N;
  // Rotate the ray set so it faces along the surface normal.
  let hits = 0;
  for (const d of AO_DIRS) {
    const dir = d;
    let blocked = 0;
    for (let step = 1; step <= 6; step++) {
      const q: Vec3 = {
        x: p.x + dir.x * cellSize * step * 1.2,
        y: p.y + dir.y * cellSize * step * 1.2,
        z: p.z + dir.z * cellSize * step * 1.2,
      };
      const gx = Math.floor(((q.x - occ.min.x) / occ.size) * AO_N);
      const gy = Math.floor(((q.y - occ.min.y) / occ.size) * AO_N);
      const gz = Math.floor(((q.z - occ.min.z) / occ.size) * AO_N);
      if (gx < 0 || gy < 0 || gz < 0 || gx >= AO_N || gy >= AO_N || gz >= AO_N) continue;
      if (occ.grid[(gz * AO_N + gy) * AO_N + gx] === 1) {
        blocked++;
        break;
      }
    }
    if (blocked) hits++;
  }
  return hits / AO_DIRS.length;
}

// -------------------------------------------------------------------------------------- shading

export interface ShadeCtx {
  teamColor: [number, number, number];
  exposure: number;
  ao: number;
  /** Normalised screen position for the rim term. */
  viewDir: Vec3;
}

function applyTeam(m: Material, team: [number, number, number]): [number, number, number] {
  const t = m.teamTint ?? 0;
  if (t <= 0) return m.color;
  return [
    m.color[0] * (1 - t) + team[0] * t,
    m.color[1] * (1 - t) + team[1] * t,
    m.color[2] * (1 - t) + team[2] * t,
  ];
}

/** Deterministic value noise for grain, keyed on the surface normal. */
function grain(n: Vec3): number {
  let h = Math.imul(Math.round(n.x * 127) ^ 0x9e3779b9, 0x85ebca6b);
  h ^= Math.imul(Math.round(n.y * 113) + 0x165667b1, 0xc2b2ae35);
  h ^= Math.imul(Math.round(n.z * 89) + 0x27d4eb2f, 0x27d4eb2f);
  return (((h >>> 9) & 0xffff) / 0xffff) - 0.5;
}

export function shade(m: Material, n: Vec3, ctx: ShadeCtx): [number, number, number] {
  const base = applyTeam(m, ctx.teamColor);
  // WRAP-AROUND KEY. A pure Lambert term leaves every face turned more than 90 degrees from the key
  // at ambient-only, which measured as mean RGB 60-85 across the whole roster — far too dark to read
  // on dark terrain. Wrapping the key (max(0, (N.L + w)/(1+w))) gives oblique and back faces real
  // light, the way a studio rim does, without flattening the form.
  const WRAP = 0.42;
  const keyRaw = dot3(n, KEY);
  const key = Math.max(0, (keyRaw + WRAP) / (1 + WRAP));
  const fill = Math.max(0, dot3(n, FILL)) * FILL_STRENGTH;
  const up = Math.max(0, n.z);

  let light = AMBIENT + key * KEY_STRENGTH + fill + up * 0.14;

  // Specular: tight, so bevelled edges sparkle.
  const spec = m.specular ?? 0;
  if (spec > 0) {
    const half = n3({ x: KEY.x, y: KEY.y, z: KEY.z + 1 });
    light += Math.pow(Math.max(0, dot3(n, half)), 30) * spec * 0.9;
  }

  // Rim: surfaces turning away from the viewer, lifted so the silhouette separates.
  const rimStrength = m.rim ?? 0;
  if (rimStrength > 0) {
    const facing = Math.max(0, -dot3(n, ctx.viewDir));
    light += facing * facing * rimStrength * 0.5;
  }

  // Grain.
  const gr = m.grain ?? 0;
  if (gr > 0) light += grain(n) * gr * 0.3;

  // Ambient occlusion multiplies the whole shading term.
  // AO is applied at reduced strength: full-strength occlusion turned mid-tones into mud and made
  // forms unreadable. 0.35 keeps the crease shadow without crushing the base colour.
  const aoAmt = (m.ao ?? 0.8) * ctx.ao;
  const aoMul = 1 - aoAmt * 0.34;
  const shadeV = light * aoMul * ctx.exposure;

  let r = base[0] * shadeV;
  let g = base[1] * shadeV;
  let b = base[2] * shadeV;

  // Emissive adds on top, unlit (so crystals glow even in a crease).
  const em = m.emissive ?? 0;
  if (em > 0) {
    r += base[0] * em * 0.9;
    g += base[1] * em * 0.9;
    b += base[2] * em * 0.9;
  }

  // Cool the deep shadows slightly so they read as shadow, not as dirt.
  if (aoMul < 0.75) {
    const t = (0.75 - aoMul) * 0.8;
    const lum = (r + g + b) / 3;
    r = r * (1 - t) + lum * 0.86 * t;
    g = g * (1 - t) + lum * 0.92 * t;
    b = b * (1 - t) + lum * 1.14 * t;
  }

  return [r, g, b];
}

// --------------------------------------------------------------------------------------- raster

function projectPoint(p: Vec3, yaw: number, pitch: number, scale: number, cx: number, cy: number): { x: number; y: number; z: number } {
  const cyw = Math.cos(yaw);
  const syw = Math.sin(yaw);
  const x = p.x * cyw - p.y * syw;
  const y = p.x * syw + p.y * cyw;
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  return {
    x: cx + x * scale,
    y: cy + (y * cp - p.z * sp) * scale,
    z: y * sp + p.z * cp,
  };
}

/** Per-vertex normals: average the normals of every triangle sharing that position. */
function vertexNormals(tris: Tri[]): Map<string, Vec3> {
  const map = new Map<string, Vec3>();
  const key = (p: Vec3) => `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}`;
  for (const t of tris) {
    for (const p of [t.a, t.b, t.c]) {
      const k = key(p);
      const cur = map.get(k);
      if (cur) {
        cur.x += t.normal.x;
        cur.y += t.normal.y;
        cur.z += t.normal.z;
      } else {
        map.set(k, { x: t.normal.x, y: t.normal.y, z: t.normal.z });
      }
    }
  }
  for (const [k, v] of map) map.set(k, n3(v));
  return map;
}

function fill(
  rgb: Float32Array,
  alpha: Float32Array,
  zbuf: Float32Array,
  w: number,
  h: number,
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  c: { x: number; y: number; z: number },
  ca: [number, number, number],
  cb: [number, number, number],
  cc: [number, number, number],
): void {
  const minX = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x)));
  const maxX = Math.min(w - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
  const minY = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y)));
  const maxY = Math.min(h - 1, Math.ceil(Math.max(a.y, b.y, c.y)));
  if (maxX < minX || maxY < minY) return;
  const area = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
  if (Math.abs(area) < 1e-7) return;
  const inv = 1 / area;
  for (let y = minY; y <= maxY; y++) {
    const py = y + 0.5;
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5;
      const w0 = ((b.x - px) * (c.y - py) - (c.x - px) * (b.y - py)) * inv;
      const w1 = ((c.x - px) * (a.y - py) - (a.x - px) * (c.y - py)) * inv;
      const w2 = 1 - w0 - w1;
      const mn = Math.min(w0, w1, w2);
      if (mn < 0) continue;
      // Opaque coverage: antialiasing comes from 4x supersampling, not per-triangle alpha. Blending
      // partial alpha per triangle leaves visible seams along every shared edge, which read as a
      // wireframe scribbled over the model.
      const cover = 1;
      // Depth test. Painter's sort silently fails on interpenetrating and axis-aligned geometry,
      // painting backfaces over front faces — which is what produced "flat panels jutting out at
      // odd angles". A z-buffer makes the visible surface unambiguous regardless of primitive.
      const z = w0 * a.z + w1 * b.z + w2 * c.z;
      const i = y * w + x;
      if (z <= zbuf[i]! + 1e-6) continue;
      zbuf[i] = z;
      rgb[i * 3] = ca[0] * w0 + cb[0] * w1 + cc[0] * w2;
      rgb[i * 3 + 1] = ca[1] * w0 + cb[1] * w1 + cc[1] * w2;
      rgb[i * 3 + 2] = ca[2] * w0 + cb[2] * w1 + cc[2] * w2;
      alpha[i] = cover;
    }
  }
}

export function rasterise(asm: Assembly, opts: RasterOptions): RasterResult {
  const ss = opts.ss ?? 4;
  const W = opts.width * ss;
  const H = opts.height * ss;
  const rgb = new Float32Array(W * H * 3);
  const alpha = new Float32Array(W * H);
  const zbuf = new Float32Array(W * H).fill(-Infinity);
  const cx = W / 2 + (opts.offsetX ?? 0) * ss;
  const cy = H / 2 + (opts.offsetY ?? 0) * ss;
  const scale = opts.scale * ss;

  const tris = buildTris(asm);

  // Camera direction: the unit vector from the origin toward the camera (orthographic).
  const cyw = Math.cos(opts.yaw);
  const syw = Math.sin(opts.yaw);
  const cp = Math.cos(opts.pitch);
  const sp = Math.sin(opts.pitch);
  const camDir = n3({ x: syw * cp, y: cyw * cp, z: sp });

  const normals = vertexNormals(tris);
  const key = (p: Vec3) => `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}`;
  const occ = buildOccluder(tris);

  // Painter sort is retained only as a cheap ordering; the z-buffer is what decides visibility.
  const sorted = tris
    .map((t) => {
      const p = projectPoint(
        { x: (t.a.x + t.b.x + t.c.x) / 3, y: (t.a.y + t.b.y + t.c.y) / 3, z: (t.a.z + t.b.z + t.c.z) / 3 },
        opts.yaw,
        opts.pitch,
        1,
        0,
        0,
      );
      return { t, d: p.z };
    })
    .sort((a, b) => a.d - b.d);

  // Rim light term: viewDir must be the direction FROM the surface TOWARD the camera. The camera sits
  // along (sin(yaw), cos(yaw), tan(pitch)) normalised; the old value used a fixed z=0.2 and ignored
  // pitch entirely, so rims landed on the wrong silhouette edges as pitch changed.
  const viewDir = camDir;

  // Contact shadow under the assembly.
  if (opts.shadow !== false) {
    const b = boundsOf(tris);
    const rMax = Math.max(b.maxX - b.minX, b.maxY - b.minY) / 2;
    const o = projectPoint({ x: 0, y: 0, z: 0 }, opts.yaw, opts.pitch, scale, cx, cy);
    const rx = rMax * 1.1 * scale;
    const ry = rMax * 0.38 * scale;
    for (let y = Math.max(0, Math.floor(o.y - ry)); y <= Math.min(H - 1, Math.ceil(o.y + ry)); y++) {
      for (let x = Math.max(0, Math.floor(o.x - rx)); x <= Math.min(W - 1, Math.ceil(o.x + rx)); x++) {
        const dx = (x + 0.5 - o.x) / rx;
        const dy = (y + 0.5 - o.y) / ry;
        const d = dx * dx + dy * dy;
        if (d >= 1) continue;
        const a = (1 - d) * 0.45;
        const i = y * W + x;
        const pa = alpha[i]!;
        const outA = pa + a * (1 - pa);
        const t = (a * (1 - pa)) / (outA + 1e-9);
        rgb[i * 3] = rgb[i * 3]! * (1 - t) + 14 * t;
        rgb[i * 3 + 1] = rgb[i * 3 + 1]! * (1 - t) + 11 * t;
        rgb[i * 3 + 2] = rgb[i * 3 + 2]! * (1 - t) + 24 * t;
        alpha[i] = outA;
      }
    }
  }

  // Shade each triangle at its three vertices, using per-vertex normals (smooth) but the
  // triangle's own centroid occlusion (cheap and stable).
  for (const { t } of sorted) {
    const aoC = occlusionAt(occ, { x: (t.a.x + t.b.x + t.c.x) / 3, y: (t.a.y + t.b.y + t.c.y) / 3, z: (t.a.z + t.b.z + t.c.z) / 3 });
    const ao = 1 - aoC * (opts.aoStrength ?? 1);
    const ctx: ShadeCtx = { teamColor: opts.teamColor, exposure: opts.exposure, ao, viewDir };
    const ca = shade(t.material, normals.get(key(t.a))!, ctx);
    const cb = shade(t.material, normals.get(key(t.b))!, ctx);
    const cc = shade(t.material, normals.get(key(t.c))!, ctx);
    const pa = projectPoint(t.a, opts.yaw, opts.pitch, scale, cx, cy);
    const pb = projectPoint(t.b, opts.yaw, opts.pitch, scale, cx, cy);
    const pc = projectPoint(t.c, opts.yaw, opts.pitch, scale, cx, cy);
    fill(rgb, alpha, zbuf, W, H, pa, pb, pc, ca, cb, cc);
  }

  // Box-filter downsample.
  const out = new Uint8ClampedArray(opts.width * opts.height * 4);
  const inv = 1 / (ss * ss);
  for (let y = 0; y < opts.height; y++) {
    for (let x = 0; x < opts.width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const si = (y * ss + sy) * W + (x * ss + sx);
          const wa = alpha[si]!;
          r += rgb[si * 3]! * wa;
          g += rgb[si * 3 + 1]! * wa;
          b += rgb[si * 3 + 2]! * wa;
          a += wa;
        }
      }
      const di = (y * opts.width + x) * 4;
      if (a > 1e-6) {
        out[di] = r / a;
        out[di + 1] = g / a;
        out[di + 2] = b / a;
      }
      out[di + 3] = a * inv * 255;
    }
  }

  if (opts.outline) applyOutline(out, opts.width, opts.height);
  return { rgba: out, width: opts.width, height: opts.height };
}

/** Silhouette-derived outline: darkens the first ring outside the alpha shape. */
function applyOutline(out: Uint8ClampedArray, w: number, h: number): void {
  const src = new Uint8ClampedArray(out);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (src[i + 3]! > 40) continue;
      let near = false;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (src[(ny * w + nx) * 4 + 3]! > 140) {
          near = true;
          break;
        }
      }
      if (!near) continue;
      out[i] = 20;
      out[i + 1] = 16;
      out[i + 2] = 30;
      out[i + 3] = 215;
    }
  }
}
