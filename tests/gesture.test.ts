import { describe, it, expect, vi } from 'vitest';
import { GestureRecognizer } from '../src/input/gesture';

function make(dragMode: 'pan' | 'select' = 'pan') {
  const h = {
    onTap: vi.fn(),
    onDoubleTap: vi.fn(),
    onPanStart: vi.fn(),
    onPanMove: vi.fn(),
    onPanEnd: vi.fn(),
    onBoxStart: vi.fn(),
    onBoxMove: vi.fn(),
    onBoxEnd: vi.fn(),
    onPinch: vi.fn(),
  };
  return { g: new GestureRecognizer(h, dragMode), h };
}

describe('gesture FSM', () => {
  it('quick still press = tap', () => {
    const { g, h } = make();
    g.pointerDown(1, 100, 100, 0);
    g.pointerUp(1, 102, 101, 120);
    expect(h.onTap).toHaveBeenCalledTimes(1);
    expect(h.onPanStart).not.toHaveBeenCalled();
  });

  it('two taps on same spot = double tap', () => {
    const { g, h } = make();
    g.pointerDown(1, 100, 100, 0);
    g.pointerUp(1, 100, 100, 100);
    g.pointerDown(1, 101, 100, 200);
    g.pointerUp(1, 101, 100, 260);
    expect(h.onDoubleTap).toHaveBeenCalledTimes(1);
  });

  it('drag beyond threshold before long-press = pan', () => {
    const { g, h } = make('pan');
    g.pointerDown(1, 100, 100, 0);
    g.pointerMove(1, 140, 100, 50);
    expect(h.onPanStart).toHaveBeenCalledTimes(1);
    expect(h.onPanMove).toHaveBeenCalled();
    g.pointerUp(1, 140, 100, 80);
    expect(h.onPanEnd).toHaveBeenCalledTimes(1);
    expect(h.onTap).not.toHaveBeenCalled();
  });

  it('held still past LONG_PRESS then drag = box select (select mode only)', () => {
    const { g, h } = make('select');
    g.pointerDown(1, 100, 100, 0);
    g.update(500);
    expect(h.onBoxStart).toHaveBeenCalledTimes(1);
    g.pointerMove(1, 160, 160, 520);
    expect(h.onBoxMove).toHaveBeenCalled();
    g.pointerUp(1, 160, 160, 540);
    expect(h.onBoxEnd).toHaveBeenCalledTimes(1);
  });

  it('held still in pan mode does not start box select', () => {
    const { g, h } = make('pan');
    g.pointerDown(1, 100, 100, 0);
    g.update(500);
    expect(h.onBoxStart).not.toHaveBeenCalled();
  });

  it('drag=select mode makes a one-finger drag a box', () => {
    const { g, h } = make('select');
    g.pointerDown(1, 100, 100, 0);
    g.pointerMove(1, 150, 130, 40);
    expect(h.onBoxStart).toHaveBeenCalledTimes(1);
    g.pointerUp(1, 150, 130, 60);
    expect(h.onBoxEnd).toHaveBeenCalledTimes(1);
    expect(h.onPanStart).not.toHaveBeenCalled();
  });

  it('two fingers = pinch', () => {
    const { g, h } = make();
    g.pointerDown(1, 100, 100, 0);
    g.pointerDown(2, 200, 100, 10);
    g.pointerMove(2, 260, 100, 20); // fingers spread apart -> zoom in
    expect(h.onPinch).toHaveBeenCalled();
    const [factor] = h.onPinch.mock.calls[0]!;
    expect(factor).toBeGreaterThan(1);
  });
});
