// TOUCH GESTURE RECOGNISER — v1's interaction model, re-implemented for v2.
//
// v1's touch feel (Zachary's bar: "the touch controls should be basically the same as the first one")
// is a small, specific state machine, and this file is a deliberate re-derivation of it rather than a
// copy of v1's source. What it does, and why each piece exists:
//
//   • PENDING → TAP. A press and release within 250 ms and 18px is a tap. Taps are the whole of RTS
//     input: select, command, place, harvest.
//   • PENDING → PAN. Moving past 18px turns the press into a camera pan (drag mode `pan`).
//     Drag-to-pan is the default on touch, because a phone player's most common gesture by far is
//     "look somewhere else" and a select-drag that pans instead is infuriating.
//   • PENDING → BOX. In `select` drag mode the same movement draws a selection box instead, and a
//     400 ms LONG PRESS promotes a still press into a box select without moving — the v1 behaviour
//     that lets a thumb drag a box on a device where a drag would otherwise pan.
//   • TWO POINTERS → PINCH. A second pointer switches to pinch permanently until all pointers lift,
//     emitting both a zoom factor and a two-finger pan (so a pinch that also drifts still moves the
//     camera). Taps are suppressed for the whole multi-touch sequence: releasing the second finger
//     must never also fire "move army here".
//   • DOUBLE TAP. Two taps within 300 ms and reasonable proximity emit `onDoubleTap` (select all of
//     a type) instead of two singles.
//
// DELIBERATELY PURE. No DOM types, no timers, no `performance.now()` — the caller feeds pointer
// events and a clock. That is what lets `tests/touch/gesture.test.ts` drive every branch including
// the long-press promotion, which is otherwise untestable without a real finger and real time.
//
// The `update(now)` method is the only thing that needs a frame clock; it promotes a held press into
// a box select. Everything else is event-driven.

import { DOUBLE_TAP_MS, LONG_PRESS_MS, MOVE_THRESHOLD, TAP_MAX_MS } from '../../core/constants';

export interface Pt {
  x: number;
  y: number;
}

/** What the last pointer-up resolved to. Consumers route taps vs pans from this. */
export type GestureEndKind = 'tap' | 'pan' | 'box' | 'pinch' | 'none';

export interface GestureHandlers {
  onTap?: (p: Pt) => void;
  onDoubleTap?: (p: Pt) => void;
  onPanStart?: () => void;
  onPanMove?: (dx: number, dy: number) => void;
  onPanEnd?: () => void;
  onTwoFingerPan?: (dx: number, dy: number) => void;
  onBoxStart?: (p: Pt) => void;
  onBoxMove?: (p: Pt) => void;
  onBoxEnd?: (a: Pt, b: Pt) => void;
  /** `factor` > 1 zooms in. `center` is the midpoint of the two pointers. */
  onPinch?: (factor: number, center: Pt) => void;
  onLongPress?: (p: Pt) => void;
}

type State = 'idle' | 'pending' | 'pan' | 'box' | 'pinch';

/** Drag mode: what a one-finger drag means. `pan` (touch default) or `select` (v1 desktop default). */
export type DragMode = 'pan' | 'select';

export class GestureRecognizer {
  state: State = 'idle';
  /** What the last pointer-up resolved to (for input routing after gesture ends). */
  lastEndKind: GestureEndKind = 'none';

  private pointers = new Map<number, Pt>();
  private startPt: Pt = { x: 0, y: 0 };
  private startTime = 0;
  private lastPt: Pt = { x: 0, y: 0 };
  private lastTapTime = -Infinity;
  private lastTapPt: Pt = { x: 0, y: 0 };
  private pinchDist = 0;
  private pinchCenter: Pt = { x: 0, y: 0 };
  private dragToSelect: boolean;
  private suppressTapUntilAllPointersUp = false;

  constructor(
    private h: GestureHandlers,
    dragMode: DragMode = 'select',
  ) {
    this.dragToSelect = dragMode === 'select';
  }

  setDragMode(mode: DragMode): void {
    this.dragToSelect = mode === 'select';
  }

  get dragMode(): DragMode {
    return this.dragToSelect ? 'select' : 'pan';
  }

  private dist(a: Pt, b: Pt): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private centerOfPointers(): Pt {
    const pts = [...this.pointers.values()];
    if (pts.length === 0) return { x: 0, y: 0 };
    let x = 0;
    let y = 0;
    for (const p of pts) {
      x += p.x;
      y += p.y;
    }
    return { x: x / pts.length, y: y / pts.length };
  }

  pointerDown(id: number, x: number, y: number, now: number): void {
    if (this.pointers.size === 0) {
      this.lastEndKind = 'none';
      this.suppressTapUntilAllPointersUp = false;
    }
    this.pointers.set(id, { x, y });
    if (this.pointers.size >= 2) {
      this.suppressTapUntilAllPointersUp = true;
      const pts = [...this.pointers.values()];
      this.pinchDist = this.dist(pts[0]!, pts[1]!);
      this.pinchCenter = this.centerOfPointers();
      this.state = 'pinch';
      return;
    }
    this.startPt = { x, y };
    this.lastPt = { x, y };
    this.startTime = now;
    this.state = 'pending';
  }

  pointerMove(id: number, x: number, y: number, _now: number): void {
    if (!this.pointers.has(id)) return;
    this.pointers.set(id, { x, y });

    if (this.state === 'pinch') {
      const pts = [...this.pointers.values()];
      if (pts.length >= 2) {
        const center = this.centerOfPointers();
        const d = this.dist(pts[0]!, pts[1]!);
        if (this.pinchDist > 0) {
          const panDx = center.x - this.pinchCenter.x;
          const panDy = center.y - this.pinchCenter.y;
          if (Math.hypot(panDx, panDy) > 0.5) this.h.onTwoFingerPan?.(panDx, panDy);
          const factor = d / this.pinchDist;
          if (Number.isFinite(factor) && factor > 0) {
            // Clamped per event so a dropped frame cannot teleport the zoom.
            this.h.onPinch?.(Math.max(0.9, Math.min(1.1, factor)), center);
          }
        }
        this.pinchDist = d;
        this.pinchCenter = center;
      }
      return;
    }

    const cur = { x, y };
    if (this.state === 'pending') {
      if (this.dist(this.startPt, cur) > MOVE_THRESHOLD) {
        if (this.dragToSelect) {
          this.state = 'box';
          this.h.onBoxStart?.(this.startPt);
          this.h.onBoxMove?.(cur);
        } else {
          this.state = 'pan';
          this.h.onPanStart?.();
          this.h.onPanMove?.(cur.x - this.startPt.x, cur.y - this.startPt.y);
        }
      }
    } else if (this.state === 'pan') {
      this.h.onPanMove?.(cur.x - this.lastPt.x, cur.y - this.lastPt.y);
    } else if (this.state === 'box') {
      this.h.onBoxMove?.(cur);
    }
    this.lastPt = cur;
  }

  pointerUp(id: number, x: number, y: number, now: number): void {
    const had = this.pointers.delete(id);
    if (!had) return;
    const cur = { x, y };

    if (this.state === 'pinch') {
      if (this.pointers.size < 2) {
        if (this.pointers.size === 1) {
          // One finger stays down: re-arm as a pending press from here, so the remaining finger can
          // still pan without the pinch's start point being remembered.
          const pt = [...this.pointers.values()][0]!;
          this.state = 'pending';
          this.startPt = { ...pt };
          this.lastPt = { ...pt };
          this.startTime = now;
        } else {
          this.state = 'idle';
          this.lastEndKind = 'pinch';
          this.suppressTapUntilAllPointersUp = false;
        }
      }
      return;
    }
    if (this.state === 'pan') {
      this.h.onPanEnd?.();
      this.lastEndKind = 'pan';
      this.state = 'idle';
      if (this.pointers.size === 0) this.suppressTapUntilAllPointersUp = false;
      return;
    }
    if (this.state === 'box') {
      /**
       * A BOX THAT NEVER MOVED IS A TAP, NOT AN EMPTY SELECTION.
       *
       * A long press promotes to box select after 400 ms of stillness, which is what makes drag-to-box
       * possible on a phone. But a player who simply rests their finger before releasing — a deliberate
       * tap, or a slow one — then produced a zero-area box, which selected nothing and CLEARED their
       * selection. The browser proof caught this as "the second tap did nothing" on a 764 ms press.
       *
       * The intent of a long press is hold-then-drag; if there was no drag, it is still a tap. So the
       * distance decides, using the same threshold as every other tap rule.
       */
      if (this.dist(this.startPt, cur) <= MOVE_THRESHOLD) {
        this.h.onTap?.(cur);
        this.lastEndKind = 'tap';
        this.lastTapTime = now;
        this.lastTapPt = cur;
        this.state = 'idle';
        if (this.pointers.size === 0) this.suppressTapUntilAllPointersUp = false;
        return;
      }
      this.h.onBoxEnd?.(this.startPt, cur);
      this.lastEndKind = 'box';
      this.state = 'idle';
      if (this.pointers.size === 0) this.suppressTapUntilAllPointersUp = false;
      return;
    }
    if (this.state === 'pending') {
      const quick = now - this.startTime <= TAP_MAX_MS + LONG_PRESS_MS;
      const still = this.dist(this.startPt, cur) <= MOVE_THRESHOLD;
      if (this.suppressTapUntilAllPointersUp) {
        this.lastEndKind = 'pinch';
      } else if (quick && still) {
        if (now - this.lastTapTime <= DOUBLE_TAP_MS && this.dist(this.lastTapPt, cur) <= MOVE_THRESHOLD * 2) {
          this.h.onDoubleTap?.(cur);
          this.lastEndKind = 'tap';
          this.lastTapTime = -Infinity;
        } else {
          this.h.onTap?.(cur);
          this.lastEndKind = 'tap';
          this.lastTapTime = now;
          this.lastTapPt = cur;
        }
      } else {
        this.lastEndKind = 'none';
      }
      this.state = 'idle';
      if (this.pointers.size === 0) this.suppressTapUntilAllPointersUp = false;
    }
  }

  /** Call each frame with wall-clock ms to promote a held press into a box-select. */
  update(now: number): void {
    if (
      this.state === 'pending' &&
      now - this.startTime >= LONG_PRESS_MS &&
      this.dist(this.startPt, this.lastPt) <= MOVE_THRESHOLD
    ) {
      this.state = 'box';
      this.h.onLongPress?.(this.startPt);
      this.h.onBoxStart?.(this.startPt);
      this.h.onBoxMove?.(this.lastPt);
    }
  }

  /** Drop all active pointers and return to idle (e.g. after modes that bypass gesture pointerUp). */
  cancel(): void {
    this.pointers.clear();
    this.state = 'idle';
    this.lastEndKind = 'none';
    this.suppressTapUntilAllPointersUp = false;
  }

  get activePointers(): number {
    return this.pointers.size;
  }

  /** True while a one-finger pan gesture is active (before pointerUp). */
  wasPanning(): boolean {
    return this.state === 'pan';
  }

  /** True while a box select is being dragged. */
  isBoxing(): boolean {
    return this.state === 'box';
  }
}
