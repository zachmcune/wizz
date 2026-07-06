// Deterministic numeric helpers for the sim. Keep operation order stable.
import type { Vec2 } from '../core/coords';

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function dist(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function distSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function len(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

/** Normalize a vector; returns {x:0,y:0} for the zero vector. */
export function normalize(x: number, y: number): Vec2 {
  const l = Math.sqrt(x * x + y * y);
  if (l < 1e-9) return { x: 0, y: 0 };
  return { x: x / l, y: y / l };
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
