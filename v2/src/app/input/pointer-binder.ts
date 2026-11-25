// POINTER BINDER — DOM pointer/wheel/keyboard events to the gesture recogniser and board input.
//
// This is the layer v1 called `PointerBinder`, and the split is the same: the gesture recogniser is
// pure and knows nothing about the DOM, and this file owns the browser-specific concerns.
//
// THREE THINGS HERE ARE NOT OBVIOUS, and all three were real bugs somewhere in this project's history:
//
//   1. POINTER CAPTURE ON THE CANVAS. Without `setPointerCapture`, dragging off the canvas (onto the
//      HUD, or past the window edge) drops the move events and the camera stops mid-pan. Captured
//      events keep arriving at the canvas regardless of what is under the finger.
//
//   2. `touch-action: none` IS LOAD-BEARING. Without it the browser claims the horizontal drag for
//      its own back-navigation gesture and the camera never moves. It is set in the CSS, and the
//      reason is recorded here because removing it looks harmless.
//
//   3. A TAP IS RESOLVED BY THE GESTURE, NOT BY `click`. `click` fires after the browser's own tap
//      delay and cannot carry multi-touch, so every board tap comes from `pointerup` routed through
//      the recogniser. HUD buttons keep using `click` — they are real buttons and should behave like
//      buttons, including for keyboard and screen readers.
//
// Desktop is not a second input path: a mouse is a pointer with one button, so the same recogniser
// handles click-to-select, drag-to-box and wheel-to-zoom. Keyboard panning runs alongside.

import { normaliseBox } from './picking';
import type { GestureRecognizer } from './gesture';
import type { BoardInput } from './board-input';
import type { Vec2 } from '../../core/math';

/** HUD chrome that must not be treated as a board tap. */
export const HUD_CHROME_SELECTOR = '.hud, .screen, .hud-toast';

export interface PointerBinderDeps {
  canvas: HTMLCanvasElement;
  gesture: GestureRecognizer;
  input: BoardInput;
  /** True while the match is paused or ended: gestures are ignored. */
  isInert: () => boolean;
  /** Called after a gesture ends so the HUD can refresh. */
  onGestureEnd?: () => void;
}

export class PointerBinder {
  private deps: PointerBinderDeps;
  private boxStart: Vec2 | null = null;
  private detachers: (() => void)[] = [];

  constructor(deps: PointerBinderDeps) {
    this.deps = deps;
  }

  attach(): void {
    const c = this.deps.canvas;

    const onDown = (e: PointerEvent): void => {
      if (this.deps.isInert()) return;
      if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
      // The board is the game: never let the browser start a text selection or a native drag.
      e.preventDefault();
      const p = this.rel(e);
      try {
        c.setPointerCapture(e.pointerId);
      } catch {
        /* capture is best-effort; a synthetic event has no real pointer to capture */
      }
      this.deps.input.notePointer({ x: e.clientX, y: e.clientY });
      // A middle mouse button is a pan, never a tap: v1's convention, and it survives here.
      if (e.pointerType === 'mouse' && e.button === 1) {
        this.deps.gesture.cancel();
        return;
      }
      this.deps.gesture.pointerDown(e.pointerId, p.x, p.y, performance.now());
    };

    const onMove = (e: PointerEvent): void => {
      if (this.deps.isInert()) return;
      const p = this.rel(e);
      this.deps.input.notePointer({ x: e.clientX, y: e.clientY });
      this.deps.gesture.pointerMove(e.pointerId, p.x, p.y, performance.now());
    };

    const onUp = (e: PointerEvent): void => {
      if (this.deps.isInert()) {
        this.deps.gesture.cancel();
        this.boxStart = null;
        this.deps.input.showBox(null);
        return;
      }
      const p = this.rel(e);
      try {
        c.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      this.deps.gesture.pointerUp(e.pointerId, p.x, p.y, performance.now());
      if (this.deps.gesture.state === 'idle') {
        this.boxStart = null;
        this.deps.input.showBox(null);
      }
      this.deps.onGestureEnd?.();
    };

    const onCancel = (e: PointerEvent): void => {
      try {
        c.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      this.deps.gesture.cancel();
      this.boxStart = null;
      this.deps.input.showBox(null);
    };

    const onWheel = (e: WheelEvent): void => {
      if (this.deps.isInert()) return;
      e.preventDefault();
      // Wheel zooms about the pointer, which is what every RTS and every map app does. Panning by
      // wheel was v1's choice and it reads as broken on a trackpad, where two fingers scroll.
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      this.deps.input.pinch(factor, { x: e.clientX, y: e.clientY });
    };

    const onContextMenu = (e: Event): void => {
      // Right-click is a cancel, not a browser menu.
      e.preventDefault();
      if (this.deps.isInert()) return;
      if (this.deps.input.armed) this.deps.input.disarm();
      else if (this.deps.input.ghost) this.deps.input.cancelPlacement();
    };

    // The gesture handlers themselves are wired by the caller (App), so this file stays about events.
    c.addEventListener('pointerdown', onDown);
    c.addEventListener('pointermove', onMove);
    c.addEventListener('pointerup', onUp);
    c.addEventListener('pointercancel', onCancel);
    c.addEventListener('wheel', onWheel, { passive: false });
    c.addEventListener('contextmenu', onContextMenu);

    this.detachers.push(
      () => c.removeEventListener('pointerdown', onDown),
      () => c.removeEventListener('pointermove', onMove),
      () => c.removeEventListener('pointerup', onUp),
      () => c.removeEventListener('pointercancel', onCancel),
      () => c.removeEventListener('wheel', onWheel),
      () => c.removeEventListener('contextmenu', onContextMenu),
    );
  }

  /** Track the drag box while a box select is in progress. Called from the gesture handler. */
  beginBox(p: Vec2): void {
    this.boxStart = { ...p };
  }

  moveBox(p: Vec2): void {
    if (!this.boxStart) return;
    this.deps.input.showBox(normaliseBox(this.boxStart, p));
  }

  endBox(): void {
    this.boxStart = null;
    this.deps.input.showBox(null);
  }

  detach(): void {
    for (const d of this.detachers) d();
    this.detachers = [];
  }

  private rel(e: { clientX: number; clientY: number }): Vec2 {
    const r = this.deps.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
}
