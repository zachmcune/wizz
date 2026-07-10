// Reusable support-aura drawing helpers for healing/buff towers (pooled Graphics, no sim imports).
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

export function easeIn(t: number): number {
  return t * t;
}

export function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/** Three discrete army-size tiers (Watch / Garrison / Host). */
export function auraTierFromUnitCount(count: number, thresholds: [number, number] = [4, 10]): 1 | 2 | 3 {
  if (count >= thresholds[1]) return 3;
  if (count >= thresholds[0]) return 2;
  return 1;
}

/** Snap tier transitions with a brief crossfade (0–1 blend toward target). */
export function tierBlend(current: number, target: 1 | 2 | 3, dtSec: number, crossfadeSec = 0.5): number {
  const step = dtSec / crossfadeSec;
  if (current < target) return Math.min(target, current + step);
  if (current > target) return Math.max(target, current - step);
  return target;
}

/** Flat rune circle at ground level, slowly rotating. */
export function drawGroundRuneCircle(
  strokePool: GraphicsPool,
  fillPool: GraphicsPool,
  cx: number,
  cy: number,
  radius: number,
  rotation: number,
  color: number,
  alpha: number,
  segments = 8,
): void {
  const g = strokePool.acquire();
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2 + rotation;
    const px = cx + Math.cos(a) * radius;
    const py = cy + Math.sin(a) * radius * 0.55;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.stroke({ width: 1.5, color, alpha: alpha * 0.55 });
  strokePool.acquire().circle(cx, cy, radius * 0.72).stroke({ width: 1, color, alpha: alpha * 0.35 });
  fillPool.acquire().circle(cx, cy, radius * 0.08).fill({ color, alpha: alpha * 0.12 });
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2 + rotation;
    const inner = radius * 0.42;
    const outer = radius * 0.88;
    strokePool.acquire()
      .moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner * 0.55)
      .lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer * 0.55)
      .stroke({ width: 1.2, color, alpha: alpha * 0.4 });
  }
}

/** Expanding translucent ring (pulse wave). Returns draw alpha for the ring stroke. */
export function drawExpandingRing(
  strokePool: GraphicsPool,
  cx: number,
  cy: number,
  maxRadius: number,
  progress: number,
  color: number,
  width: number,
  alpha: number,
): void {
  const t = easeOut(Math.min(1, progress));
  const r = maxRadius * (0.08 + t * 0.92);
  const a = alpha * (1 - t * 0.85);
  strokePool.acquire().circle(cx, cy, r).stroke({ width, color, alpha: a });
}

/** Thin warm ring orbiting a unit's feet. */
export function drawFootOrbitRing(
  strokePool: GraphicsPool,
  cx: number,
  cy: number,
  radius: number,
  phase: number,
  color: number,
  alpha: number,
): void {
  const orbitR = radius * 0.55;
  const ang = phase * 1.8;
  strokePool.acquire().ellipse(cx, cy, orbitR, orbitR * 0.38).stroke({ width: 1.2, color, alpha: alpha * 0.45 });
  const dotX = cx + Math.cos(ang) * orbitR;
  const dotY = cy + Math.sin(ang) * orbitR * 0.38;
  strokePool.acquire().circle(dotX, dotY, 2.2).stroke({ width: 1.5, color, alpha });
}

/** Soft inward mist strokes (lightweight, no particles). */
export function drawInwardMist(
  strokePool: GraphicsPool,
  cx: number,
  cy: number,
  fieldRadius: number,
  density: number,
  phase: number,
  seed: number,
  color: number,
  alpha: number,
): void {
  const count = Math.max(2, Math.floor(density));
  for (let i = 0; i < count; i++) {
    const t = detRand(seed + i * 3.7);
    const ang = t * Math.PI * 2 + phase * 0.15;
    const outer = fieldRadius * (0.55 + detRand(seed + i) * 0.4);
    const inner = fieldRadius * (0.12 + detRand(seed + i * 2) * 0.15);
    const ox = cx + Math.cos(ang) * outer;
    const oy = cy + Math.sin(ang) * outer * 0.55;
    const ix = cx + Math.cos(ang + 0.08) * inner;
    const iy = cy + Math.sin(ang + 0.08) * inner * 0.55;
    const drift = Math.sin(phase * 0.4 + i) * 3;
    strokePool.acquire()
      .moveTo(ox, oy + drift)
      .lineTo(ix, iy + drift * 0.5)
      .stroke({ width: 1.2, color, alpha: alpha * (0.25 + detRand(seed + i * 5) * 0.35) });
  }
}

/** Floating light motes rising and fading. */
export function drawFloatingMotes(
  fillPool: GraphicsPool,
  cx: number,
  cy: number,
  fieldRadius: number,
  count: number,
  phase: number,
  seed: number,
  color: number,
  alpha: number,
): void {
  for (let i = 0; i < count; i++) {
    const t = detRand(seed + i * 2.3);
    const ang = t * Math.PI * 2;
    const dist = fieldRadius * (0.15 + detRand(seed + i) * 0.65);
    const rise = (Math.sin(phase * 0.35 + i * 1.7) * 0.5 + 0.5) * 12;
    const px = cx + Math.cos(ang) * dist;
    const py = cy + Math.sin(ang) * dist * 0.55 - rise;
    const flicker = 0.5 + Math.sin(phase * 0.8 + i) * 0.5;
    fillPool.acquire().circle(px, py, 1 + detRand(seed + i) * 1.2).fill({ color, alpha: alpha * flicker * 0.7 });
  }
}
