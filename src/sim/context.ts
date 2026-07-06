// Runtime services passed to systems. NOT serialized (all derived from GameState + data).
import type { Registry } from '../data/registry';
import type { NavGrid } from './nav-grid';
import { FlowFieldCache } from './flow-field';
import { SpatialHash } from './spatial-hash';
import type { GameEvent } from './types';

export interface SimServices {
  registry: Registry;
  nav: NavGrid;
  flow: FlowFieldCache;
  spatial: SpatialHash;
}

export function createServices(registry: Registry, nav: NavGrid): SimServices {
  return { registry, nav, flow: new FlowFieldCache(), spatial: new SpatialHash() };
}

/** Per-tick step context: services plus the event buffer systems push into. */
export interface StepContext {
  services: SimServices;
  events: GameEvent[];
}
