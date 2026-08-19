import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const hudCss = readFileSync(new URL('../src/ui/styles/hud.css', import.meta.url), 'utf8');
const lobbyCss = readFileSync(new URL('../src/ui/styles/lobby.css', import.meta.url), 'utf8');

/** Return the first declaration block whose selector list includes `selector`. */
function rule(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(
    new RegExp(`[^/{]*${escaped}\\s*(?:,[^{]+)?\\{[^}]+\\}`),
  );
  if (!match) throw new Error(`missing CSS rule for ${selector}`);
  return match[0];
}

describe('HUD command card mobile scroll', () => {
  it('makes the command card a touch target so it can scroll on mobile', () => {
    expect(rule(hudCss, '.hud .cmd-card')).toMatch(/pointer-events:\s*auto/);
    expect(rule(hudCss, '\n.cmd-card')).toMatch(/overflow-y:\s*auto/);
    expect(rule(hudCss, '\n.cmd-card')).toMatch(/touch-action:\s*pan-y/);
  });

  it('keeps the build list’s full height so the card, not a clipped child, scrolls', () => {
    const layout = rule(hudCss, '.cmd-card > .cmd-card-layout');
    expect(layout).toMatch(/flex-shrink:\s*0/);
    expect(layout).not.toMatch(/min-height:\s*0/);
  });

  it('uses a single scroll container on compact phones instead of nested command-row overflow', () => {
    expect(rule(lobbyCss, '.compact-ui .command-row')).toMatch(/overflow-y:\s*visible/);
    expect(rule(lobbyCss, '.compact-ui .command-row')).toMatch(/max-height:\s*none/);
  });

  it('allows vertical pan on build controls and category chips', () => {
    expect(hudCss).toMatch(/\.hud-scroll \.build-btn/);
    expect(rule(hudCss, '.cmd-card .category-chip')).toMatch(/touch-action:\s*pan-x pan-y/);
    expect(rule(hudCss, '.category-chips-scroll')).toMatch(/touch-action:\s*pan-x pan-y/);
  });
});
