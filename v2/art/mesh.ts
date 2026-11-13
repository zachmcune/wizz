// A small software renderer for ART AUTHORING ONLY.
//
// Why this exists: v2's art is illustrated sprites baked ahead of time, and hand-authoring 14 units x
// 8 facings x several material layers as raw vector paths is both enormous and inconsistent. Instead
// every sprite is described as a small assembly of 3D primitives (boxes, cylinders, cones, spheres)
// plus per-part material and an emissive/accent mask. This module renders that assembly from a fixed
// isometric camera at any yaw, with real per-face shading, so:
//
//   • Facings are geometrically correct (you see the BACK of a unit from behind, not a rotated front).
//   • Shading is lit consistently, which is what makes a sprite read as an illustration rather than
//     flat vector art.
//   • Team colour is a separate MASK pass, so stone stays stone and only runes/crystals tint.
//
// This is build-time tooling (Node, no DOM). It is never imported by the game.

export type Vec3 = { x: number; y: number; z: number };

export interface Material {
  /** Base RGB 0-255. */
  color: [number, number, number];
  /** How much of the team colour to blend in, 0-1. This is the team-colour mask. */
  teamTint?: number;
  /** Self-illumination: added after lighting so it glows regardless of angle. */
  emissive?: number;
  /** Specular strength for a hard-edged highlight. */
  specular?: number;
  /** Rim-light strength along silhouette edges. */
  rim?: number;
  /** Noise/grain amount for stone/bark materials (deterministic hash noise). */
  grain?: number;
  /** Overall opacity, for glassy parts. */
  alpha?: number;
}

export type Shape =
  | { kind: 'box'; w: number; h: number; d: number; taper?: number }
  | { kind: 'cyl'; r0: number; r1: number; h: number; sides?: number }
  | { kind: 'cone'; r: number; h: number; sides?: number }
  | { kind: 'sphere'; r: number; seg?: number }
  | { kind: 'prism'; r: number; h: number; sides: number };

export interface Part {
  shape: Shape;
  /** Local position offset from the part assembly origin. */
  pos: Vec3;
  /** Rotation about Y in radians, then about Z (for tilted parts like horns). */
  rotY?: number;
  rotZ?: number;
  rotX?: number;
  material: Material;
  /** Optional per-part scale. */
  scale?: Vec3;
}

export interface Assembly {
  parts: Part[];
  /** Overall vertical bob / lift so the feet sit on z=0. */
  groundOffset?: number;
}

// ---------------------------------------------------------------------------- lighting setup

/** Key light from the upper-left-front, the classic three-quarter illustration light. */
const LIGHT_DIR = normalize3({ x: -0.45, y: 0.55, z: 0.72 });
const AMBIENT = 0.52;
const FILL_DIR = normalize3({ x: 0.6, y: -0.5, z: 0.25 });
const FILL_STRENGTH = 0.16;

export function normalize3(v: Vec3): Vec3 {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

// -------------------------------------------------------------------- assembly to triangles

export interface Tri {
  a: Vec3;
  b: Vec3;
  c: Vec3;
  material: Material;
  /** Flat normal in world space, computed once. */
  normal: Vec3;
  /** Barycentric-free depth for painter sorting. */
  depth: number;
}

function transform(p: Vec3, part: Part): Vec3 {
  let { x, y, z } = p;
  const s = part.scale;
  if (s) {
    x *= s.x;
    y *= s.y;
    z *= s.z;
  }
  if (part.rotZ) {
    const c = Math.cos(part.rotZ);
    const sn = Math.sin(part.rotZ);
    const nx = x * c - y * sn;
    const ny = x * sn + y * c;
    x = nx;
    y = ny;
  }
  if (part.rotX) {
    const c = Math.cos(part.rotX);
    const sn = Math.sin(part.rotX);
    const ny = y * c - z * sn;
    const nz = y * sn + z * c;
    y = ny;
    z = nz;
  }
  if (part.rotY) {
    const c = Math.cos(part.rotY);
    const sn = Math.sin(part.rotY);
    const nx = x * c + z * sn;
    const nz = -x * sn + z * c;
    x = nx;
    z = nz;
  }
  return { x: x + part.pos.x, y: y + part.pos.y, z: z + part.pos.z };
}

function addTri(out: Tri[], p1: Vec3, p2: Vec3, p3: Vec3, material: Material): void {
  const normal = normalize3(cross(sub(p2, p1), sub(p3, p1)));
  out.push({
    a: p1,
    b: p2,
    c: p3,
    material,
    normal,
    depth: (p1.x + p2.x + p3.x + p1.y + p2.y + p3.y) / 6,
  });
}

function quad(out: Tri[], p1: Vec3, p2: Vec3, p3: Vec3, p4: Vec3, material: Material): void {
  addTri(out, p1, p2, p3, material);
  addTri(out, p1, p3, p4, material);
}

/** Emit all triangles for one part, transformed into local assembly space. */
function emitPart(out: Tri[], part: Part): void {
  const t = (p: Vec3) => transform(p, part);
  const m = part.material;
  const sh = part.shape;

  if (sh.kind === 'box') {
    const hw = sh.w / 2;
    const hd = sh.d / 2;
    // A taper narrows the top face, which is what makes towers read as tapered rather than slabs.
    const tw = sh.taper !== undefined ? sh.w * sh.taper * 0.5 : hw;
    const td = sh.taper !== undefined ? sh.d * sh.taper * 0.5 : hd;
    const b = [
      { x: -hw, y: -hd, z: 0 },
      { x: hw, y: -hd, z: 0 },
      { x: hw, y: hd, z: 0 },
      { x: -hw, y: hd, z: 0 },
    ];
    const tp = [
      { x: -tw, y: -td, z: sh.h },
      { x: tw, y: -td, z: sh.h },
      { x: tw, y: td, z: sh.h },
      { x: -tw, y: td, z: sh.h },
    ];
    quad(out, t(b[0]!), t(b[1]!), t(tp[1]!), t(tp[0]!), m);
    quad(out, t(b[1]!), t(b[2]!), t(tp[2]!), t(tp[1]!), m);
    quad(out, t(b[2]!), t(b[3]!), t(tp[3]!), t(tp[2]!), m);
    quad(out, t(b[3]!), t(b[0]!), t(tp[0]!), t(tp[3]!), m);
    quad(out, t(tp[0]!), t(tp[1]!), t(tp[2]!), t(tp[3]!), m);
    return;
  }

  if (sh.kind === 'cyl' || sh.kind === 'cone' || sh.kind === 'prism') {
    const sides = sh.kind === 'cyl' ? (sh.sides ?? 10) : sh.kind === 'cone' ? (sh.sides ?? 10) : sh.sides;
    const r0 = sh.kind === 'cyl' ? sh.r0 : sh.kind === 'cone' ? sh.r : sh.r;
    const r1 = sh.kind === 'cyl' ? sh.r1 : 0;
    const height = sh.h;
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2;
      const a1 = ((i + 1) / sides) * Math.PI * 2;
      const p0 = { x: Math.cos(a0) * r0, y: Math.sin(a0) * r0, z: 0 };
      const p1 = { x: Math.cos(a1) * r0, y: Math.sin(a1) * r0, z: 0 };
      if (r1 > 1e-6) {
        const p2 = { x: Math.cos(a1) * r1, y: Math.sin(a1) * r1, z: height };
        const p3 = { x: Math.cos(a0) * r1, y: Math.sin(a0) * r1, z: height };
        quad(out, t(p0), t(p1), t(p2), t(p3), m);
        addTri(out, t({ x: 0, y: 0, z: height }), t(p3), t(p2), m);
      } else {
        addTri(out, t(p0), t(p1), t({ x: 0, y: 0, z: height }), m);
      }
      if (r0 > 1e-6) addTri(out, t({ x: 0, y: 0, z: 0 }), t(p1), t(p0), m);
    }
    return;
  }

  if (sh.kind === 'sphere') {
    const seg = sh.seg ?? 8;
    for (let iy = 0; iy < seg; iy++) {
      const phi0 = (iy / seg) * Math.PI;
      const phi1 = ((iy + 1) / seg) * Math.PI;
      for (let ix = 0; ix < seg; ix++) {
        const th0 = (ix / seg) * Math.PI * 2;
        const th1 = ((ix + 1) / seg) * Math.PI * 2;
        const P = (phi: number, th: number): Vec3 => ({
          x: Math.sin(phi) * Math.cos(th) * sh.r,
          y: Math.sin(phi) * Math.sin(th) * sh.r,
          z: Math.cos(phi) * sh.r,
        });
        const a = P(phi0, th0);
        const b = P(phi1, th0);
        const c = P(phi1, th1);
        const d = P(phi0, th1);
        quad(out, t(a), t(b), t(c), t(d), m);
      }
    }
  }
}

/** World-space bounds of an assembly (after part transforms), for auto-fitting the camera. */
export function assemblyBounds(assembly: Assembly): { minX: number; maxX: number; minY: number; maxY: number; maxZ: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let maxZ = 0;
  for (const tri of buildTriangles(assembly)) {
    for (const p of [tri.a, tri.b, tri.c]) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
      if (p.z > maxZ) maxZ = p.z;
    }
  }
  return { minX, maxX, minY, maxY, maxZ };
}

/** Projected screen-space bounds at a given yaw/pitch, for exact auto-fitting. */
export function projectedBounds(
  assembly: Assembly,
  yaw: number,
  pitch: number,
): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const cyw = Math.cos(yaw);
  const syw = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  for (const tri of buildTriangles(assembly)) {
    for (const p of [tri.a, tri.b, tri.c]) {
      const x = p.x * cyw - p.y * syw;
      const y = p.x * syw + p.y * cyw;
      const sx = x;
      const sy = y * cp - p.z * sp;
      if (sx < minX) minX = sx;
      if (sx > maxX) maxX = sx;
      if (sy < minY) minY = sy;
      if (sy > maxY) maxY = sy;
    }
  }
  return { minX, maxX, minY, maxY };
}

export function buildTriangles(assembly: Assembly): Tri[] {
  const out: Tri[] = [];
  for (const part of assembly.parts) emitPart(out, part);
  return out;
}

// --------------------------------------------------------------------------------- shading

/** Deterministic value noise for grain (no Math.random — art must be reproducible). */
function hashNoise(x: number, y: number, z: number): number {
  let h = Math.imul(Math.round(x * 91.7) ^ 0x9e3779b9, 0x85ebca6b);
  h ^= Math.imul(Math.round(y * 71.3) + 0x165667b1, 0xc2b2ae35);
  h ^= Math.imul(Math.round(z * 57.1) + 0x27d4eb2f, 0x27d4eb2f);
  return ((h >>> 8) & 0xffff) / 0xffff;
}

export interface ShadeOptions {
  /** Team colour applied through the material's teamTint. */
  teamColor: [number, number, number];
  /** 0 = no shading detail, 1 = full grain/specular. Reduced for small sprites. */
  detail: number;
  /** Global exposure. */
  exposure: number;
}

/**
 * Shade one triangle into an RGB triple.
 *
 * The lighting model is deliberately illustration-style rather than physically based: a strong key,
 * a cool fill from the opposite side, an ambient floor, a specular term on shiny materials, a rim
 * term to separate the silhouette from the background, and optional grain for stone/bark.
 */
export function shadeNormal(tri: Tri, normal: Vec3, opts: ShadeOptions): [number, number, number] {
  const m = tri.material;
  const n = normal;
  const key = Math.max(0, dot(n, LIGHT_DIR));
  const fill = Math.max(0, dot(n, FILL_DIR)) * FILL_STRENGTH;
  const upness = Math.max(0, n.z);

  // Base colour with team tint applied through the mask.
  let r = m.color[0];
  let g = m.color[1];
  let b = m.color[2];
  const tint = m.teamTint ?? 0;
  if (tint > 0) {
    r = r * (1 - tint) + opts.teamColor[0] * tint;
    g = g * (1 - tint) + opts.teamColor[1] * tint;
    b = b * (1 - tint) + opts.teamColor[2] * tint;
  }

  let light = AMBIENT + key * 0.95 + fill + upness * 0.16;

  // Specular: a tight highlight on upward-facing shiny surfaces.
  const spec = m.specular ?? 0;
  if (spec > 0 && opts.detail > 0.25) {
    const half = normalize3({ x: LIGHT_DIR.x, y: LIGHT_DIR.y, z: LIGHT_DIR.z + 1 });
    const s = Math.pow(Math.max(0, dot(n, half)), 24) * spec;
    light += s;
  }

  // Grain: hashed on the face normal so the pattern is stable per face, not per pixel.
  const grain = m.grain ?? 0;
  if (grain > 0 && opts.detail > 0.5) {
    const nz = hashNoise(n.x * 7, n.y * 11, n.z * 13) - 0.5;
    light += nz * grain * 0.22;
  }

  // Rim: brighten faces that point away from the camera's forward axis but are still lit, which
  // separates a dark sprite from a dark background.
  const rimStrength = m.rim ?? 0;
  if (rimStrength > 0) {
    const edge = 1 - Math.abs(n.y);
    light += edge * rimStrength * 0.18 * (0.4 + key);
  }

  const e = (m.emissive ?? 0) + (light - 1) * 0.0;
  const shade = light * opts.exposure;
  r = r * shade + r * e;
  g = g * shade + g * e;
  b = b * shade + b * e;

  // A touch of cool desaturation in the shadows keeps dark faces from going muddy.
  const lum = (r + g + b) / 3;
  if (shade < 0.85) {
    const t = (0.85 - shade) * 0.5;
    r = r * (1 - t) + (lum * 0.92) * t;
    g = g * (1 - t) + (lum * 0.96) * t;
    b = b * (1 - t) + (lum * 1.08) * t;
  }

  return [r, g, b];
}

export function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}
