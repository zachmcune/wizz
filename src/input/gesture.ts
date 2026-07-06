// Touch gesture state machine (Part 10.8). Framework-agnostic and unit-testable:
// feed it abstract pointer events + periodic update(now); it emits high-level gestures.
import { TAP_MAX_MS, MOVE_THRESHOLD, LONG_PRESS_MS, DOUBLE_TAP_MS } from '../core/constants';

export interface Pt {
  x: number;
  y: number;
}

export interface GestureHandlers {
  onTap?: (p: Pt) => void;
  onDoubleTap?: (p: Pt) => void;
  onPanStart?: () => void;
  onPanMove?: (dx: number, dy: number) => void;
  onPanEnd?: () => void;
  onBoxStart?: (p: Pt) => void;
  onBoxMove?: (p: Pt) => void;
  onBoxEnd?: (a: Pt, b: Pt) => void;
  onPinch?: (factor: number, center: Pt) => void;
}

type State = 'idle' | 'pending' | 'pan' | 'box' | 'pinch';

export class GestureRecognizer {
  state: State = 'idle';
  private pointers = new Map<number, Pt>();
  private startPt: Pt = { x: 0, y: 0 };
  private startTime = 0;
  private lastPt: Pt = { x: 0, y: 0 };
  private lastTapTime = -Infinity;
  private lastTapPt: Pt = { x: 0, y: 0 };
  private pinchDist = 0;
  private dragToSelect: boolean;

  constructor(
    private h: GestureHandlers,
    dragMode: 'pan' | 'select' = 'pan',
  ) {
    this.dragToSelect = dragMode === 'select';
  }

  setDragMode(mode: 'pan' | 'select'): void {
    this.dragToSelect = mode === 'select';
  }

  private dist(a: Pt, b: Pt): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  pointerDown(id: number, x: number, y: number, now: number): void {
    this.pointers.set(id, { x, y });
    if (this.pointers.size >= 2) {
      const pts = [...this.pointers.values()];
      this.pinchDist = this.dist(pts[0]!, pts[1]!);
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
        const d = this.dist(pts[0]!, pts[1]!);
        const center = { x: (pts[0]!.x + pts[1]!.x) / 2, y: (pts[0]!.y + pts[1]!.y) / 2 };
        if (this.pinchDist > 0) this.h.onPinch?.(d / this.pinchDist, center);
        this.pinchDist = d;
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
          this.state = 'pan';
          this.startPt = { ...pt };
          this.lastPt = { ...pt };
          this.h.onPanStart?.();
        } else {
          this.state = 'idle';
        }
      }
      return;
    }
    if (this.state === 'pan') {
      this.h.onPanEnd?.();
      this.state = 'idle';
      return;
    }
    if (this.state === 'box') {
      this.h.onBoxEnd?.(this.startPt, cur);
      this.state = 'idle';
      return;
    }
    if (this.state === 'pending') {
      const quick = now - this.startTime <= TAP_MAX_MS + LONG_PRESS_MS;
      const still = this.dist(this.startPt, cur) <= MOVE_THRESHOLD;
      if (quick && still) {
        if (now - this.lastTapTime <= DOUBLE_TAP_MS && this.dist(this.lastTapPt, cur) <= MOVE_THRESHOLD * 2) {
          this.h.onDoubleTap?.(cur);
          this.lastTapTime = -Infinity;
        } else {
          this.h.onTap?.(cur);
          this.lastTapTime = now;
          this.lastTapPt = cur;
        }
      }
      this.state = 'idle';
    }
  }

  /** Call each frame with wall-clock ms to promote a held press into a box-select (select mode only). */
  update(now: number): void {
    if (!this.dragToSelect) return;
    if (this.state === 'pending' && now - this.startTime >= LONG_PRESS_MS && this.dist(this.startPt, this.lastPt) <= MOVE_THRESHOLD) {
      this.state = 'box';
      this.h.onBoxStart?.(this.startPt);
      this.h.onBoxMove?.(this.lastPt);
    }
  }

  wasPanning(): boolean {
    return this.state === 'pan';
  }
}
