import { KEYBOARD_PAN_SPEED } from '../core/constants';
import type { Camera } from '../render/camera';
import { CONTROL_ACTIONS, type ControlAction } from './actions';

interface KeyboardTarget {
  addEventListener(type: 'keydown' | 'keyup', listener: (e: KeyboardEvent) => void): void;
  removeEventListener(type: 'keydown' | 'keyup', listener: (e: KeyboardEvent) => void): void;
}

interface KeyboardController {
  clearSelection(): void;
  confirmPlacement(): void;
}

export const KEYBOARD_CONTROL_KEYS = {
  panLeft: { action: CONTROL_ACTIONS.panCamera, keys: ['ArrowLeft', 'a'] },
  panRight: { action: CONTROL_ACTIONS.panCamera, keys: ['ArrowRight', 'd'] },
  panUp: { action: CONTROL_ACTIONS.panCamera, keys: ['ArrowUp', 'w'] },
  panDown: { action: CONTROL_ACTIONS.panCamera, keys: ['ArrowDown', 's'] },
  deselect: { action: CONTROL_ACTIONS.deselect, keys: ['Escape'] },
  placeBuilding: { action: CONTROL_ACTIONS.placeBuilding, keys: ['Enter'] },
  deployUnit: { action: CONTROL_ACTIONS.deployUnit, keys: ['Enter'] },
} as const satisfies Record<string, { action: ControlAction; keys: readonly string[] }>;

const HANDLED_KEYS = new Set<string>(Object.values(KEYBOARD_CONTROL_KEYS).flatMap((binding) => binding.keys));

function normalizeKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key;
}

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as { tagName?: string; isContentEditable?: boolean } | null;
  const tag = el?.tagName?.toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable === true;
}

export class KeyboardControls {
  private readonly pressed = new Set<string>();
  private attached = false;

  constructor(
    private controller: KeyboardController,
    private target: KeyboardTarget = window,
  ) {}

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    this.target.addEventListener('keydown', this.onKeyDown);
    this.target.addEventListener('keyup', this.onKeyUp);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.pressed.clear();
  }

  updateCamera(camera: Pick<Camera, 'panByScreen'>, dtMs: number): void {
    if (dtMs <= 0 || this.pressed.size === 0) return;
    const amount = KEYBOARD_PAN_SPEED * (dtMs / 1000);
    let dx = 0;
    let dy = 0;

    if (this.isPressed(KEYBOARD_CONTROL_KEYS.panLeft.keys)) dx += amount;
    if (this.isPressed(KEYBOARD_CONTROL_KEYS.panRight.keys)) dx -= amount;
    if (this.isPressed(KEYBOARD_CONTROL_KEYS.panUp.keys)) dy += amount;
    if (this.isPressed(KEYBOARD_CONTROL_KEYS.panDown.keys)) dy -= amount;

    if (dx !== 0 || dy !== 0) camera.panByScreen(dx, dy);
  }

  private isPressed(keys: readonly string[]): boolean {
    return keys.some((key) => this.pressed.has(key));
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    const key = normalizeKey(e.key);
    if (!HANDLED_KEYS.has(key) || isEditableTarget(e.target)) return;

    e.preventDefault();
    if (key === 'Escape') {
      this.controller.clearSelection();
      return;
    }
    if (key === 'Enter') {
      this.controller.confirmPlacement();
      return;
    }
    this.pressed.add(key);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    const key = normalizeKey(e.key);
    this.pressed.delete(key);
  };
}
