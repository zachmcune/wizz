// THE TOUCH GESTURE MODEL — the part of "the touch controls should be basically the same as the first
// one" that can be proven without a browser.
//
// The recogniser is deliberately free of DOM types, timers and wall-clock reads: the caller feeds
// pointer events and a clock. That means every branch — including the long-press promotion, the pinch
// suppression, and the double-tap window — is reachable in a unit test. This suite drives all of them
// with literal millisecond values, so a threshold change is caught here rather than found on a phone.
//
// The cases are the v1 behaviours Zachary asked to keep, stated as the player experiences them:
//
//   • a quick press and release selects (tap)
//   • moving past the slop pans, and the pan follows the finger
//   • two fingers pinch and pan at once, and never also fire a tap
//   • holding still starts a box select
//   • two quick taps are a double tap (select all of a type), not two taps
//   • a cancelled gesture emits nothing

import { describe, expect, it } from 'vitest';
import { GestureRecognizer, type GestureEndKind, type Pt } from '../../src/app/input/gesture';
import { DOUBLE_TAP_MS, LONG_PRESS_MS, MOVE_THRESHOLD, TAP_MAX_MS } from '../../src/core/constants';

interface Log {
  taps: Pt[];
  doubleTaps: Pt[];
  pans: [number, number][];
  panEnds: number;
  boxStarts: Pt[];
  boxEnds: [Pt, Pt][];
  pinches: [number, Pt][];
  longPress: number;
  ends: GestureEndKind[];
}

function harness(dragMode: 'pan' | 'select' = 'pan'): { g: GestureRecognizer; log: Log } {
  const log: Log = { taps: [], doubleTaps: [], pans: [], panEnds: 0, boxStarts: [], boxEnds: [], pinches: [], longPress: 0, ends: [] };
  const g = new GestureRecognizer(
    {
      onTap: (p) => log.taps.push(p),
      onDoubleTap: (p) => log.doubleTaps.push(p),
      onPanMove: (dx, dy) => log.pans.push([dx, dy]),
      onTwoFingerPan: (dx, dy) => log.pans.push([dx, dy]),
      onPanEnd: () => {
        log.panEnds++;
      },
      onBoxStart: (p) => log.boxStarts.push(p),
      onBoxEnd: (a, b) => log.boxEnds.push([a, b]),
      onPinch: (f, c) => log.pinches.push([f, c]),
      onLongPress: () => {
        log.longPress++;
      },
    },
    dragMode,
  );
  return { g, log };
}

describe('touch: a tap is a press and release in the same place', () => {
  it('emits exactly one tap for a quick still press', () => {
    const { g, log } = harness('pan');
    g.pointerDown(1, 100, 100, 0);
    g.pointerUp(1, 102, 101, 120);
    expect(log.taps).toEqual([{ x: 102, y: 101 }]);
    expect(log.pans).toEqual([]);
    expect(g.lastEndKind).toBe('tap');
  });

  it('does not fire a tap once the press lasted longer than the tap window', () => {
    const { g, log } = harness('pan');
    g.pointerDown(1, 100, 100, 0);
    g.pointerUp(1, 100, 100, TAP_MAX_MS + LONG_PRESS_MS + 50);
    expect(log.taps).toEqual([]);
    expect(g.lastEndKind).toBe('none');
  });

  it('does not fire a tap when the finger drifted past the move threshold without a move event', () => {
    const { g, log } = harness('pan');
    g.pointerDown(1, 100, 100, 0);
    g.pointerUp(1, 100 + MOVE_THRESHOLD * 2, 100, 100);
    expect(log.taps).toEqual([]);
  });

  it('a second tap within the double-tap window is a double tap, not two taps', () => {
    const { g, log } = harness('pan');
    g.pointerDown(1, 200, 200, 0);
    g.pointerUp(1, 200, 200, 60);
    g.pointerDown(2, 202, 201, 60 + DOUBLE_TAP_MS - 20);
    g.pointerUp(2, 202, 201, 60 + DOUBLE_TAP_MS - 10);
    expect(log.taps).toEqual([{ x: 200, y: 200 }]);
    expect(log.doubleTaps).toEqual([{ x: 202, y: 201 }]);
  });

  it('two taps further apart than the window are two separate taps', () => {
    const { g, log } = harness('pan');
    g.pointerDown(1, 200, 200, 0);
    g.pointerUp(1, 200, 200, 40);
    g.pointerDown(2, 200, 200, 40 + DOUBLE_TAP_MS + 10);
    g.pointerUp(2, 200, 200, 40 + DOUBLE_TAP_MS + 40);
    expect(log.taps).toEqual([
      { x: 200, y: 200 },
      { x: 200, y: 200 },
    ]);
    expect(log.doubleTaps).toEqual([]);
  });
});

describe('touch: drag pans the camera and follows the finger', () => {
  it('promotes a drag into a pan once past the threshold', () => {
    const { g, log } = harness('pan');
    g.pointerDown(1, 100, 100, 0);
    g.pointerMove(1, 100 + MOVE_THRESHOLD + 4, 100, 16);
    expect(g.state).toBe('pan');
    // The first move reports the delta from the START, so the content does not jump.
    expect(log.pans[0]).toEqual([MOVE_THRESHOLD + 4, 0]);

    g.pointerMove(1, 100 + MOVE_THRESHOLD + 4 + 30, 100 + 10, 32);
    // Subsequent moves report incremental deltas.
    expect(log.pans[1]).toEqual([30, 10]);
    g.pointerUp(1, 200, 110, 60);
    expect(log.taps).toEqual([]);
    expect(log.panEnds).toBe(1);
    expect(g.lastEndKind).toBe('pan');
  });

  it('in select drag mode the same gesture becomes a box, not a pan', () => {
    const { g, log } = harness('select');
    g.pointerDown(1, 50, 50, 0);
    g.pointerMove(1, 50 + MOVE_THRESHOLD + 6, 50 + MOVE_THRESHOLD + 6, 16);
    expect(g.state).toBe('box');
    expect(log.pans).toEqual([]);
    expect(log.boxStarts).toEqual([{ x: 50, y: 50 }]);
    g.pointerUp(1, 150, 160, 80);
    expect(log.boxEnds).toHaveLength(1);
    expect(log.boxEnds[0]![1]).toEqual({ x: 150, y: 160 });
    expect(log.taps).toEqual([]);
  });
});

describe('touch: a long press starts a box select without moving', () => {
  it('promotes a held still press after the long-press delay', () => {
    const { g, log } = harness('pan');
    g.pointerDown(1, 300, 240, 1000);
    // Before the delay nothing happens.
    g.update(1000 + LONG_PRESS_MS - 10);
    expect(g.state).toBe('pending');
    expect(log.longPress).toBe(0);
    g.update(1000 + LONG_PRESS_MS + 1);
    expect(g.state).toBe('box');
    expect(log.longPress).toBe(1);
    expect(log.boxStarts).toEqual([{ x: 300, y: 240 }]);
  });

  it('does not promote a press that has already travelled', () => {
    const { g, log } = harness('pan');
    g.pointerDown(1, 300, 240, 0);
    g.pointerMove(1, 300 + MOVE_THRESHOLD + 20, 240, 40);
    expect(g.state).toBe('pan');
    g.update(LONG_PRESS_MS + 10);
    expect(g.state).toBe('pan');
    expect(log.boxStarts).toEqual([]);
  });

  it('a long press that then DRAGS produces a box, not a tap', () => {
    const { g, log } = harness('pan');
    g.pointerDown(1, 100, 100, 0);
    g.update(LONG_PRESS_MS + 5);
    g.pointerMove(1, 180, 190, LONG_PRESS_MS + 40);
    g.pointerUp(1, 180, 190, LONG_PRESS_MS + 60);
    expect(log.taps).toEqual([]);
    expect(log.boxEnds).toHaveLength(1);
    expect(g.lastEndKind).toBe('box');
  });

  it('a long press that never moves is still a TAP, not an empty box', () => {
    /**
     * THE BUG THIS PINS. A slow deliberate tap — press, think for half a second, release — was promoted
     * to box select by the 400 ms long-press rule and then resolved to a zero-area box, which selected
     * nothing and CLEARED the player's selection. On a phone that reads as "my taps only work sometimes",
     * which is exactly how the browser touch proof found it: a 764 ms press produced no selection at all.
     *
     * The intent of a long press is hold-then-drag. With no drag, it is a tap.
     */
    const { g, log } = harness('pan');
    g.pointerDown(1, 200, 200, 0);
    g.update(LONG_PRESS_MS + 5);
    expect(g.state).toBe('box');
    g.pointerUp(1, 200, 200, LONG_PRESS_MS + 60);
    expect(log.boxEnds).toEqual([]);
    expect(log.taps, 'a held-but-still press must still select').toEqual([{ x: 200, y: 200 }]);
    expect(g.lastEndKind).toBe('tap');
  });

  it('a pan clears the multi-touch suppression so the NEXT gesture can tap', () => {
    /**
     * AND THIS ONE. `suppressTapUntilAllPointersUp` is set when a second finger lands, and only cleared
     * on the paths that return early through the pending branch. A pan or a box that finished with all
     * pointers up left the flag set, so every later single-finger gesture was silently treated as a pinch
     * and produced no tap. Measured in the browser: the first tap selected, and NOTHING after it worked
     * for the rest of the match.
     */
    const { g, log } = harness('pan');
    // A pinch, then a full lift.
    g.pointerDown(1, 100, 100, 0);
    g.pointerDown(2, 200, 100, 10);
    g.pointerUp(2, 200, 100, 20);
    g.pointerUp(1, 100, 100, 30);
    // Then a pan, then a tap.
    g.pointerDown(3, 300, 300, 100);
    g.pointerMove(3, 360, 300, 120);
    g.pointerUp(3, 360, 300, 140);
    expect(g.lastEndKind).toBe('pan');
    g.pointerDown(4, 400, 400, 200);
    g.pointerUp(4, 400, 400, 240);
    expect(log.taps, 'a tap after a pan was suppressed').toEqual([{ x: 400, y: 400 }]);
  });
});

describe('touch: pinch zooms about its centre and suppresses taps', () => {
  it('emits a zoom factor and a centre for a two-finger spread', () => {
    const { g, log } = harness('pan');
    g.pointerDown(1, 100, 200, 0);
    g.pointerDown(2, 200, 200, 10);
    expect(g.state).toBe('pinch');
    // Spread from 100px to 140px apart: factor 1.4, clamped to 1.1 per event.
    g.pointerMove(2, 240, 200, 20);
    expect(log.pinches.length).toBeGreaterThan(0);
    const [factor, centre] = log.pinches[0]!;
    expect(factor).toBeCloseTo(1.1, 5);
    expect(centre.x).toBeGreaterThan(160);
    expect(centre.y).toBeCloseTo(200, 5);
  });

  it('a pinch that also drifts pans the camera', () => {
    const { g, log } = harness('pan');
    g.pointerDown(1, 100, 200, 0);
    g.pointerDown(2, 200, 200, 10);
    // Both fingers move right together: no scale change, but the centre moves.
    g.pointerMove(1, 140, 200, 20);
    g.pointerMove(2, 240, 200, 20);
    const totalDx = log.pans.reduce((a, [dx]) => a + dx, 0);
    expect(totalDx).toBeGreaterThan(30);
  });

  it('lifting one finger of a pinch never fires a tap for the other', () => {
    const { g, log } = harness('pan');
    g.pointerDown(1, 100, 200, 0);
    g.pointerDown(2, 200, 200, 10);
    g.pointerMove(2, 260, 200, 20);
    g.pointerUp(2, 260, 200, 30); // stays pending on finger 1
    g.pointerUp(1, 100, 200, 40);
    expect(log.taps).toEqual([]);
    expect(log.pinches.length).toBeGreaterThan(0);
  });

  it('a full two-finger lift reports pinch as the end kind', () => {
    const { g } = harness('pan');
    g.pointerDown(1, 100, 200, 0);
    g.pointerDown(2, 200, 200, 5);
    g.pointerUp(2, 200, 200, 10);
    expect(g.state).toBe('pending');
    g.update(5 + LONG_PRESS_MS + 10);
    // The remaining finger's press was re-armed at the lift time, so this is still a live gesture.
    expect(g.activePointers).toBe(1);
  });
});

describe('touch: cancel drops everything', () => {
  it('a cancelled gesture emits no tap and returns to idle', () => {
    const { g, log } = harness('pan');
    g.pointerDown(1, 10, 10, 0);
    g.cancel();
    expect(g.state).toBe('idle');
    expect(g.activePointers).toBe(0);
    g.pointerUp(1, 10, 10, 20);
    expect(log.taps).toEqual([]);
  });
});

describe('touch: drag mode can be switched at runtime', () => {
  it('setDragMode changes what a drag means without dropping state', () => {
    const { g } = harness('pan');
    expect(g.dragMode).toBe('pan');
    g.setDragMode('select');
    expect(g.dragMode).toBe('select');
    g.pointerDown(1, 0, 0, 0);
    g.pointerMove(1, MOVE_THRESHOLD + 10, 0, 10);
    expect(g.state).toBe('box');
  });
});
