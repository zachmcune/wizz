// Beam geometry helpers — deterministic point-in-cone tests for continuous tower beams.

/** True when a circular target intersects the tapered beam cone. */
export function isInBeamCone(
  srcX: number,
  srcY: number,
  facing: number,
  range: number,
  startWidth: number,
  endWidth: number,
  tx: number,
  ty: number,
  targetRadius: number,
): boolean {
  const dx = tx - srcX;
  const dy = ty - srcY;
  const dirX = Math.cos(facing);
  const dirY = Math.sin(facing);
  const along = dx * dirX + dy * dirY;
  if (along < -targetRadius || along > range + targetRadius) return false;
  const perpX = -dirY;
  const perpY = dirX;
  const perpDist = Math.abs(dx * perpX + dy * perpY);
  const t = range <= 0 ? 0 : Math.max(0, Math.min(1, along / range));
  const halfWidth = (startWidth * (1 - t) + endWidth * t) * 0.5 + targetRadius;
  return perpDist <= halfWidth;
}

/** Shortest signed angle delta in [-PI, PI]. */
export function angleDelta(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Rotate `from` toward `to` by at most `maxStep` radians. */
export function rotateToward(from: number, to: number, maxStep: number): number {
  const d = angleDelta(from, to);
  if (Math.abs(d) <= maxStep) return to;
  return from + Math.sign(d) * maxStep;
}
