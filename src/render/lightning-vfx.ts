// Reusable jagged lightning bolt drawing for chain attacks and tower effects.
import type { GraphicsPool } from './graphics-pool';

export function detRand(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function lerpColor(c1: number, c2: number, t: number): number {
  const r1 = (c1 >> 16) & 255;
  const g1 = (c1 >> 8) & 255;
  const b1 = c1 & 255;
  const r2 = (c2 >> 16) & 255;
  const g2 = (c2 >> 8) & 255;
  const b2 = c2 & 255;
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return (r << 16) | (g << 8) | b;
}

export interface LightningBoltOptions {
  /** 0 = white-hot primary, 1 = faded blue tail of chain */
  falloff?: number;
  /** Flicker phase for shimmer */
  phase?: number;
  /** Branching sub-bolt offset (0 = none) */
  branch?: number;
}

const WHITE_CORE = 0xffffff;
const CYAN_GLOW = 0x7fe3ff;
const BLUE_TAIL = 0x4488ff;
const PURPLE_EDGE = 0xb58cff;

/** Draw a jagged multi-layer lightning bolt between two screen points. */
export function drawLightningBolt(
  strokePool: GraphicsPool,
  fillPool: GraphicsPool,
  sx: number,
  sy: number,
  ex: number,
  ey: number,
  width: number,
  seed: number,
  opts: LightningBoltOptions = {},
): void {
  const falloff = opts.falloff ?? 0;
  const phase = opts.phase ?? 0;
  const branch = opts.branch ?? 0;
  const flicker = 0.85 + Math.sin(phase * 14 + seed) * 0.15;
  const coreColor = lerpColor(WHITE_CORE, CYAN_GLOW, falloff * 0.4);
  const glowColor = lerpColor(CYAN_GLOW, BLUE_TAIL, falloff);
  const edgeColor = lerpColor(PURPLE_EDGE, BLUE_TAIL, falloff * 0.6);
  const alpha = (1 - falloff * 0.35) * flicker;

  const dx = ex - sx;
  const dy = ey - sy;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;

  const segments = 2 + Math.floor(detRand(seed) * 2);
  const points: { x: number; y: number }[] = [{ x: sx, y: sy }];
  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const jitter = (detRand(seed + i * 7.3) - 0.5) * width * 2.8;
    const flick = Math.sin(phase * 9 + i * 2.1 + seed) * width * 0.35;
    points.push({
      x: sx + dx * t + nx * (jitter + flick),
      y: sy + dy * t + ny * (jitter + flick),
    });
  }
  points.push({ x: ex, y: ey });

  const layers = [
    { w: width * 1.8, color: glowColor, a: alpha * 0.35 },
    { w: width * 1.1, color: glowColor, a: alpha * 0.55 },
    { w: width * 0.55, color: coreColor, a: alpha * 0.92 },
    { w: width * 0.22, color: WHITE_CORE, a: alpha * 0.98 },
  ];
  for (const layer of layers) {
    const g = strokePool.acquire();
    g.moveTo(points[0]!.x, points[0]!.y);
    for (let i = 1; i < points.length; i++) g.lineTo(points[i]!.x, points[i]!.y);
    g.stroke({ width: layer.w, color: layer.color, alpha: layer.a });
  }

  // Purple crackling edge threads
  for (let i = 0; i < points.length - 1; i++) {
    if (detRand(seed + i * 11) > 0.55) continue;
    const t = detRand(seed + i * 3.7);
    const px = points[i]!.x + (points[i + 1]!.x - points[i]!.x) * t;
    const py = points[i]!.y + (points[i + 1]!.y - points[i]!.y) * t;
    const off = width * (0.4 + detRand(seed + i) * 0.5);
    strokePool.acquire()
      .moveTo(px, py)
      .lineTo(px + nx * off * (detRand(seed + i * 2) > 0.5 ? 1 : -1), py + ny * off * 0.5)
      .stroke({ width: 1, color: edgeColor, alpha: alpha * 0.65 });
  }

  if (branch > 0) {
    const mid = points[Math.floor(points.length / 2)]!;
    const bx = mid.x + nx * branch * (detRand(seed + 99) > 0.5 ? 1 : -1);
    const by = mid.y + ny * branch * 0.4;
    drawLightningBolt(strokePool, fillPool, mid.x, mid.y, bx, by, width * 0.45, seed + 50, {
      falloff: falloff + 0.15,
      phase,
    });
  }

  fillPool.acquire().circle(ex, ey, width * 0.5 * flicker).fill({ color: coreColor, alpha: alpha * 0.55 });
}

/** Ground-hugging elliptical shockwave (oblique-aware via drawPos flattening). */
export function drawGroundShockwave(
  strokePool: GraphicsPool,
  fillPool: GraphicsPool,
  x: number,
  y: number,
  radius: number,
  progress: number,
  color: number,
): void {
  const t = progress;
  const alpha = t < 0.12 ? t / 0.12 : 1 - (t - 0.12) / 0.88;
  const r = radius * (0.15 + t * 1.1);
  strokePool.acquire().ellipse(x, y, r, r * 0.55).stroke({ width: 3 - t * 1.5, color, alpha: alpha * 0.75 });
  fillPool.acquire().ellipse(x, y, r * 0.7, r * 0.38).fill({ color, alpha: alpha * 0.12 });
}

/** Fading tendril arcing into the ground. */
export function drawDissipationTendril(
  strokePool: GraphicsPool,
  x: number,
  y: number,
  seed: number,
  progress: number,
): void {
  const alpha = 1 - progress;
  const ang = detRand(seed) * Math.PI * 2;
  const len = 8 + detRand(seed + 1) * 14;
  const midX = x + Math.cos(ang) * len * 0.45;
  const midY = y + Math.sin(ang) * len * 0.25 - 6 * (1 - progress);
  const endX = x + Math.cos(ang) * len;
  const endY = y + Math.sin(ang) * len * 0.35 + 4;
  strokePool.acquire()
    .moveTo(x, y)
    .quadraticCurveTo(midX, midY, endX, endY)
    .stroke({ width: 1.2, color: BLUE_TAIL, alpha: alpha * 0.55 });
}
