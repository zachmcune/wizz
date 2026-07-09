// Data-driven spell/ability behavior dispatch. New effect kinds register a handler here.
import type { StepContext } from '../context';
import type { GameState, Command } from '../types';
import type { SpellDef } from '../../data/defs';

export interface SpellBehaviorContext {
  state: GameState;
  ctx: StepContext;
  cmd: Extract<Command, { type: 'castSpell' }>;
  spell: SpellDef;
}

export type SpellBehaviorHandler = (bc: SpellBehaviorContext) => void;

const spellHandlers = new Map<string, SpellBehaviorHandler>();

export function registerSpellBehavior(effectKind: string, handler: SpellBehaviorHandler): void {
  spellHandlers.set(effectKind, handler);
}

export function castSpellBehavior(bc: SpellBehaviorContext): void {
  const handler = spellHandlers.get(bc.spell.effect.kind);
  if (!handler) {
    console.warn(`[behaviors] no handler for spell effect kind "${bc.spell.effect.kind}"`);
    return;
  }
  handler(bc);
}
