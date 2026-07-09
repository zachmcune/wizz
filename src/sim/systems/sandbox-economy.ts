// Sandbox-only economy cheats: top-up mana/power each tick when toggles are on.
import type { StepContext } from '../context';
import type { GameState } from '../types';
import { isSandbox, sandboxInfiniteMana, sandboxInfinitePower } from '../sandbox-flags';

export const SANDBOX_INFINITE_MANA = 999_999;
const SANDBOX_INFINITE_POWER = 99_999;

export function applySandboxEconomyCheats(state: GameState, ctx: StepContext): void {
  if (!isSandbox(state)) return;

  if (sandboxInfinitePower(state)) {
    for (const p of state.players) {
      if (p.defeated) continue;
      const needed = Math.max(p.powerUsed, SANDBOX_INFINITE_POWER);
      if (p.power !== needed) p.power = needed;
    }
  }

  if (sandboxInfiniteMana(state)) {
    for (const p of state.players) {
      if (p.defeated) continue;
      if (p.mana !== SANDBOX_INFINITE_MANA) {
        p.mana = SANDBOX_INFINITE_MANA;
        ctx.events.push({ type: 'manaChanged', playerId: p.id, mana: p.mana });
      }
    }
  }
}
