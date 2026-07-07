import { describe, expect, it, vi } from 'vitest';
import { WHEEL_PAN_SCALE } from '../src/core/constants';
import { PointerBinder } from '../src/app/match/pointer-binder';
import type { InputMode } from '../src/input/session';

type Listener = (e: Event) => void;

class FakeCanvas {
  readonly captured: number[] = [];
  readonly released: number[] = [];
  private listeners = new Map<string, Set<Listener>>();

  addEventListener(type: string, listener: Listener): void {
    const listeners = this.listeners.get(type) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  getBoundingClientRect(): DOMRect {
    return { left: 10, top: 20, width: 800, height: 600 } as DOMRect;
  }

  setPointerCapture(pointerId: number): void {
    this.captured.push(pointerId);
  }

  releasePointerCapture(pointerId: number): void {
    this.released.push(pointerId);
  }

  dispatch(type: string, event: Event): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

function pointerEvent(init: {
  pointerId?: number;
  button?: number;
  clientX: number;
  clientY: number;
}): PointerEvent & { prevented: boolean } {
  return {
    pointerId: init.pointerId ?? 1,
    button: init.button ?? 0,
    clientX: init.clientX,
    clientY: init.clientY,
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
  } as PointerEvent & { prevented: boolean };
}

function wheelEvent(deltaX: number, deltaY: number): WheelEvent & { prevented: boolean } {
  return {
    deltaX,
    deltaY,
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
  } as WheelEvent & { prevented: boolean };
}

function createBinder(mode: InputMode = 'normal') {
  const canvas = new FakeCanvas();
  const gesture = {
    activePointers: 0,
    lastEndKind: 'none',
    cancel: vi.fn(),
    pointerDown: vi.fn(),
    pointerMove: vi.fn(),
    pointerUp: vi.fn(),
  };
  const controller = {
    session: { mode },
    panByScreen: vi.fn(),
    tap: vi.fn(),
    isWallBuild: vi.fn(() => false),
    startWallDrag: vi.fn(),
    updateWallDrag: vi.fn(),
    finishWallDrag: vi.fn(),
    updateGhost: vi.fn(),
    updateDeployGhost: vi.fn(),
    updateRallyCursor: vi.fn(),
    confirmRally: vi.fn(),
  };
  const binder = new PointerBinder(canvas as unknown as HTMLCanvasElement, {
    getEnded: () => false,
    camera: { view: () => ({ x: 0, y: 0, zoom: 1 }) },
    controller,
    gesture,
    audio: { unlock: vi.fn() },
  } as unknown as ConstructorParameters<typeof PointerBinder>[1]);
  binder.attach();
  return { binder, canvas, controller, gesture };
}

describe('PointerBinder desktop controls', () => {
  it('pans with middle-mouse drag without entering gesture selection', () => {
    const { canvas, controller, gesture } = createBinder();
    const down = pointerEvent({ pointerId: 7, button: 1, clientX: 110, clientY: 120 });

    canvas.dispatch('pointerdown', down);
    canvas.dispatch('pointermove', pointerEvent({ pointerId: 7, button: 1, clientX: 130, clientY: 150 }));
    canvas.dispatch('pointerup', pointerEvent({ pointerId: 7, button: 1, clientX: 130, clientY: 150 }));

    expect(down.prevented).toBe(true);
    expect(gesture.cancel).toHaveBeenCalledTimes(1);
    expect(gesture.pointerDown).not.toHaveBeenCalled();
    expect(controller.panByScreen).toHaveBeenCalledWith(20, 30);
    expect(canvas.released).toContain(7);
  });

  it('pans with wheel events for touchpad scrolling', () => {
    const { canvas, controller } = createBinder();
    const event = wheelEvent(12, -18);

    canvas.dispatch('wheel', event);

    expect(event.prevented).toBe(true);
    expect(controller.panByScreen).toHaveBeenCalledWith(-12 * WHEEL_PAN_SCALE, 18 * WHEEL_PAN_SCALE);
  });

  it('routes spell-mode clicks to tap targeting', () => {
    const { canvas, controller, gesture } = createBinder('spell');

    canvas.dispatch('pointerdown', pointerEvent({ pointerId: 3, clientX: 200, clientY: 220 }));
    canvas.dispatch('pointerup', pointerEvent({ pointerId: 3, clientX: 200, clientY: 220 }));

    expect(gesture.pointerUp).toHaveBeenCalled();
    expect(controller.tap).toHaveBeenCalledWith({ x: 190, y: 200 });
  });
});
