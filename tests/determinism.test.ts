import { describe, it, expect } from 'vitest';
import { getRegistry } from './helpers';
import { runHeadless } from '../src/sim/headless';
import { hashState } from '../src/sim/hash';
import type { MatchConfig, Command } from '../src/sim/types';

const reg = getRegistry();

function cfg(): MatchConfig {
  return reg.match('skirmish_1v1');
}

describe('determinism', () => {
  it('data loads and validates', () => {
    expect(reg.units.size).toBeGreaterThanOrEqual(7);
    expect(reg.buildings.size).toBeGreaterThanOrEqual(7);
    expect(reg.spells.size).toBeGreaterThanOrEqual(3);
    expect(reg.maps.has('duel_glade')).toBe(true);
  });

  it('runs 100 ticks and hash is stable across two runs', () => {
    const a = runHeadless(reg, cfg(), 100);
    const b = runHeadless(reg, cfg(), 100);
    expect(hashState(a)).toBe(hashState(b));
  });

  it('AI-driven long match is deterministic', () => {
    const a = runHeadless(reg, cfg(), 1200);
    const b = runHeadless(reg, cfg(), 1200);
    expect(hashState(a)).toBe(hashState(b));
  });

  it('replaying identical scripted commands reproduces identical state', () => {
    const scripted: Record<number, Command[]> = {
      5: [{ type: 'build', playerId: 'player0', defId: 'attunement_spire', x: 300, y: 300 }],
      40: [{ type: 'move', playerId: 'player0', entityIds: [2, 3], x: 500, y: 500 }],
    };
    const a = runHeadless(reg, cfg(), 300, { scriptedCommands: scripted });
    const b = runHeadless(reg, cfg(), 300, { scriptedCommands: scripted });
    expect(hashState(a)).toBe(hashState(b));
  });
});
