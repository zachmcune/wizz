// Small pure math helpers. No allocation where avoidable; no globals.

export interface Vec2 {
  x: number;
  y: number;
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function len(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

export function lenSq(x: number, y: number): number {
  return x * x + y * y;
}

export function distSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

export function normalize(x: number, y: number): Vec2 {
  const l = Math.sqrt(x * x + y * y);
  if (l < 1e-9) return { x: 0, y: 0 };
  return { x: x / l, y: y / l };
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Shortest signed angular difference from `from` to `to`, in (-PI, PI]. */
export function angleDelta(from: number, to: number): number {
  const tau = Math.PI * 2;
  let d = (to - from) % tau;
  if (d > Math.PI) d -= tau;
  if (d <= -Math.PI) d += tau;
  return d;
}

/** Rotate `from` toward `to` by at most `maxStep` radians (deterministic, never overshoots). */
export function rotateToward(from: number, to: number, maxStep: number): number {
  const d = angleDelta(from, to);
  if (Math.abs(d) <= maxStep) return from + d;
  return from + Math.sign(d) * maxStep;
}
