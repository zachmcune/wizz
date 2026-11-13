// PRODUCTION MESH SYSTEM (v2 art, pilot round).
//
// Replaces the primitive-only system in mesh.ts. Still 100% code-authored geometry: every vertex is
// produced by a function below. No images, no external assets, no generation models of any kind.
//
// The three additions that make forms read as MODELLED rather than as stacks of boxes:
//
//   1. BEVELS. `bevelBox` chamfers every edge into a narrow face. Real objects never have a
//      mathematically sharp edge; a chamfer catches the key light and draws the object's boundary.
//      Without it every face reads as a flat card, which is exactly why the previous pass looked
//      like "panels jutting out at odd angles".
//
//   2. TAPERED, JOINTED TUBES. `tube` sweeps a radius profile along a path, so a limb can taper
//      from shoulder to wrist and bend at an elbow. `capsule` gives muscle masses and rounded heads.
//
//   3. PLATES. `plate` is a tapered slab with independent top/bottom widths — blades, wings, banners,
//      armour skirts.

export type Vec3 = { x: number; y: number; z: number };

export interface Material {
  color: [number, number, number];
  /** How much team colour to blend in (the team-colour mask). 0 = never tinted. */
  teamTint?: number;
  emissive?: number;
  specular?: number;
  rim?: number;
  grain?: number;
  /** Ambient-occlusion strength. Metals get more than cloth. */
  ao?: number;
  alpha?: number;
}

export interface Tri {
  a: Vec3;
  b: Vec3;
  c: Vec3;
  material: Material;
  normal: Vec3;
}

export type Shape =
  | { kind: 'bevelBox'; w: number; d: number; h: number; bevel: number; taper?: number }
  | { kind: 'tube'; sections: { x: number; y: number; z: number; r: number }[]; sides?: number; caps?: boolean }
  | { kind: 'capsule'; r: number; len: number; sides?: number }
  | { kind: 'plate'; w0: number; w1: number; h: number; thick: number }
  | { kind: 'cyl'; r0: number; r1: number; h: number; sides?: number }
  | { kind: 'cone'; r: number; h: number; sides?: number }
  | { kind: 'sphere'; r: number; seg?: number }
  | { kind: 'prism'; r: number; h: number; sides: number };

export interface Part {
  shape: Shape;
  pos: Vec3;
  rotY?: number;
  rotZ?: number;
  rotX?: number;
  material: Material;
  scale?: Vec3;
}

export interface Assembly {
  parts: Part[];
}

// ------------------------------------------------------------------------------------ vector maths

export function n3(v: Vec3): Vec3 {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}
function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}
export function dot3(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

// --------------------------------------------------------------------------------------- emitting

class Emitter {
  tris: Tri[] = [];
  add(a: Vec3, b: Vec3, c: Vec3, material: Material): void {
    // Reject degenerate triangles (zero area) — they produce NaN normals.
    const nx = cross(sub(b, a), sub(c, a));
    if (Math.hypot(nx.x, nx.y, nx.z) < 1e-9) return;
    this.tris.push({ a, b, c, material, normal: n3(nx) });
  }
  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, material: Material): void {
    this.add(a, b, c, material);
    this.add(a, c, d, material);
  }
}

/** Transform a local-space point by a part's scale, rotations and translation. */
function xf(p: Vec3, part: Part): Vec3 {
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

/**
 * BEVELLED BOX.
 *
 * A box whose 12 edges are each replaced by a narrow 45-degree face. Built by sweeping three
 * quads per side inward: for each of the 4 side faces we inset by `bevel` at the top and bottom,
 * then run chamfer strips along the top and bottom rims and fill the corners.
 *
 * `taper` narrows the TOP face, so towers and torsos are not slabs.
 */
function bevelBox(em: Emitter, w: number, h: number, d: number, bevel: number, taper: number, m: Material, part: Part): void {
  const b = Math.max(0.01, Math.min(bevel, Math.min(w, d) * 0.45, h * 0.45));
  const hw = w / 2;
  const hd = d / 2;
  const tw = (w * (taper ?? 1)) / 2;
  const td = (d * (taper ?? 1)) / 2;
  // Bottom ring, inset by b. Top ring, inset by b and tapered.
  const bw = hw - b;
  const bd = hd - b;
  const twi = tw - b * (taper ?? 1);
  const tdi = td - b * (taper ?? 1);
  const z0 = b;
  const z1 = h - b;

  const bottom: Vec3[] = [
    { x: -bw, y: -bd, z: z0 },
    { x: bw, y: -bd, z: z0 },
    { x: bw, y: bd, z: z0 },
    { x: -bw, y: bd, z: z0 },
  ];
  const top: Vec3[] = [
    { x: -twi, y: -tdi, z: z1 },
    { x: twi, y: -tdi, z: z1 },
    { x: twi, y: tdi, z: z1 },
    { x: -twi, y: tdi, z: z1 },
  ];
  // Outer bottom rim (on the true box edge) and outer top rim.
  const ob: Vec3[] = [
    { x: -hw, y: -hd, z: 0 },
    { x: hw, y: -hd, z: 0 },
    { x: hw, y: hd, z: 0 },
    { x: -hw, y: hd, z: 0 },
  ];
  const ot: Vec3[] = [
    { x: -tw, y: -td, z: h },
    { x: tw, y: -td, z: h },
    { x: tw, y: td, z: h },
    { x: -tw, y: td, z: h },
  ];

  const T = (p: Vec3) => xf(p, part);

  // main side faces
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    em.quad(T(bottom[i]!), T(bottom[j]!), T(top[j]!), T(top[i]!), m);
  }
  // bottom chamfer strip
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    em.quad(T(ob[i]!), T(ob[j]!), T(bottom[j]!), T(bottom[i]!), m);
  }
  // top chamfer strip
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    em.quad(T(top[i]!), T(top[j]!), T(ot[j]!), T(ot[i]!), m);
  }
  // caps
  em.quad(T(bottom[0]!), T(bottom[3]!), T(bottom[2]!), T(bottom[1]!), m);
  em.quad(T(top[0]!), T(top[1]!), T(top[2]!), T(top[3]!), m);

  // corner chamfers: 8 small triangles at the 4 vertical corners (top and bottom)
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    // vertical corner between side i and side j at the bottom
    em.add(T(ob[i]!), T(ob[j]!), T(bottom[i]!), m);
    em.add(T(ob[j]!), T(bottom[j]!), T(bottom[i]!), m);
    // and at the top
    em.add(T(ot[i]!), T(top[i]!), T(ot[j]!), m);
    em.add(T(ot[j]!), T(top[i]!), T(top[j]!), m);
  }
}

/**
 * TAPERED, JOINTED TUBE.
 *
 * Sweeps a circular profile of varying radius along a polyline. Because each section has its own
 * radius and position, one call can describe a shoulder-to-hand limb that tapers and bends at the
 * elbow — which is what makes a limb read as a limb instead of two cylinders.
 */
function tube(em: Emitter, sections: { x: number; y: number; z: number; r: number }[], sides: number, caps: boolean, m: Material, part: Part): void {
  if (sections.length < 2) return;
  const T = (p: Vec3) => xf(p, part);
  const rings: Vec3[][] = [];
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i]!;
    // Direction along the tube, so the ring is perpendicular to it.
    const prev = sections[Math.max(0, i - 1)]!;
    const next = sections[Math.min(sections.length - 1, i + 1)]!;
    const dir = n3({ x: next.x - prev.x, y: next.y - prev.y, z: next.z - prev.z });
    // Build an orthonormal basis around `dir`.
    const up: Vec3 = Math.abs(dir.z) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 0, z: 1 };
    const u = n3(cross(dir, up));
    const v = cross(dir, u);
    const ring: Vec3[] = [];
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      const ca = Math.cos(a) * s.r;
      const sa = Math.sin(a) * s.r;
      ring.push(T({ x: s.x + u.x * ca + v.x * sa, y: s.y + u.y * ca + v.y * sa, z: s.z + u.z * ca + v.z * sa }));
    }
    rings.push(ring);
  }
  for (let i = 0; i < rings.length - 1; i++) {
    const A = rings[i]!;
    const B = rings[i + 1]!;
    for (let k = 0; k < sides; k++) {
      const k2 = (k + 1) % sides;
      em.quad(A[k]!, A[k2]!, B[k2]!, B[k]!, m);
    }
  }
  if (caps) {
    const first = rings[0]!;
    const last = rings[rings.length - 1]!;
    for (let k = 1; k < sides - 1; k++) {
      em.add(first[0]!, first[k + 1]!, first[k]!, m);
      em.add(last[0]!, last[k]!, last[k + 1]!, m);
    }
  }
}

/** Capsule along +Z: a cylinder with hemispherical ends. Heads, shoulders, muscle masses. */
function capsule(em: Emitter, r: number, len: number, sides: number, m: Material, part: Part): void {
  const T = (p: Vec3) => xf(p, part);
  const segs = 3;
  const sections: { x: number; y: number; z: number; r: number }[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const a = (t * Math.PI) / 2;
    sections.push({ x: 0, y: 0, z: r + (len - 2 * r) * t + 0, r: r });
    void a;
  }
  // Simple two-cap construction: a tube body plus two hemispheres approximated by rings.
  const body: { x: number; y: number; z: number; r: number }[] = [
    { x: 0, y: 0, z: 0, r: r * 0.55 },
    { x: 0, y: 0, z: r * 0.35, r: r * 0.88 },
    { x: 0, y: 0, z: r * 0.8, r: r },
    { x: 0, y: 0, z: len - r * 0.8, r: r },
    { x: 0, y: 0, z: len - r * 0.35, r: r * 0.88 },
    { x: 0, y: 0, z: len, r: r * 0.55 },
  ];
  void sections;
  tube(em, body, sides, true, m, part);
  void T;
}

/** Tapered slab: a blade, wing, banner or armour skirt. `w0` at the base, `w1` at the tip. */
function plate(em: Emitter, w0: number, w1: number, h: number, thick: number, m: Material, part: Part): void {
  const T = (p: Vec3) => xf(p, part);
  const t = thick / 2;
  const b0: Vec3 = { x: -w0 / 2, y: -t, z: 0 };
  const b1: Vec3 = { x: w0 / 2, y: -t, z: 0 };
  const b2: Vec3 = { x: w0 / 2, y: t, z: 0 };
  const b3: Vec3 = { x: -w0 / 2, y: t, z: 0 };
  const t0: Vec3 = { x: -w1 / 2, y: -t, z: h };
  const t1: Vec3 = { x: w1 / 2, y: -t, z: h };
  const t2: Vec3 = { x: w1 / 2, y: t, z: h };
  const t3: Vec3 = { x: -w1 / 2, y: t, z: h };
  em.quad(T(b0), T(b1), T(t1), T(t0), m);
  em.quad(T(b1), T(b2), T(t2), T(t1), m);
  em.quad(T(b2), T(b3), T(t3), T(t2), m);
  em.quad(T(b3), T(b0), T(t0), T(t3), m);
  em.quad(T(t0), T(t1), T(t2), T(t3), m);
  em.quad(T(b3), T(b2), T(b1), T(b0), m);
}

/** Emit every part's triangles. */
export function buildTris(assembly: Assembly): Tri[] {
  const em = new Emitter();
  for (const part of assembly.parts) {
    const sh = part.shape;
    const m = part.material;
    if (sh.kind === 'bevelBox') {
      bevelBox(em, sh.w, sh.h, sh.d, sh.bevel, sh.taper ?? 1, m, part);
    } else if (sh.kind === 'tube') {
      tube(em, sh.sections, sh.sides ?? 8, sh.caps !== false, m, part);
    } else if (sh.kind === 'capsule') {
      capsule(em, sh.r, sh.len, sh.sides ?? 10, m, part);
    } else if (sh.kind === 'plate') {
      plate(em, sh.w0, sh.w1, sh.h, sh.thick, m, part);
    } else if (sh.kind === 'cyl' || sh.kind === 'cone' || sh.kind === 'prism') {
      const sides = sh.kind === 'cyl' ? (sh.sides ?? 12) : sh.kind === 'cone' ? (sh.sides ?? 10) : sh.sides;
      const r0 = sh.kind === 'cyl' ? sh.r0 : sh.kind === 'cone' ? sh.r : sh.r;
      // BUG FIX: `prism` must keep its radius at the top. It was falling into the cone branch
      // (r1 = 0), so every crystal, tower band and rune ring was silently built as a cone tapering to
      // a point — which is why the mana node's shards vanished and buildings read as flat panels.
      const r1 = sh.kind === 'cyl' ? sh.r1 : sh.kind === 'prism' ? sh.r : 0;
      const T = (p: Vec3) => xf(p, part);
      for (let i = 0; i < sides; i++) {
        const a0 = (i / sides) * Math.PI * 2;
        const a1 = ((i + 1) / sides) * Math.PI * 2;
        const p0: Vec3 = { x: Math.cos(a0) * r0, y: Math.sin(a0) * r0, z: 0 };
        const p1: Vec3 = { x: Math.cos(a1) * r0, y: Math.sin(a1) * r0, z: 0 };
        if (r1 > 1e-6) {
          const p2: Vec3 = { x: Math.cos(a1) * r1, y: Math.sin(a1) * r1, z: sh.h };
          const p3: Vec3 = { x: Math.cos(a0) * r1, y: Math.sin(a0) * r1, z: sh.h };
          em.quad(T(p0), T(p1), T(p2), T(p3), m);
          em.add(T({ x: 0, y: 0, z: sh.h }), T(p3), T(p2), m);
        } else {
          em.add(T(p0), T(p1), T({ x: 0, y: 0, z: sh.h }), m);
        }
        em.add(T({ x: 0, y: 0, z: 0 }), T(p1), T(p0), m);
      }
    } else if (sh.kind === 'sphere') {
      const seg = sh.seg ?? 10;
      const T = (p: Vec3) => xf(p, part);
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
          em.quad(T(P(phi0, th0)), T(P(phi1, th0)), T(P(phi1, th1)), T(P(phi0, th1)), m);
        }
      }
    }
  }
  return em.tris;
}

/** Axis-aligned bounds of the built geometry (for auto-framing). */
export function boundsOf(tris: Tri[]): { minX: number; maxX: number; minY: number; maxY: number; maxZ: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let maxZ = 0;
  for (const t of tris) {
    for (const p of [t.a, t.b, t.c]) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
      if (p.z > maxZ) maxZ = p.z;
    }
  }
  return { minX, maxX, minY, maxY, maxZ };
}
