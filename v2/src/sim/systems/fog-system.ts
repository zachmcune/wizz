// Thin adapter so the step list reads as a system name while the implementation lives in fog.ts.

import type { StepContext } from '../context';
import type { GameState } from '../types';
import { visibilitySystem as updateFog } from '../fog';

export function visibilitySystem(state: GameState, ctx: StepContext): void {
  updateFog(state, ctx.services.registry, ctx.services.nav);
}
