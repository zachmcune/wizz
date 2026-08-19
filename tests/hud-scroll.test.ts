// @ts-expect-error Vitest runs in Node; the app tsconfig has no @types/node.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const hudCss = readFileSync(new URL('../src/ui/styles/hud.css', import.meta.url), 'utf8');
const lobbyCss = readFileSync(new URL('../src/ui/styles/lobby.css', import.meta.url), 'utf8');

describe('HUD command card mobile scroll', () => {
  it('makes the command card a touch target so it can scroll on mobile', () => {
    expect(hudCss).toMatch(/\.hud \.cmd-card(?:,|\s*\{)/);
    expect(hudCss).toMatch(/^\.cmd-card\s*\{[^}]*overflow-y:\s*auto/m);
    expect(hudCss).toMatch(/^\.cmd-card\s*\{[^}]*touch-action:\s*pan-y/m);
  });

  it('makes the pause overlay a modal hit target above HUD chrome and the zoom slider', () => {
    expect(hudCss).toMatch(/\.hud \.pause-overlay(?:,|\s*\{)/);
    expect(hudCss).toMatch(/\.hud\.paused\s*\{[^}]*z-index:\s*30/s);
    expect(hudCss).toMatch(/^\.pause-overlay\s*\{[^}]*pointer-events:\s*auto/m);
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
    expect(hudCss).toMatch(/\.hud-scroll \.build-info-btn/);
    expect(hudCss).toMatch(/\.cmd-card \.category-chip,\s*\.cmd-card \.category-chips-scroll\s*\{\s*touch-action:\s*pan-x pan-y/);
  });

  it('styles a build-tab inspect card for hover and tap details', () => {
    expect(hudCss).toMatch(/^\.build-inspect\s*\{/m);
    expect(hudCss).toMatch(/^\.build-req\.missing\s*\{/m);
    expect(hudCss).toMatch(/^\.build-info-btn\s*\{/m);
  });

  it('reserves a fixed-size inspect card so the build list does not jump', () => {
    const card = hudCss.match(/^\.build-inspect\s*\{[^}]+\}/m)?.[0];
    expect(card).toBeTruthy();
    expect(card).toMatch(/height:\s*152px/);
    expect(card).toMatch(/min-height:\s*152px/);
    expect(card).toMatch(/max-height:\s*152px/);
    expect(card).toMatch(/flex-shrink:\s*0/);
    expect(card).toMatch(/overflow:\s*hidden/);
    expect(hudCss).toMatch(/^\.build-inspect-details\s*\{[^}]*overflow-y:\s*auto/m);
    const compact = lobbyCss.match(/\.compact-ui \.build-inspect\s*\{[^}]+\}/)?.[0];
    expect(compact).toBeTruthy();
    expect(compact).toMatch(/height:\s*128px/);
    expect(compact).toMatch(/min-height:\s*128px/);
    expect(compact).toMatch(/max-height:\s*128px/);
  });

  it('styles a minimap hint so radar gating is readable when the canvas is offline', () => {
    expect(hudCss).toMatch(/^\.minimap-hint\s*\{/m);
    expect(hudCss).toMatch(/\.minimap-panel\.minimap-offline \.minimap-hint/);
    expect(hudCss).toMatch(/\.minimap-panel\.minimap-offline \.minimap-canvas/);
  });
});
