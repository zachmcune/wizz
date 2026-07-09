// Presentation-layer read API — single import surface for render/UI/input.
// Sim internals (queries, fog, power, picking, placement) must not be imported directly
// from presentation modules; use this facade instead.
export {
  isWorldPointVisible,
  isVisibleTo,
  isTileFogged,
  listBuildingGhosts,
  isBuildingInLiveSight,
  radarActive,
  isMinimapTileFogged,
  isVisibleOnMinimap,
  isNodeIntelVisible,
  shouldRevealAllForViewer,
} from './fog';
export { isPowerShort, powerDeficit, buildingHasPower, buildingPowerUse } from './power';
export { getPlayer, isAlive, hasBuff, entitiesSorted, isEnemy } from './queries';
export { isHarvester, isCombatUnit, isUnit, isBuilding, isProjectile, isResourceNode } from './entity-types';
export { pickEntity, pickResourceNode } from './picking';
export { canBuildNearBase } from './build-zone';
export { footprintOverlapsNode } from './resource-nodes';
export { canUnitGarrison, garrisonFreeCapacity } from './garrison';
