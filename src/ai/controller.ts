// Deterministic layered AI. One decision pass per AI player, throttled by tick.
// It ONLY emits Commands (same as a human) - never mutates sim state directly.
import type { SimServices } from '../sim/context';
import type { GameState, Command } from '../sim/types';
import { strategyForPlayer } from './strategies/registry';

export function aiStep(state: GameState, services: SimServices): Command[] {
  return runAiPlayers(state, services, { skipCombat: false });
}

/** Economy/build/produce only — used by sandbox Force expand. */
export function aiEconomyStep(state: GameState, services: SimServices): Command[] {
  return runAiPlayers(state, services, { skipCombat: true });
}

function runAiPlayers(
  state: GameState,
  services: SimServices,
  opts: { skipCombat: boolean },
): Command[] {
  const cmds: Command[] = [];
  let idx = 0;
  for (const p of state.players) {
    const playerIndex = idx++;
    if (p.controller !== 'ai' || p.defeated) continue;
    const diff = services.registry.balance.ai[p.aiDifficulty ?? 'normal'];
    if ((state.tick + playerIndex) % diff.interval !== 0) continue;
    const strategy = strategyForPlayer(p);
    strategy.decide({
      state,
      services,
      player: p,
      difficulty: diff,
      cmds,
      skipCombat: opts.skipCombat,
    });
  }
  return cmds;
}
