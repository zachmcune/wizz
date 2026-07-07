import { TILE } from '../../core/constants';
import { screenToWorld } from '../../core/coords';
import type { Vec2 } from '../../core/coords';
import type { Registry } from '../../data/registry';
import type { Camera } from '../../render/camera';
import type { RenderOverlay } from '../../render/renderer';
import type { SimServices } from '../../sim/context';
import { buildZoneCircles } from '../../sim/build-zone';
import type { GameState, PlayerId } from '../../sim/types';
import type { SessionState } from '../../input/session';

export function buildMatchOverlay(
  state: GameState,
  services: SimServices,
  registry: Registry,
  humanId: PlayerId,
  session: SessionState,
  camera: Camera,
  lastPointer: Vec2,
): RenderOverlay {
  let ghost: { x: number; y: number; size: number; valid: boolean } | undefined;
  let wallGhosts: { x: number; y: number; size: number; valid: boolean }[] | undefined;
  if (session.mode === 'build' && session.buildDefId) {
    const def = registry.buildings.get(session.buildDefId);
    if (def) {
      const size = def.footprint * TILE;
      if (session.wallDragTiles?.length) {
        wallGhosts = session.wallDragTiles.map((t) => ({ x: t.x, y: t.y, size, valid: t.valid }));
      } else if (session.buildGhost) {
        ghost = { x: session.buildGhost.x, y: session.buildGhost.y, size, valid: session.buildGhost.valid };
      }
    }
  } else if (session.mode === 'deploy' && session.buildGhost) {
    const def = registry.buildings.get('waystone_camp');
    if (def) ghost = { x: session.buildGhost.x, y: session.buildGhost.y, size: def.footprint * TILE, valid: session.buildGhost.valid };
  }
  let spell: { x: number; y: number; radius: number } | undefined;
  if (session.mode === 'spell' && session.spellId) {
    const def = registry.spells.get(session.spellId);
    if (def && def.aoeRadius > 0) {
      const w = screenToWorld(lastPointer, camera.view());
      spell = { x: w.x, y: w.y, radius: def.aoeRadius };
    }
  }
  const confirm = session.pendingConfirm ? { x: session.pendingConfirm.x, y: session.pendingConfirm.y } : null;
  let rallyMarker: { fromX: number; fromY: number; toX: number; toY: number } | undefined;
  if (session.mode === 'rally' && session.rallyBuildingId && session.rallyCursor) {
    const b = state.entities.get(session.rallyBuildingId);
    if (b) rallyMarker = { fromX: b.pos.x, fromY: b.pos.y, toX: session.rallyCursor.x, toY: session.rallyCursor.y };
  } else if (session.selection.size === 1) {
    const id = [...session.selection][0]!;
    const b = state.entities.get(id);
    if (b?.kind === 'building' && b.rally) {
      rallyMarker = { fromX: b.pos.x, fromY: b.pos.y, toX: b.rally.x, toY: b.rally.y };
    }
  }
  const buildZones = session.mode === 'build' ? buildZoneCircles(state, services, humanId) : undefined;
  return { ghost, wallGhosts, spell, confirm, buildZones, rallyMarker };
}
