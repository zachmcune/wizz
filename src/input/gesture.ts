// Touch gesture state machine (Part 10.8). Framework-agnostic and unit-testable:
// feed it abstract pointer events + periodic update(now); it emits high-level gestures.
import { TAP_MAX_MS, MOVE_THRESHOLD, LONG_PRESS_MS, DOUBLE_TAP_MS } from '../core/constants';

export interface Pt {
  x: number;
  y: number;
}

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
  onPinch?: (factor: number, center: Pt) => void;
}

type State = 'idle' | 'pending' | 'pan' | 'box' | 'pinch';

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

  constructor(
    private h: GestureHandlers,
    dragMode: 'pan' | 'select' = 'select',
  ) {
    this.dragToSelect = dragMode === 'select';
  }

  setDragMode(mode: 'pan' | 'select'): void {
    this.dragToSelect = mode === 'select';
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
    this.lastEndKind = 'none';
    this.pointers.set(id, { x, y });
    if (this.pointers.size >= 2) {
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
          const pt = [...this.pointers.values()][0]!;
          this.state = 'pending';
          this.startPt = { ...pt };
          this.lastPt = { ...pt };
          this.startTime = now;
        } else {
          this.state = 'idle';
          this.lastEndKind = 'pinch';
        }
      }
      return;
    }
    if (this.state === 'pan') {
      this.h.onPanEnd?.();
      this.lastEndKind = 'pan';
      this.state = 'idle';
      return;
    }
    if (this.state === 'box') {
      this.h.onBoxEnd?.(this.startPt, cur);
      this.lastEndKind = 'box';
      this.state = 'idle';
      return;
    }
    if (this.state === 'pending') {
      const quick = now - this.startTime <= TAP_MAX_MS + LONG_PRESS_MS;
      const still = this.dist(this.startPt, cur) <= MOVE_THRESHOLD;
      if (quick && still) {
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
    }
  }

  /** Call each frame with wall-clock ms to promote a held press into a box-select. */
  update(now: number): void {
    if (this.state === 'pending' && now - this.startTime >= LONG_PRESS_MS && this.dist(this.startPt, this.lastPt) <= MOVE_THRESHOLD) {
      this.state = 'box';
      this.h.onBoxStart?.(this.startPt);
      this.h.onBoxMove?.(this.lastPt);
    }
  }

  /** Drop all active pointers and return to idle (e.g. after modes that bypass gesture pointerUp). */
  cancel(): void {
    this.pointers.clear();
    this.state = 'idle';
    this.lastEndKind = 'none';
  }

  get activePointers(): number {
    return this.pointers.size;
  }

  /** True while a one-finger pan gesture is active (before pointerUp). */
  wasPanning(): boolean {
    return this.state === 'pan';
  }
}
