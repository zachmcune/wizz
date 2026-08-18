// Open arcs as moveTo/lineTo polylines.
//
// PixiJS v8 `Graphics.arc()` tessellates a connector through the Graphics origin
// (world 0,0 — the top-left of the map) on WebGL and WebGPU. Safari on iPhone
// does not show the spike; Chromium desktop/Android and other WebGL backends do.
// Full `circle()` primitives are fine; only partial arcs need this path.

export function openArcSweep(start: number, end: number, counterclockwise = false): number {
  let sweep = end - start;
  if (!counterclockwise && sweep <= 0) sweep += Math.PI * 2;
  if (counterclockwise && sweep >= 0) sweep -= Math.PI * 2;
  return sweep;
}

/** Flat `[x, y, …]` polyline for an open canvas-style arc. */
export function openArcPoints(
  cx: number,
  cy: number,
  radius: number,
  start: number,
  end: number,
  counterclockwise = false,
): number[] {
  if (radius <= 0) return [];
  const sweep = openArcSweep(start, end, counterclockwise);
  const steps = Math.max(8, Math.ceil((Math.abs(sweep) * Math.max(radius, 8)) / 6));
  const pts: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = start + (sweep * i) / steps;
    pts.push(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
  }
  return pts;
}

export interface OpenArcPath {
  moveTo(x: number, y: number): unknown;
  lineTo(x: number, y: number): unknown;
}

/** Append an open arc without using `Graphics.arc()`. */
export function appendOpenArc(
  g: OpenArcPath,
  cx: number,
  cy: number,
  radius: number,
  start: number,
  end: number,
  counterclockwise = false,
): void {
  const pts = openArcPoints(cx, cy, radius, start, end, counterclockwise);
  if (pts.length < 4) return;
  g.moveTo(pts[0]!, pts[1]!);
  for (let i = 2; i < pts.length; i += 2) {
    g.lineTo(pts[i]!, pts[i + 1]!);
  }
}
