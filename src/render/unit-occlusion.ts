/** Screen-space bounds used to detect when a unit is hidden behind a building. */
export interface OcclusionBounds {
  x: number;
  y: number;
  radius: number;
  depth: number;
}

export function circlesOverlap(
  ax: number,
  ay: number,
  ar: number,
  bx: number,
  by: number,
  br: number,
): boolean {
  const dx = ax - bx;
  const dy = ay - by;
  const reach = ar + br;
  return dx * dx + dy * dy < reach * reach;
}

/** True when a building with greater depth overlaps the unit on screen. */
export function isUnitOccludedByBuilding(unit: OcclusionBounds, buildings: OcclusionBounds[]): boolean {
  for (const building of buildings) {
    if (building.depth <= unit.depth) continue;
    if (circlesOverlap(unit.x, unit.y, unit.radius, building.x, building.y, building.radius)) return true;
  }
  return false;
}

export function parseOwnerColor(hex: string): number {
  return Number.parseInt(hex.replace('#', ''), 16);
}
