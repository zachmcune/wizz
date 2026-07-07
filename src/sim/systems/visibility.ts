// Updates per-player explored/visible tile masks from unit and building sight.
import type { StepContext } from '../context';
import type { GameState } from '../types';
import { visibilitySystem as updateFog } from '../fog';

export function visibilitySystem(state: GameState, ctx: StepContext): void {
  updateFog(state, ctx.services.registry, ctx.services.nav);
}
