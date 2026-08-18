import { describe, expect, it } from 'vitest';
import { appendOpenArc, openArcPoints, openArcSweep } from '../src/render/open-arc';

describe('openArcSweep', () => {
  it('keeps a positive clockwise sweep (mana fill from 12 o\'clock)', () => {
    const start = -Math.PI / 2;
    const end = start + Math.PI;
    expect(openArcSweep(start, end)).toBeCloseTo(Math.PI);
  });

  it('takes the long way when end is behind start (canvas default)', () => {
    expect(openArcSweep(Math.PI, 0)).toBeCloseTo(Math.PI);
  });
});

describe('openArcPoints', () => {
  it('starts and ends on the circle and never includes the origin for an offset ring', () => {
    const cx = 1800;
    const cy = 1400;
    const r = 28;
    const start = -Math.PI / 2;
    const end = start + Math.PI * 0.6;
    const pts = openArcPoints(cx, cy, r, start, end);
    expect(pts.length).toBeGreaterThanOrEqual(8 * 2);
    expect(pts[0]).toBeCloseTo(cx + Math.cos(start) * r);
    expect(pts[1]).toBeCloseTo(cy + Math.sin(start) * r);
    expect(pts[pts.length - 2]).toBeCloseTo(cx + Math.cos(end) * r);
    expect(pts[pts.length - 1]).toBeCloseTo(cy + Math.sin(end) * r);
    for (let i = 0; i < pts.length; i += 2) {
      expect(pts[i]).not.toBe(0);
      expect(pts[i + 1]).not.toBe(0);
      const dx = pts[i]! - cx;
      const dy = pts[i + 1]! - cy;
      expect(Math.hypot(dx, dy)).toBeCloseTo(r, 5);
    }
  });
});

describe('appendOpenArc', () => {
  it('emits moveTo then lineTo only — no Graphics.arc()', () => {
    const cmds: string[] = [];
    appendOpenArc(
      {
        moveTo(x, y) {
          cmds.push(`moveTo ${x.toFixed(1)} ${y.toFixed(1)}`);
        },
        lineTo(x, y) {
          cmds.push(`lineTo ${x.toFixed(1)} ${y.toFixed(1)}`);
        },
      },
      100,
      80,
      20,
      0,
      Math.PI / 2,
    );
    expect(cmds[0]).toMatch(/^moveTo /);
    expect(cmds.slice(1).every((c) => c.startsWith('lineTo '))).toBe(true);
    expect(cmds.length).toBeGreaterThan(4);
  });
});
