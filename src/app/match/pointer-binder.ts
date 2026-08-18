import { TAP_SLOP_PX, WHEEL_PAN_SCALE } from '../../core/constants';
import { screenToWorld } from '../../core/coords';
import type { Camera } from '../../render/camera';
import type { InputController } from '../../input/controller';
import type { GestureRecognizer } from '../../input/gesture';
import { CONTROL_ACTIONS } from '../../input/actions';
import { lockLandscape } from '../../ui/orientation';
import type { AudioManager } from '../../audio/audio';

export const POINTER_CONTROL_ACTIONS = {
  primaryTap: CONTROL_ACTIONS.select,
  boxSelect: CONTROL_ACTIONS.boxSelect,
  middlePan: CONTROL_ACTIONS.panCamera,
  wheelPan: CONTROL_ACTIONS.panCamera,
  spellTarget: CONTROL_ACTIONS.castSpellTarget,
  placeBuilding: CONTROL_ACTIONS.placeBuilding,
  cancelTargeting: CONTROL_ACTIONS.deselect,
} as const;

const TARGETING_MODES = new Set([
  'build',
  'deploy',
  'spell',
  'attackMove',
  'moveInOrder',
  'rally',
  'garrison',
  'superweapon',
]);

/** Finger/button is down — hover must not move placement ghosts. */
export function isPointerHeld(e: Pick<PointerEvent, 'buttons'>): boolean {
  return e.buttons !== 0;
}

/** Mouse/pen clicks place immediately; touch still previews then uses Place. */
export function isFinePointer(e: Pick<PointerEvent, 'pointerType'>): boolean {
  return e.pointerType === 'mouse' || e.pointerType === 'pen';
}

export interface PointerBinderDeps {
  getEnded: () => boolean;
  camera: Camera;
  controller: InputController;
  gesture: GestureRecognizer;
  audio: AudioManager;
}

/** Binds canvas pointer events to gestures and input-controller mode handlers. */
export class PointerBinder {
  private wallDragging = false;
  private pointerStart = { x: 0, y: 0 };
  private lastPointer = { x: 0, y: 0 };
  private middlePanPointerId: number | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private deps: PointerBinderDeps,
  ) {}

  getLastPointer(): { x: number; y: number } {
    return this.lastPointer;
  }

  attach(): void {
    this.canvas.addEventListener('pointerdown', this.onDown);
    this.canvas.addEventListener('pointermove', this.onMove);
    this.canvas.addEventListener('pointerup', this.onUp);
    this.canvas.addEventListener('pointercancel', this.onUp);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.canvas.addEventListener('contextmenu', this.onContextMenu);
  }

  detach(): void {
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('pointerup', this.onUp);
    this.canvas.removeEventListener('pointercancel', this.onUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
  }

  private rel = (e: PointerEvent): { x: number; y: number } => {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  private onDown = (e: PointerEvent): void => {
    this.deps.audio.unlock();
    void lockLandscape();
    const p = this.rel(e);
    this.lastPointer = p;
    this.pointerStart = p;
    if (e.button === 2) {
      e.preventDefault();
      this.cancelTargeting();
      return;
    }
    this.canvas.setPointerCapture(e.pointerId);
    if (e.button === 1) {
      e.preventDefault();
      this.middlePanPointerId = e.pointerId;
      this.deps.gesture.cancel();
      return;
    }
    if (this.deps.getEnded()) {
      this.deps.gesture.pointerDown(e.pointerId, p.x, p.y, performance.now());
      return;
    }
    const mode = this.deps.controller.session.mode;
    if (mode === 'build' && this.deps.controller.isWallBuild()) {
      this.wallDragging = true;
      const w = screenToWorld(p, this.deps.camera.view());
      this.deps.controller.startWallDrag(w);
    }
    this.deps.gesture.pointerDown(e.pointerId, p.x, p.y, performance.now());
  };

  private onMove = (e: PointerEvent): void => {
    const p = this.rel(e);
    if (this.middlePanPointerId === e.pointerId) {
      e.preventDefault();
      this.deps.controller.panByScreen(p.x - this.lastPointer.x, p.y - this.lastPointer.y);
      this.lastPointer = p;
      return;
    }
    this.lastPointer = p;
    if (this.deps.getEnded()) {
      this.deps.gesture.pointerMove(e.pointerId, p.x, p.y, performance.now());
      return;
    }
    const mode = this.deps.controller.session.mode;
    if (mode === 'build' && this.deps.controller.isWallBuild() && this.wallDragging) {
      const w = screenToWorld(p, this.deps.camera.view());
      this.deps.controller.updateWallDrag(w);
      return;
    }
    // Follow an active drag only. Mouse hover must not move the ghost onto HUD
    // buttons such as Place — that is what made desktop building unusable.
    if ((mode === 'build' || mode === 'deploy') && isPointerHeld(e)) {
      const w = screenToWorld(p, this.deps.camera.view());
      if (mode === 'build') this.deps.controller.updateGhost(w);
      else this.deps.controller.updateDeployGhost(w);
    }
    if (mode === 'rally') {
      if (this.deps.gesture.activePointers >= 2) {
        this.deps.gesture.pointerMove(e.pointerId, p.x, p.y, performance.now());
      } else {
        const w = screenToWorld(p, this.deps.camera.view());
        this.deps.controller.updateRallyCursor(w);
      }
      return;
    }
    if (mode === 'normal' || mode === 'attackMove' || mode === 'moveInOrder' || mode === 'spell' || mode === 'superweapon') {
      this.deps.gesture.pointerMove(e.pointerId, p.x, p.y, performance.now());
    }
  };

  private onUp = (e: PointerEvent): void => {
    const p = this.rel(e);
    if (e.button === 2) {
      this.lastPointer = p;
      return;
    }
    if (this.middlePanPointerId === e.pointerId) {
      e.preventDefault();
      this.middlePanPointerId = null;
      this.lastPointer = p;
      try {
        this.canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      return;
    }
    if (this.deps.getEnded()) {
      this.deps.gesture.pointerUp(e.pointerId, p.x, p.y, performance.now());
      return;
    }
    const mode = this.deps.controller.session.mode;
    const drift = Math.hypot(p.x - this.pointerStart.x, p.y - this.pointerStart.y);
    if (mode === 'rally') {
      this.deps.gesture.pointerUp(e.pointerId, p.x, p.y, performance.now());
      try {
        this.canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      if (this.deps.gesture.activePointers === 0) {
        const panned = this.deps.gesture.lastEndKind === 'pan' || this.deps.gesture.lastEndKind === 'pinch';
        if (!panned && drift <= TAP_SLOP_PX) {
          this.deps.controller.confirmRally(screenToWorld(p, this.deps.camera.view()));
        }
      }
      return;
    }
    if (mode === 'build' && this.deps.controller.isWallBuild()) {
      this.deps.gesture.pointerUp(e.pointerId, p.x, p.y, performance.now());
      if (this.wallDragging) {
        const w = screenToWorld(p, this.deps.camera.view());
        this.deps.controller.updateWallDrag(w);
        this.deps.controller.finishWallDrag();
        this.wallDragging = false;
        if (isFinePointer(e)) this.deps.controller.confirmPlacement();
      }
      return;
    }
    if (
      mode === 'normal' ||
      mode === 'attackMove' ||
      mode === 'moveInOrder' ||
      mode === 'build' ||
      mode === 'deploy' ||
      mode === 'spell' ||
      mode === 'superweapon'
    ) {
      this.deps.gesture.pointerUp(e.pointerId, p.x, p.y, performance.now());
    }
    const panned = this.deps.gesture.lastEndKind === 'pan' || this.deps.gesture.lastEndKind === 'pinch';
    if (
      (mode === 'normal' || mode === 'build' || mode === 'deploy' || mode === 'spell' || mode === 'superweapon') &&
      !panned &&
      drift <= TAP_SLOP_PX &&
      this.deps.gesture.lastEndKind !== 'tap' &&
      this.deps.gesture.lastEndKind !== 'box'
    ) {
      this.deps.controller.tap(p);
    }
    if (
      isFinePointer(e) &&
      (mode === 'build' || mode === 'deploy') &&
      !panned &&
      drift <= TAP_SLOP_PX
    ) {
      this.deps.controller.confirmPlacement();
    }
  };

  private onContextMenu = (e: Event): void => {
    e.preventDefault();
  };

  private cancelTargeting(): void {
    if (TARGETING_MODES.has(this.deps.controller.session.mode)) {
      this.deps.controller.setMode('normal');
    }
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.deps.controller.panByScreen(-e.deltaX * WHEEL_PAN_SCALE, -e.deltaY * WHEEL_PAN_SCALE);
  };
}
