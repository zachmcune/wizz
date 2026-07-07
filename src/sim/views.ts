// Presentation-layer read API — single import surface for render/UI.
// Keeps fog/power/query imports out of scattered presentation modules.
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
export { getPlayer } from './queries';
