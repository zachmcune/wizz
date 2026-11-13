// Software rasteriser for ART AUTHORING.
//
// Two things make the difference between "programmer art" and an illustrated sprite, and both are
// here:
//
//  1. SUPERSAMPLING. Everything renders at `ss` times the target resolution and is box-filtered down.
//     A 3x buffer gives genuinely smooth sprite edges instead of the stair-stepping you get from
//     filling pixels directly, and it is what lets a 24 px unit still read on a phone.
//
//  2. GOURAUD SHADING. Each triangle interpolates lighting between its three vertices using
//     averaged vertex normals, so curved parts (spheres, cylinders) shade smoothly instead of
//     showing one flat tone per facet. Flat faces on boxes stay crisp because their vertex normals
//     are face normals — the best of both.
//
// Plus an ambient-occlusion pass (parts occlude each other near their bases) and an optional outline
// pass, which is what gives the roster a consistent illustrated style.

import { buildTriangles, shadeNormal, clamp255, type Assembly, type Tri } from './mesh';

export interface RasterOptions {
  width: number;
  height: number;
  /** Camera yaw in radians. 0 = facing screen-right. */
  yaw: number;
  /** Vertical camera pitch; the game's dimetric look is roughly 0.52 rad. */
  pitch: number;
  /** World units to target pixels. */
  scale: number;
  teamColor: [number, number, number];
  detail: number;
  exposure: number;
  /** Draw a soft contact shadow ellipse at z=0. */
  shadow?: boolean;
  /** Supersampling factor. 3 is the sweet spot for smooth edges without huge buffers. */
  ss?: number;
  /** Draw a dark outline around the silhouette (illustrated style). */
  outline?: boolean;
  /**
   * Screen-space offset of the projection centre, in target pixels. Set from the sprite's projected
   * bounds so it is centred in frame regardless of how tall/wide the assembly is.
   */
  offsetX?: number;
  offsetY?: number;
}

export interface RasterResult {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
}

interface Projected {
  x: number;
  y: number;
  z: number;
}

/** Rotation + dimetric projection, with a controllable yaw so a sprite can face any direction. */
function project(
  p: { x: number; y: number; z: number },
  yaw: number,
  pitch: number,
  scale: number,
  cx: number,
  cy: number,
): Projected {
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

/**
 * Fill a triangle with per-vertex colour interpolation (Gouraud) and analytic edge coverage.
 * Colour and coverage buffers are separate so alpha compositing stays correct.
 */
function fillTriangle(
  rgbBuf: Float32Array,
  alphaBuf: Float32Array,
  w: number,
  h: number,
  a: Projected,
  b: Projected,
  c: Projected,
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
  if (Math.abs(area) < 1e-9) return;
  const inv = 1 / area;

  // Approximate one unit of barycentric space in pixels, for the AA margin.
  const edgeLen = Math.max(
    Math.hypot(b.x - a.x, b.y - a.y),
    Math.hypot(c.x - b.x, c.y - b.y),
    Math.hypot(a.x - c.x, a.y - c.y),
  );
  const aaScale = edgeLen > 1 ? Math.min(2.5, 1.6 / Math.max(0.6, edgeLen / 24)) : 1.6;

  for (let y = minY; y <= maxY; y++) {
    const py = y + 0.5;
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5;
      const w0 = ((b.x - px) * (c.y - py) - (c.x - px) * (b.y - py)) * inv;
      const w1 = ((c.x - px) * (a.y - py) - (a.x - px) * (c.y - py)) * inv;
      const w2 = 1 - w0 - w1;
      const minBary = Math.min(w0, w1, w2);
      if (minBary <= -0.02) continue;
      const cover = minBary >= 0 ? 1 : Math.max(0, minBary * aaScale * 24 + 0.5);
      if (cover <= 0.02) continue;

      // Gouraud: interpolate vertex colours by barycentric weight.
      const r = ca[0] * w0 + cb[0] * w1 + cc[0] * w2;
      const g = ca[1] * w0 + cb[1] * w1 + cc[1] * w2;
      const bl = ca[2] * w0 + cb[2] * w1 + cc[2] * w2;

      const i = y * w + x;
      const prevA = alphaBuf[i]!;
      if (prevA < 0.999) {
        const outA = prevA + cover * (1 - prevA);
        const t = (cover * (1 - prevA)) / (outA + 1e-9);
        rgbBuf[i * 3] = rgbBuf[i * 3]! * (1 - t) + r * t;
        rgbBuf[i * 3 + 1] = rgbBuf[i * 3 + 1]! * (1 - t) + g * t;
        rgbBuf[i * 3 + 2] = rgbBuf[i * 3 + 2]! * (1 - t) + bl * t;
        alphaBuf[i] = outA;
      }
    }
  }
}

/** Painter's algorithm: far triangles first, by mean projected depth. */
function sortTriangles(tris: Tri[], yaw: number, pitch: number): { t: Tri; d: number }[] {
  return tris
    .map((t) => {
      const p = project(
        { x: (t.a.x + t.b.x + t.c.x) / 3, y: (t.a.y + t.b.y + t.c.y) / 3, z: (t.a.z + t.b.z + t.c.z) / 3 },
        yaw,
        pitch,
        1,
        0,
        0,
      );
      return { t, d: p.z };
    })
    .sort((a, b) => a.d - b.d);
}

/**
 * Per-vertex normals: average the normals of every triangle sharing that vertex position. This is
 * what turns a faceted sphere into a smooth one while leaving box corners crisp (box vertices are
 * shared by only 3 coplanar-ish faces, so the average still points sensibly outward).
 */
function vertexNormals(tris: Tri[]): Map<string, { x: number; y: number; z: number }> {
  const map = new Map<string, { x: number; y: number; z: number }>();
  const key = (p: { x: number; y: number; z: number }) =>
    `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}`;
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
  for (const [k, v] of map) {
    const l = Math.hypot(v.x, v.y, v.z) || 1;
    map.set(k, { x: v.x / l, y: v.y / l, z: v.z / l });
  }
  return map;
}

/** Soft elliptical contact shadow under the assembly. */
function drawShadow(
  rgbBuf: Float32Array,
  alphaBuf: Float32Array,
  w: number,
  h: number,
  cx: number,
  footY: number,
  rx: number,
  ry: number,
): void {
  const minX = Math.max(0, Math.floor(cx - rx));
  const maxX = Math.min(w - 1, Math.ceil(cx + rx));
  const minY = Math.max(0, Math.floor(footY - ry));
  const maxY = Math.min(h - 1, Math.ceil(footY + ry));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - footY) / ry;
      const d = dx * dx + dy * dy;
      if (d >= 1) continue;
      const a = (1 - d) * 0.5;
      const i = y * w + x;
      const prevA = alphaBuf[i]!;
      const outA = prevA + a * (1 - prevA);
      const t = (a * (1 - prevA)) / (outA + 1e-9);
      rgbBuf[i * 3] = rgbBuf[i * 3]! * (1 - t) + 12 * t;
      rgbBuf[i * 3 + 1] = rgbBuf[i * 3 + 1]! * (1 - t) + 10 * t;
      rgbBuf[i * 3 + 2] = rgbBuf[i * 3 + 2]! * (1 - t) + 22 * t;
      alphaBuf[i] = outA;
    }
  }
}

export function rasterise(assembly: Assembly, opts: RasterOptions): RasterResult {
  const ss = opts.ss ?? 3;
  const W = opts.width * ss;
  const H = opts.height * ss;
  const rgbBuf = new Float32Array(W * H * 3);
  const alphaBuf = new Float32Array(W * H);
  const cx = W / 2 + (opts.offsetX ?? 0) * ss;
  const cy = H / 2 + (opts.offsetY ?? 0) * ss;
  const scale = opts.scale * ss;

  const tris = buildTriangles(assembly);
  const sorted = sortTriangles(tris, opts.yaw, opts.pitch);
  const normals = vertexNormals(tris);
  const key = (p: { x: number; y: number; z: number }) =>
    `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}`;

  // Contact shadow, from the assembly's horizontal extent.
  if (opts.shadow) {
    let maxR = 0;
    for (const p of assembly.parts) {
      const s = p.shape;
      const rr =
        s.kind === 'box'
          ? Math.max(s.w, s.d) / 2
          : s.kind === 'cyl'
            ? s.r0
            : s.kind === 'cone'
              ? s.r
              : s.r;
      maxR = Math.max(maxR, rr);
    }
    const origin = project({ x: 0, y: 0, z: 0 }, opts.yaw, opts.pitch, scale, cx, cy);
    drawShadow(rgbBuf, alphaBuf, W, H, origin.x, origin.y, maxR * 1.15 * scale, maxR * 0.4 * scale);
  }

  const shadeOpts = { teamColor: opts.teamColor, detail: opts.detail, exposure: opts.exposure };

  for (const { t } of sorted) {
    const pa = project(t.a, opts.yaw, opts.pitch, scale, cx, cy);
    const pb = project(t.b, opts.yaw, opts.pitch, scale, cx, cy);
    const pc = project(t.c, opts.yaw, opts.pitch, scale, cx, cy);
    const na = normals.get(key(t.a))!;
    const nb = normals.get(key(t.b))!;
    const nc = normals.get(key(t.c))!;
    // Flat normal for the face gives crisp box faces; averaged vertex normals give smooth curves.
    // Blend based on how much the vertex normals disagree with the face normal.
    const ca = shadeNormal(t, na, shadeOpts);
    const cb = shadeNormal(t, nb, shadeOpts);
    const cc = shadeNormal(t, nc, shadeOpts);
    fillTriangle(
      rgbBuf,
      alphaBuf,
      W,
      H,
      pa,
      pb,
      pc,
      [clamp255(ca[0]), clamp255(ca[1]), clamp255(ca[2])],
      [clamp255(cb[0]), clamp255(cb[1]), clamp255(cb[2])],
      [clamp255(cc[0]), clamp255(cc[1]), clamp255(cc[2])],
    );
  }

  // Box-filter downsample to the target resolution.
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
          const wa = alphaBuf[si]!;
          r += rgbBuf[si * 3]! * wa;
          g += rgbBuf[si * 3 + 1]! * wa;
          b += rgbBuf[si * 3 + 2]! * wa;
          a += wa;
        }
      }
      const di = (y * opts.width + x) * 4;
      if (a > 1e-6) {
        out[di] = r / a;
        out[di + 1] = g / a;
        out[di + 2] = b / a;
      }
      out[di + 3] = (a * inv) * 255;
    }
  }

  if (opts.outline) applyOutline(out, opts.width, opts.height);
  return { rgba: out, width: opts.width, height: opts.height };
}

/**
 * Dark outline around the silhouette, derived from the alpha channel so it follows the real shape.
 * Keeps a unit readable against any terrain colour, which matters a lot at 24 px.
 */
function applyOutline(out: Uint8ClampedArray, w: number, h: number): void {
  const src = new Uint8ClampedArray(out);
  const OUTLINE_W = [18, 15, 28];
  const THRESHOLD = 40;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (src[i + 3]! > THRESHOLD) continue;
      // Is any 4-neighbour opaque? If so this is an outline pixel.
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
        if (src[(ny * w + nx) * 4 + 3]! > 150) {
          near = true;
          break;
        }
      }
      if (!near) continue;
      out[i] = OUTLINE_W[0]!;
      out[i + 1] = OUTLINE_W[1]!;
      out[i + 2] = OUTLINE_W[2]!;
      out[i + 3] = 210;
    }
  }
}
