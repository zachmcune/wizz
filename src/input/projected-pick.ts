// Screen-space picking for oblique view. World-space circles misalign with projected sprites.
import { worldToScreen } from '../core/coords';
import type { CameraView, Vec2 } from '../core/coords';
import { getProjectionMode } from '../core/projection';
import type { NavGrid } from '../sim/nav-grid';
import { pickEntity, pickResourceNode } from '../sim/picking';
import type { GameState, Entity, EntityId, PlayerId } from '../sim/types';
import { isVisibleTo } from '../sim/views';

export function useScreenPicking(): boolean {
  return getProjectionMode() === 'oblique';
}

function screenPickRadius(e: Entity, cam: CameraView): number {
  const base =
    e.kind === 'unit' ? 32 : e.kind === 'building' ? 36 : e.kind === 'resource_node' ? 38 : 28;
  return base * cam.zoom;
}

export function pickResourceNodeScreen(
  state: GameState,
  viewerId: PlayerId,
  screen: Vec2,
  cam: CameraView,
  nav: NavGrid | null,
): Entity | null {
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const e of state.entities.values()) {
    if (e.kind !== 'resource_node' || (e.amount ?? 0) <= 0) continue;
    if (nav && !isVisibleTo(state, viewerId, e, nav)) continue;
    const s = worldToScreen(e.pos, cam);
    const dx = screen.x - s.x;
    const dy = screen.y - s.y;
    const r = screenPickRadius(e, cam);
    const d2 = dx * dx + dy * dy;
    if (d2 <= r * r && d2 < bestD) {
      bestD = d2;
      best = e;
    }
  }
  return best;
}

export function pickEntityScreen(
  state: GameState,
  viewerId: PlayerId,
  screen: Vec2,
  cam: CameraView,
  nav: NavGrid | null,
): Entity | null {
  let best: Entity | null = null;
  let bestScore = -Infinity;
  for (const e of state.entities.values()) {
    if (e.kind === 'projectile') continue;
    if (nav && !isVisibleTo(state, viewerId, e, nav)) continue;
    const s = worldToScreen(e.pos, cam);
    const dx = screen.x - s.x;
    const dy = screen.y - s.y;
    const r = screenPickRadius(e, cam);
    if (dx * dx + dy * dy <= r * r) {
      const score = (e.kind === 'unit' ? 100 : e.kind === 'building' ? 50 : 10) - (dx * dx + dy * dy) / 1000;
      if (score > bestScore) {
        bestScore = score;
        best = e;
      }
    }
  }
  return best;
}

export function pickResourceNodeForInput(
  state: GameState,
  viewerId: PlayerId,
  world: Vec2,
  screen: Vec2,
  cam: CameraView,
  nav: NavGrid | null,
): Entity | null {
  if (useScreenPicking()) return pickResourceNodeScreen(state, viewerId, screen, cam, nav);
  return pickResourceNode(state, viewerId, world.x, world.y, nav);
}

export function pickEntityForInput(
  state: GameState,
  viewerId: PlayerId,
  world: Vec2,
  screen: Vec2,
  cam: CameraView,
  nav: NavGrid | null,
): Entity | null {
  if (useScreenPicking()) return pickEntityScreen(state, viewerId, screen, cam, nav);
  return pickEntity(state, viewerId, world.x, world.y, nav);
}

/** Units whose projected screen position falls inside a screen-space drag rectangle. */
export function unitsInScreenBox(
  state: GameState,
  ownerId: PlayerId,
  a: Vec2,
  b: Vec2,
  cam: CameraView,
): EntityId[] {
  const minSX = Math.min(a.x, b.x);
  const maxSX = Math.max(a.x, b.x);
  const minSY = Math.min(a.y, b.y);
  const maxSY = Math.max(a.y, b.y);
  const units: EntityId[] = [];
  for (const e of state.entities.values()) {
    if (e.owner !== ownerId || e.kind !== 'unit') continue;
    const s = worldToScreen(e.pos, cam);
    if (s.x >= minSX && s.x <= maxSX && s.y >= minSY && s.y <= maxSY) units.push(e.id);
  }
  return units;
}
