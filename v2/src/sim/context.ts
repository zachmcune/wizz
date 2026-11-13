// Sim services and per-tick context.
//
// Services are derived state (nav grid, flow cache, spatial grid) that is never serialised: it can
// always be rebuilt from GameState + content. Keeping it out of the save format is what lets the
// save be a pure JSON snapshot of gameplay state.

import type { Registry } from '../data/registry';
import { FlowFieldCache } from './flow-field';
import { NavGrid } from './nav-grid';
import { SpatialGrid } from './spatial-grid';
import type { GameEvent, GameState } from './types';
import { TILE } from '../core/constants';

export interface SimServices {
  registry: Registry;
  nav: NavGrid;
  flow: FlowFieldCache;
  spatial: SpatialGrid;
}

export function createServices(registry: Registry, mapId: string): SimServices {
  const map = registry.map(mapId);
  const nav = new NavGrid(map);
  return {
    registry,
    nav,
    flow: new FlowFieldCache(),
    spatial: new SpatialGrid(map.tileW * TILE, map.tileH * TILE),
  };
}

/** Per-tick step context: services plus the event buffer systems push into. */
export interface StepContext {
  services: SimServices;
  events: GameEvent[];
}

export function newStepContext(services: SimServices): StepContext {
  return { services, events: [] };
}

/** Convenience: look up a player, throwing on a bad id (a wiring bug, not a gameplay state). */
export function requirePlayer(state: GameState, id: string) {
  const p = state.players.find((pl) => pl.id === id);
  if (!p) throw new Error(`Unknown player: ${id}`);
  return p;
}
