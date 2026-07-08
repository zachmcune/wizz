// View-only session state (selection, current mode, placement/targeting). NOT part of the sim.
import type { EntityId } from '../sim/types';

export type InputMode =
  | 'normal'
  | 'attackMove'
  | 'moveInOrder'
  | 'build'
  | 'deploy'
  | 'spell'
  | 'rally'
  | 'garrison'
  | 'superweapon';

export interface SessionState {
  selection: Set<EntityId>;
  mode: InputMode;
  buildDefId: string | null;
  buildGhost: { x: number; y: number; valid: boolean; issue?: 'blocked' | 'range' | 'node' } | null;
  /** Preview tiles while drag-placing walls. */
  wallDragTiles: { x: number; y: number; valid: boolean }[] | null;
  wallDragStart: { tx: number; ty: number } | null;
  deployEntityId: EntityId | null;
  rallyBuildingId: EntityId | null;
  rallyCursor: { x: number; y: number } | null;
  garrisonUnitIds: EntityId[];
  spellId: string | null;
  pendingConfirm: { spellId: string; x: number; y: number } | null;
  boxRect: { a: { x: number; y: number }; b: { x: number; y: number } } | null;
}

export function createSession(): SessionState {
  return {
    selection: new Set(),
    mode: 'normal',
    buildDefId: null,
    buildGhost: null,
    wallDragTiles: null,
    wallDragStart: null,
    deployEntityId: null,
    rallyBuildingId: null,
    rallyCursor: null,
    garrisonUnitIds: [],
    spellId: null,
    pendingConfirm: null,
    boxRect: null,
  };
}
