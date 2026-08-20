import { describe, expect, it } from 'vitest';
// @ts-expect-error Vitest runs in Node; the app tsconfig has no @types/node.
import { readFileSync } from 'node:fs';
import { isCompactUiSize } from '../src/ui/viewport';

const lobbyCss = readFileSync(new URL('../src/ui/styles/lobby.css', import.meta.url), 'utf8');

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  const match = lobbyCss.match(new RegExp(`${escaped}\\s*\\{[^}]+\\}`));
  expect(match, `missing CSS rule for ${selector}`).toBeTruthy();
  return match![0];
}

describe('compact-ui breakpoint', () => {
  it('turns on for Phone SE and iPhone 14 landscape, off for Chromebook/desktop', () => {
    expect(isCompactUiSize(667, 375)).toBe(true);
    expect(isCompactUiSize(844, 390)).toBe(true);
    expect(isCompactUiSize(1024, 768)).toBe(false);
    expect(isCompactUiSize(1366, 768)).toBe(false);
    expect(isCompactUiSize(1280, 800)).toBe(false);
    expect(isCompactUiSize(1920, 1080)).toBe(false);
  });
});

describe('compact-ui CSS contracts', () => {
  it('gives lobby player selects enough width for Human and Normal', () => {
    const selects = rule('.lobby-kind-select, .lobby-ai-select');
    expect(selects).toMatch(/min-width:\s*9em/);
    expect(selects).toMatch(/flex:\s*0 0 auto/);
    expect(selects).not.toMatch(/min-width:\s*64px/);
  });

  it('pins the lobby footer and scrolls the setup body on compact phones', () => {
    expect(rule('.compact-ui .match-lobby')).toMatch(/overflow:\s*hidden/);
    expect(rule('.compact-ui .lobby-main')).toMatch(/overflow-y:\s*auto/);
    expect(rule('.compact-ui .lobby-footer')).toMatch(/flex:\s*0 0 auto/);
  });

  it('keeps the graphics toast out of the selection/build column', () => {
    const banner = rule('.compact-ui .hint-banner');
    expect(banner).toMatch(/transform:\s*none/);
    expect(banner).toMatch(/min\(50vw,\s*252px\)/);
    expect(banner).toMatch(/var\(--hud-gap\) \* 5/);
    expect(lobbyCss).toMatch(/\.compact-ui \.hud:has\(\.minimap-offline\) \.hint-banner/);
  });

  it('lets Buildings / Defenses / Advanced shrink or wrap instead of clipping', () => {
    const scroll = rule('.compact-ui .category-chips-scroll');
    expect(scroll).toMatch(/flex-wrap:\s*wrap/);
    const chip = rule('.compact-ui .category-chip');
    expect(chip).toMatch(/flex:\s*1 1 auto/);
    expect(chip).toMatch(/min-width:\s*min-content/);
    expect(chip).not.toMatch(/padding:\s*8px 12px/);
  });

  it('makes the settings sheet scroll so every control is reachable', () => {
    const screen = rule('.compact-ui .settings-screen');
    expect(screen).toMatch(/justify-content:\s*flex-start/);
    expect(screen).toMatch(/overflow-y:\s*auto/);
    expect(rule('.compact-ui .settings-card')).toMatch(/flex-shrink:\s*0/);
    expect(rule('.compact-ui .settings-hint')).toMatch(/display:\s*none/);
  });

  it('shrinks the lobby coach so player rows are not pushed off-screen', () => {
    expect(rule('.compact-ui .match-lobby .coach-card')).toMatch(/padding:\s*6px 8px/);
    expect(rule('.compact-ui .match-lobby .coach-got-it, .compact-ui .match-lobby .coach-skip')).toMatch(
      /min-height:\s*28px/,
    );
  });

  it('insets the zoom slider from the left bezel', () => {
    expect(rule('.compact-ui .zoom-slider')).toMatch(/left:\s*14px/);
  });
});
