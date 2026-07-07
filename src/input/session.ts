// View-only session state (selection, current mode, placement/targeting). NOT part of the sim.
import type { EntityId } from '../sim/types';

export type InputMode = 'normal' | 'attackMove' | 'build' | 'deploy' | 'spell';

export interface SessionState {
  selection: Set<EntityId>;
  mode: InputMode;
  buildDefId: string | null;
  buildGhost: { x: number; y: number; valid: boolean; issue?: 'blocked' | 'range' } | null;
  deployEntityId: EntityId | null;
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
    deployEntityId: null,
    spellId: null,
    pendingConfirm: null,
    boxRect: null,
  };
}
