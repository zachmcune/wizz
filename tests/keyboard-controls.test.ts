import { describe, expect, it, vi } from 'vitest';
import { KEYBOARD_PAN_SPEED } from '../src/core/constants';
import { KeyboardControls } from '../src/input/keyboard-controls';

type KeyboardListener = (e: KeyboardEvent) => void;

class FakeKeyboardTarget {
  private listeners = new Map<string, Set<KeyboardListener>>();

  addEventListener(type: 'keydown' | 'keyup', listener: KeyboardListener): void {
    const listeners = this.listeners.get(type) ?? new Set<KeyboardListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: 'keydown' | 'keyup', listener: KeyboardListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: 'keydown' | 'keyup', key: string, target: Partial<HTMLElement> | null = null): { prevented: boolean } {
    const event = {
      key,
      target,
      prevented: false,
      preventDefault() {
        this.prevented = true;
      },
    };
    for (const listener of this.listeners.get(type) ?? []) listener(event as unknown as KeyboardEvent);
    return event;
  }
}

describe('KeyboardControls', () => {
  it('pans with held WASD and arrow keys', () => {
    const target = new FakeKeyboardTarget();
    const keyboard = new KeyboardControls({ clearSelection: vi.fn() }, target);
    const camera = { panByScreen: vi.fn() };

    keyboard.attach();
    target.dispatch('keydown', 'd');
    target.dispatch('keydown', 'ArrowUp');
    keyboard.updateCamera(camera, 1000);

    expect(camera.panByScreen).toHaveBeenCalledWith(-KEYBOARD_PAN_SPEED, KEYBOARD_PAN_SPEED);
  });

  it('stops panning after keyup', () => {
    const target = new FakeKeyboardTarget();
    const keyboard = new KeyboardControls({ clearSelection: vi.fn() }, target);
    const camera = { panByScreen: vi.fn() };

    keyboard.attach();
    target.dispatch('keydown', 'a');
    target.dispatch('keyup', 'a');
    keyboard.updateCamera(camera, 1000);

    expect(camera.panByScreen).not.toHaveBeenCalled();
  });

  it('clears selection with Escape', () => {
    const target = new FakeKeyboardTarget();
    const clearSelection = vi.fn();
    const keyboard = new KeyboardControls({ clearSelection }, target);

    keyboard.attach();
    const event = target.dispatch('keydown', 'Escape');

    expect(clearSelection).toHaveBeenCalledTimes(1);
    expect(event.prevented).toBe(true);
  });

  it('does not intercept typing in editable controls', () => {
    const target = new FakeKeyboardTarget();
    const keyboard = new KeyboardControls({ clearSelection: vi.fn() }, target);
    const camera = { panByScreen: vi.fn() };

    keyboard.attach();
    const event = target.dispatch('keydown', 'd', { tagName: 'INPUT' });
    keyboard.updateCamera(camera, 1000);

    expect(event.prevented).toBe(false);
    expect(camera.panByScreen).not.toHaveBeenCalled();
  });
});
