import { describe, expect, it } from 'vitest';
import { CONTROL_BINDINGS } from '../src/input/actions';

describe('input control parity', () => {
  it('declares a desktop binding for every player-facing control', () => {
    for (const [action, binding] of Object.entries(CONTROL_BINDINGS)) {
      expect(binding.mouse || binding.keyboard, `${action} must have a mouse or keyboard binding`).toBe(true);
    }
  });
});
