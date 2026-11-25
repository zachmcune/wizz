// Shared numeric assertions for the conformance suite.
//
// Every test in this folder names the FEATURE_INVENTORY row it proves, so the inventory and the
// tests cannot drift apart: if a rule is deleted from the code, its named test fails.

import type { TestMatch } from './test-match';
import { applyDamage } from '../../src/sim/combat-util';
import type { StepContext } from '../../src/sim/context';

/** The single context used by direct-damage helper calls. */
export function ctxFor(m: TestMatch): StepContext {
  return { services: m.services, events: [] };
}

/**
 * Apply damage to a unit and return the HP actually removed. Uses the real damage pipeline, so
 * armour multipliers and Aegis are exercised rather than assumed.
 */
export function damageUnit(m: TestMatch, slot: number, amount: number, vs: Record<'light' | 'heavy' | 'building', number>): number {
  const before = m.state.entities.hp[slot]!;
  applyDamage(m.state, ctxFor(m), slot, amount, vs);
  return before - m.state.entities.hp[slot]!;
}

export const NEUTRAL_VS = { light: 1, heavy: 1, building: 1 };

/** Run the sim until a predicate holds or the tick budget expires. Returns the tick it held. */
export function runUntil(
  m: TestMatch,
  pred: () => boolean,
  maxTicks: number,
  schedule?: Parameters<TestMatch['run']>[1],
): number {
  for (let i = 0; i < maxTicks; i++) {
    if (pred()) return m.state.tick;
    m.run(1, schedule);
    if (m.state.ended) break;
  }
  return pred() ? m.state.tick : -1;
}
