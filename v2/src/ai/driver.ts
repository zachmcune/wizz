// AI DRIVER — owns one `AiBrain` per AI player and adapts it to the sim's `AiHook`.
//
// The sim calls `AiHook(state, services)` once per tick and applies the returned commands next tick. That
// signature hands the AI the whole `GameState`, which is exactly the maphack surface Phase 5 exists to close.
// So the hook here is the ONLY place that touches the raw state, and all it does is hand it to
// `AiBrain.tick`, which immediately reduces it to a `Perception` and never looks at the state again.
//
// `tests/phase5-maphack.test.ts` proves the closure holds: it replaces every entity the AI should not be able
// to see with a throwing proxy and runs a full match. If any AI code reads hidden state, the match throws.

import type { Command, GameState } from '../sim/types';
import type { SimServices } from '../sim/context';
import { AiBrain } from './brain';
import type { Difficulty } from './difficulty';

export interface AiDriverOptions {
  /** Per-player difficulty overrides. Falls back to the player's own `aiDifficulty`. */
  difficulties?: Record<string, Difficulty>;
  /** Called after each brain decision, for the tournament harness and the debug overlay. */
  onDecision?: (playerId: string, tick: number, notes: string[], commandCount: number) => void;
}

export class AiDriver {
  private readonly brains = new Map<string, AiBrain>();
  /** Cumulative command count per player, so a test can prove the AI actually did something. */
  private readonly commandCounts = new Map<string, number>();
  private readonly notesByPlayer = new Map<string, string[]>();

  constructor(
    private readonly registry: SimServices['registry'],
    private readonly services: SimServices,
    options: AiDriverOptions = {},
  ) {
    this.options = options;
  }

  private readonly options: AiDriverOptions;

  /** Create (or fetch) the brain for a player. */
  brainFor(playerId: string, difficulty: string | undefined): AiBrain {
    let brain = this.brains.get(playerId);
    if (!brain) {
      const forced = this.options.difficulties?.[playerId];
      brain = new AiBrain(playerId, forced ?? difficulty, this.registry, this.services);
      this.brains.set(playerId, brain);
    }
    return brain;
  }

  /** The sim hook. Reduces state to a perception per AI player and returns their commands. */
  readonly hook = (state: GameState, services: SimServices): Command[] => {
    void services;
    const out: Command[] = [];
    for (const p of state.players) {
      if (p.controller !== 'ai' || p.defeated) continue;
      const brain = this.brainFor(p.id, p.aiDifficulty);
      const res = brain.tick(state);
      if (res.commands.length > 0) {
        out.push(...res.commands);
        this.commandCounts.set(p.id, (this.commandCounts.get(p.id) ?? 0) + res.commands.length);
      }
      if (res.notes.length > 0) {
        const prev = this.notesByPlayer.get(p.id) ?? [];
        // Keep a bounded history so a long match cannot grow memory without bound.
        const next = prev.concat(res.notes);
        this.notesByPlayer.set(p.id, next.length > 400 ? next.slice(-400) : next);
      }
      this.options.onDecision?.(p.id, state.tick, res.notes, res.commands.length);
    }
    return out;
  };

  commandCount(playerId: string): number {
    return this.commandCounts.get(playerId) ?? 0;
  }

  notes(playerId: string): readonly string[] {
    return this.notesByPlayer.get(playerId) ?? [];
  }

  /** Did this player's brain ever decide to attack? Used by the "no idle armies" assertion. */
  everAttacked(playerId: string): boolean {
    return (this.notesByPlayer.get(playerId) ?? []).some((n) => n.startsWith('wave of'));
  }

  /** Did this player ever build anything? Used by the "no dead economy" assertion. */
  everBuilt(playerId: string): boolean {
    return (this.notesByPlayer.get(playerId) ?? []).some((n) => n.startsWith('building '));
  }

  brain(playerId: string): AiBrain | undefined {
    return this.brains.get(playerId);
  }

  /** Total commands issued across all AI players, for the activity assertions. */
  totalCommands(): number {
    let n = 0;
    for (const v of this.commandCounts.values()) n += v;
    return n;
  }
}
