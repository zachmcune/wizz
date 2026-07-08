// World-space hit testing for input. Uses authoritative sim positions (not display smoothing).
import type { NavGrid } from './nav-grid';
import type { GameState, Entity, PlayerId } from './types';
import { isVisibleTo } from './views';

function pickRadius(e: Entity): number {
  return e.radius + (e.kind === 'unit' ? 14 : e.kind === 'building' ? 8 : 6);
}

/** Pick a mana node at a world position (generous hit area for touch). */
export function pickResourceNode(
  state: GameState,
  viewerId: PlayerId,
  wx: number,
  wy: number,
  nav: NavGrid | null,
): Entity | null {
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const e of state.entities.values()) {
    if (e.kind !== 'resource_node' || (e.amount ?? 0) <= 0) continue;
    if (nav && !isVisibleTo(state, viewerId, e, nav)) continue;
    const dx = wx - e.pos.x;
    const dy = wy - e.pos.y;
    const r = pickRadius(e) + 8;
    const d2 = dx * dx + dy * dy;
    if (d2 <= r * r && d2 < bestD) {
      bestD = d2;
      best = e;
    }
  }
  return best;
}

/** Pick the topmost entity at a world position (units preferred over buildings). */
export function pickEntity(
  state: GameState,
  viewerId: PlayerId,
  wx: number,
  wy: number,
  nav: NavGrid | null,
): Entity | null {
  let best: Entity | null = null;
  let bestScore = -Infinity;
  for (const e of state.entities.values()) {
    if (e.kind === 'projectile') continue;
    if (e.kind === 'unit' && e.garrisonedIn !== undefined) continue;
    if (nav && !isVisibleTo(state, viewerId, e, nav)) continue;
    const dx = wx - e.pos.x;
    const dy = wy - e.pos.y;
    const r = pickRadius(e);
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
