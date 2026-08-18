import { describe, expect, it } from 'vitest';
import { CONTROL_BINDINGS } from '../src/input/actions';
import { KEYBOARD_CONTROL_KEYS } from '../src/input/keyboard-controls';

describe('input control parity', () => {
  it('declares a desktop binding for every player-facing control', () => {
    for (const [action, binding] of Object.entries(CONTROL_BINDINGS)) {
      expect(binding.mouse || binding.keyboard, `${action} must have a mouse or keyboard binding`).toBe(true);
    }
  });

  it('wires a keyboard shortcut for every control marked keyboard', () => {
    const keyed = new Set(Object.values(KEYBOARD_CONTROL_KEYS).map((binding) => binding.action));
    for (const [action, binding] of Object.entries(CONTROL_BINDINGS)) {
      if (!binding.keyboard) continue;
      expect(keyed.has(action), `${action} must have a KEYBOARD_CONTROL_KEYS entry`).toBe(true);
    }
  });
});
