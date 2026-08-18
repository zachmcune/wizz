import { describe, expect, it, vi } from 'vitest';
import { WHEEL_PAN_SCALE } from '../src/core/constants';
import { screenToWorld } from '../src/core/coords';
import { PointerBinder, isOverHudChrome, shouldTrackPlacementGhost } from '../src/app/match/pointer-binder';
import type { InputMode } from '../src/input/session';

const CAM = { x: 0, y: 0, zoom: 1 };

function worldFromClient(clientX: number, clientY: number): { x: number; y: number } {
  return screenToWorld({ x: clientX - 10, y: clientY - 20 }, CAM);
}

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
  buttons?: number;
  pointerType?: string;
  clientX: number;
  clientY: number;
}): PointerEvent & { prevented: boolean } {
  const button = init.button ?? 0;
  return {
    pointerId: init.pointerId ?? 1,
    button,
    buttons: init.buttons ?? (button === 0 ? 1 : button === 1 ? 4 : button === 2 ? 2 : 0),
    pointerType: init.pointerType ?? 'mouse',
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
    confirmPlacement: vi.fn(),
    setMode: vi.fn(),
    notePointerWorld: vi.fn(),
    previewWallAt: vi.fn(),
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

describe('placement ghost tracking helpers', () => {
  it('follows mouse hover and any held drag, but not touch hover', () => {
    expect(shouldTrackPlacementGhost({ pointerType: 'mouse', buttons: 0 })).toBe(true);
    expect(shouldTrackPlacementGhost({ pointerType: 'pen', buttons: 0 })).toBe(true);
    expect(shouldTrackPlacementGhost({ pointerType: 'touch', buttons: 0 })).toBe(false);
    expect(shouldTrackPlacementGhost({ pointerType: 'touch', buttons: 1 })).toBe(true);
  });

  it('treats missing document as not over HUD chrome', () => {
    expect(isOverHudChrome(0, 0)).toBe(false);
  });
});

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

  it('moves the build ghost on mouse hover so placement validity is visible', () => {
    const { canvas, controller } = createBinder('build');

    canvas.dispatch(
      'pointermove',
      pointerEvent({ pointerType: 'mouse', buttons: 0, button: -1, clientX: 240, clientY: 260 }),
    );

    expect(controller.updateGhost).toHaveBeenCalledWith(worldFromClient(240, 260));
  });

  it('moves the deploy ghost on mouse hover', () => {
    const { canvas, controller } = createBinder('deploy');

    canvas.dispatch(
      'pointermove',
      pointerEvent({ pointerType: 'mouse', buttons: 0, button: -1, clientX: 240, clientY: 260 }),
    );

    expect(controller.updateDeployGhost).toHaveBeenCalledWith(worldFromClient(240, 260));
  });

  it('does not move the build ghost when hovering HUD chrome such as Place', () => {
    const { canvas, controller } = createBinder('build');
    const hud = { closest: (sel: string) => (sel.includes('.build-confirm') ? hud : null) };
    const previous = (globalThis as { document?: unknown }).document;
    (globalThis as { document?: { elementFromPoint: (x: number, y: number) => unknown } }).document = {
      elementFromPoint: () => hud,
    };

    try {
      canvas.dispatch(
        'pointermove',
        pointerEvent({ pointerType: 'mouse', buttons: 0, button: -1, clientX: 240, clientY: 260 }),
      );
      expect(controller.updateGhost).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete (globalThis as { document?: unknown }).document;
      else (globalThis as { document: unknown }).document = previous;
    }
  });

  it('previews a wall ghost on mouse hover before dragging', () => {
    const { canvas, controller } = createBinder('build');
    controller.isWallBuild = vi.fn(() => true);

    canvas.dispatch(
      'pointermove',
      pointerEvent({ pointerType: 'mouse', buttons: 0, button: -1, clientX: 240, clientY: 260 }),
    );

    expect(controller.previewWallAt).toHaveBeenCalledWith(worldFromClient(240, 260));
    expect(controller.updateGhost).not.toHaveBeenCalled();
  });

  it('does not move the build ghost on touch hover without a press', () => {
    const { canvas, controller } = createBinder('build');

    canvas.dispatch(
      'pointermove',
      pointerEvent({ pointerType: 'touch', buttons: 0, button: -1, clientX: 240, clientY: 260 }),
    );

    expect(controller.updateGhost).not.toHaveBeenCalled();
  });

  it('moves the build ghost while the mouse button is held', () => {
    const { canvas, controller } = createBinder('build');

    canvas.dispatch('pointerdown', pointerEvent({ pointerType: 'mouse', clientX: 200, clientY: 220 }));
    canvas.dispatch(
      'pointermove',
      pointerEvent({ pointerType: 'mouse', buttons: 1, clientX: 260, clientY: 280 }),
    );

    expect(controller.updateGhost).toHaveBeenCalledWith(worldFromClient(260, 280));
  });

  it('places immediately on a desktop click in build mode', () => {
    const { canvas, controller } = createBinder('build');

    canvas.dispatch('pointerdown', pointerEvent({ pointerType: 'mouse', clientX: 200, clientY: 220 }));
    canvas.dispatch('pointerup', pointerEvent({ pointerType: 'mouse', buttons: 0, clientX: 200, clientY: 220 }));

    expect(controller.tap).toHaveBeenCalledWith({ x: 190, y: 200 });
    expect(controller.confirmPlacement).toHaveBeenCalledTimes(1);
  });

  it('deploys immediately on a desktop click', () => {
    const { canvas, controller } = createBinder('deploy');

    canvas.dispatch('pointerdown', pointerEvent({ pointerType: 'mouse', clientX: 200, clientY: 220 }));
    canvas.dispatch('pointerup', pointerEvent({ pointerType: 'mouse', buttons: 0, clientX: 200, clientY: 220 }));

    expect(controller.tap).toHaveBeenCalledWith({ x: 190, y: 200 });
    expect(controller.confirmPlacement).toHaveBeenCalledTimes(1);
  });

  it('does not auto-place on a touch tap in build mode', () => {
    const { canvas, controller } = createBinder('build');

    canvas.dispatch('pointerdown', pointerEvent({ pointerType: 'touch', clientX: 200, clientY: 220 }));
    canvas.dispatch('pointerup', pointerEvent({ pointerType: 'touch', buttons: 0, clientX: 200, clientY: 220 }));

    expect(controller.tap).toHaveBeenCalledWith({ x: 190, y: 200 });
    expect(controller.confirmPlacement).not.toHaveBeenCalled();
  });

  it('places a wall on desktop release after drag', () => {
    const { canvas, controller } = createBinder('build');
    controller.isWallBuild = vi.fn(() => true);

    canvas.dispatch('pointerdown', pointerEvent({ pointerType: 'mouse', clientX: 200, clientY: 220 }));
    canvas.dispatch(
      'pointermove',
      pointerEvent({ pointerType: 'mouse', buttons: 1, clientX: 280, clientY: 220 }),
    );
    canvas.dispatch('pointerup', pointerEvent({ pointerType: 'mouse', buttons: 0, clientX: 280, clientY: 220 }));

    expect(controller.startWallDrag).toHaveBeenCalled();
    expect(controller.updateWallDrag).toHaveBeenCalled();
    expect(controller.finishWallDrag).toHaveBeenCalled();
    expect(controller.confirmPlacement).toHaveBeenCalledTimes(1);
  });

  it('cancels targeting with right-click', () => {
    const { canvas, controller, gesture } = createBinder('build');
    const down = pointerEvent({ pointerType: 'mouse', button: 2, clientX: 200, clientY: 220 });

    canvas.dispatch('pointerdown', down);
    canvas.dispatch('pointerup', pointerEvent({ pointerType: 'mouse', button: 2, buttons: 0, clientX: 200, clientY: 220 }));

    expect(down.prevented).toBe(true);
    expect(controller.setMode).toHaveBeenCalledWith('normal');
    expect(gesture.pointerDown).not.toHaveBeenCalled();
    expect(controller.tap).not.toHaveBeenCalled();
    expect(controller.confirmPlacement).not.toHaveBeenCalled();
    expect(canvas.captured).toEqual([]);
  });

  it('suppresses the canvas context menu so right-click can cancel', () => {
    const { canvas } = createBinder();
    const event = {
      prevented: false,
      preventDefault() {
        this.prevented = true;
      },
    };

    canvas.dispatch('contextmenu', event as unknown as Event);

    expect(event.prevented).toBe(true);
  });
});
