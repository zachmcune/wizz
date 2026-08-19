// @ts-expect-error Vitest runs in Node; the app tsconfig has no @types/node.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const hudCss = readFileSync(new URL('../src/ui/styles/hud.css', import.meta.url), 'utf8');
const lobbyCss = readFileSync(new URL('../src/ui/styles/lobby.css', import.meta.url), 'utf8');

describe('HUD command card mobile scroll', () => {
  it('makes the command card a touch target so it can scroll on mobile', () => {
    expect(hudCss).toMatch(/\.hud \.cmd-card\s*\{\s*pointer-events:\s*auto/);
    expect(hudCss).toMatch(/^\.cmd-card\s*\{[^}]*overflow-y:\s*auto/m);
    expect(hudCss).toMatch(/^\.cmd-card\s*\{[^}]*touch-action:\s*pan-y/m);
  });

  it('keeps the build list’s full height so the card, not a clipped child, scrolls', () => {
    const layout = hudCss.match(/\.cmd-card > \.cmd-card-layout\s*\{[^}]+\}/)?.[0];
    expect(layout).toBeTruthy();
    expect(layout).toMatch(/flex-shrink:\s*0/);
    expect(layout).not.toMatch(/min-height:\s*0/);
  });

  it('uses a single scroll container on compact phones instead of nested command-row overflow', () => {
    expect(lobbyCss).toMatch(/\.compact-ui \.command-row\s*\{[^}]*overflow-y:\s*visible/s);
    expect(lobbyCss).toMatch(/\.compact-ui \.command-row\s*\{[^}]*max-height:\s*none/s);
  });

  it('allows vertical pan on build controls and category chips', () => {
    expect(hudCss).toMatch(/\.hud-scroll \.build-btn/);
    expect(hudCss).toMatch(/\.cmd-card \.category-chip,\s*\.cmd-card \.category-chips-scroll\s*\{\s*touch-action:\s*pan-x pan-y/);
  });
});
