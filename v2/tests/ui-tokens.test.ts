// GUARDS ON THE UI STYLE SYSTEM.
//
// Zachary's requirement was "no generic AI-app look" and "come up with a solid style and stick with it".
// A style guide that lives only in a markdown file is not enforceable — the next component will drift.
// These tests make the style a build gate:
//
//   1. NO HARD-CODED COLOURS outside the tokens file. Every colour literal in UI source must be a
//      `var(--token)`. This is what prevents fourteen slightly-different greys appearing over time.
//   2. NO PURPLE-RANGE HUE in UI chrome. Hue 250–330 is banned outright. This is the specific thing
//      that made the old UI look generated, so it is checked by parsing every colour literal that
//      does exist and converting it to HSL.
//   3. NO BANNED PATTERNS: backdrop blur (glassmorphism), border-radius above 2px (pills), large
//      ambient box-shadows (soft float), emoji in UI source, and webfont CDN URLs.
//   4. The token file itself must be internally consistent: every `var(--x)` referenced in a component
//      must be declared in tokens.css.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ICONS, ICON_NAMES, ICON_STROKE, icon } from '../src/ui/icons';

const ROOT = join(__dirname, '..');
const UI = join(ROOT, 'src/ui');
const TOKENS = readFileSync(join(UI, 'tokens.css'), 'utf8');

/** UI source files that are subject to the style rules. */
function uiSources(): { name: string; text: string }[] {
  const out: { name: string; text: string }[] = [];
  for (const f of readdirSync(UI)) {
    if (f.endsWith('.css') && f !== 'tokens.css') out.push({ name: f, text: readFileSync(join(UI, f), 'utf8') });
    if (f.endsWith('.ts')) out.push({ name: f, text: readFileSync(join(UI, f), 'utf8') });
  }
  // The style-sheet page and the mockups are UI too.
  for (const extra of ['styleguide.html', 'src/styleguide.ts', 'src/ui-mockups.ts']) {
    const p = join(ROOT, extra);
    if (existsSync(p)) out.push({ name: extra, text: readFileSync(p, 'utf8') });
  }
  return out;
}

/** Strip comments so documentation examples do not trip the colour scan. */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

/** Every colour literal: #rgb, #rrggbb, #rrggbbaa, rgb(), rgba(), hsl(), hsla(). */
const COLOR_RE = /(#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\))/g;

function colourLiterals(text: string): string[] {
  const clean = stripComments(text);
  const found = clean.match(COLOR_RE) ?? [];
  // `rgba(0,0,0,...)` used purely as a shadow tint is allowed via tokens only, so no carve-outs.
  return found;
}

/** Parse a colour literal to HSL. Returns null for literals we cannot parse (e.g. `currentColor`). */
function toHsl(lit: string): { h: number; s: number; l: number } | null {
  const hex = lit.trim();
  if (hex.startsWith('#')) {
    let r: number;
    let g: number;
    let b: number;
    const h = hex.slice(1);
    if (h.length === 3) {
      r = parseInt(h[0]! + h[0]!, 16);
      g = parseInt(h[1]! + h[1]!, 16);
      b = parseInt(h[2]! + h[2]!, 16);
    } else if (h.length === 6 || h.length === 8) {
      r = parseInt(h.slice(0, 2), 16);
      g = parseInt(h.slice(2, 4), 16);
      b = parseInt(h.slice(4, 6), 16);
    } else {
      return null;
    }
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;
    const d = max - min;
    if (d === 0) return { h: 0, s: 0, l };
    const s = d / (1 - Math.abs(2 * l - 1));
    let hue: number;
    if (max === rn) hue = ((gn - bn) / d) % 6;
    else if (max === gn) hue = (bn - rn) / d + 2;
    else hue = (rn - gn) / d + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
    return { h: hue, s, l };
  }
  const m = lit.match(/hsla?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)%\s*[, ]\s*([\d.]+)%/i);
  if (m) return { h: Number(m[1]), s: Number(m[2]) / 100, l: Number(m[3]) / 100 };
  const rgb = lit.match(/rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)/i);
  if (rgb) {
    const r = Number(rgb[1]) / 255;
    const g = Number(rgb[2]) / 255;
    const b = Number(rgb[3]) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    if (d === 0) return { h: 0, s: 0, l };
    const s = d / (1 - Math.abs(2 * l - 1));
    let hue: number;
    if (max === r) hue = ((g - b) / d) % 6;
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
    return { h: hue, s, l };
  }
  return null;
}

/** The banned band. 250–330 is violet/indigo/purple. */
const PURPLE_MIN = 250;
const PURPLE_MAX = 330;

describe('UI style: every colour comes from the token file', () => {
  it('no component file contains a colour literal', () => {
    const offenders: string[] = [];
    for (const { name, text } of uiSources()) {
      let lits = colourLiterals(text);
      // ONE documented exception: `<meta name="theme-color">` is consumed by the browser chrome and
      // cannot reference a CSS custom property, so the value must be inlined. It is pinned to the same
      // value as --ink-950 and checked by the assertion below, so it cannot silently drift.
      if (name.endsWith('.html')) {
        // Remove exactly the theme-color value (which the assertion below pins to --ink-950), then
        // re-scan: any OTHER colour in the HTML still fails.
        const themeVal = text.match(/name="theme-color"\s+content="(#[0-9a-fA-F]{6})"/)?.[1];
        if (themeVal) lits = lits.filter((l) => l.toLowerCase() !== themeVal.toLowerCase());
      }
      if (lits.length) offenders.push(`${name}: ${[...new Set(lits)].slice(0, 6).join(', ')}`);
    }
    expect(offenders, `hard-coded colours outside tokens.css:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('the HTML theme-color matches --ink-950', () => {
    // The one place a colour must be literal, so it is asserted equal to the token it mirrors.
    const html = readFileSync(join(ROOT, 'styleguide.html'), 'utf8');
    const m = html.match(/name="theme-color"\s+content="(#[0-9a-fA-F]{6})"/);
    expect(m, 'theme-color meta not found').not.toBeNull();
    const ink950 = TOKENS.match(/--ink-950:\s*(#[0-9a-fA-F]{6})/);
    expect(ink950, '--ink-950 not declared').not.toBeNull();
    expect(m![1]!.toLowerCase()).toBe(ink950![1]!.toLowerCase());
  });

  it('every var(--token) used in a component is declared somewhere in the UI sources', () => {
    // Declarations may live in tokens.css (palette, scale, motion) or, for per-variant overrides, in the
    // component file that defines the variant. What is NOT allowed is consuming an undeclared variable.
    const declared = new Set<string>();
    for (const src of [TOKENS, ...uiSources().map((s) => s.text)]) {
      for (const m of src.matchAll(/(--[a-z0-9-]+)\s*:/g)) declared.add(m[1]!);
    }
    const missing: string[] = [];
    for (const { name, text } of uiSources()) {
      const clean = stripComments(text);
      for (const m of clean.matchAll(/var\((--[a-z0-9-]+)/g)) {
        const token = m[1]!;
        // A template-literal token such as `var(--team-${team})` is scanned as the prefix `--team-`.
        // Resolve it by prefix match against real declarations, so a typo'd prefix still fails while a
        // legitimate dynamic token passes.
        // `var(${token})` in a template literal scans as `var(--token)`: a variable NAME, not a token.
        if (token === '--token') continue;
        const isDynamicPrefix = token.endsWith('-') && [...declared].some((d) => d.startsWith(token));
        if (token.endsWith('-')) {
          if (!isDynamicPrefix) missing.push(`${name} -> ${token}* (no declaration matches this prefix)`);
          continue;
        }
        if (!declared.has(token)) missing.push(`${name} -> ${token}`);
      }
    }
    expect([...new Set(missing)], `undeclared tokens:\n${[...new Set(missing)].join('\n')}`).toEqual([]);
  });
});

describe('UI style: no purple in the interface', () => {
  it('the token file contains no purple-range hue', () => {
    const offenders: string[] = [];
    for (const lit of colourLiterals(TOKENS)) {
      const hsl = toHsl(lit);
      if (!hsl) continue;
      // Only saturated colours can read as "purple". Greys are exempt by definition.
      if (hsl.s > 0.15 && hsl.h >= PURPLE_MIN && hsl.h <= PURPLE_MAX) {
        offenders.push(`${lit} (hue ${hsl.h.toFixed(0)}, sat ${(hsl.s * 100).toFixed(0)}%)`);
      }
    }
    expect(offenders, `purple-range hues in the token palette:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('the team colours are NOT purple, so nothing in the UI can be mistaken for a team', () => {
    // Team colours are also declared in the tokens file and must stay in their known bands.
    // Red sits at hue 0, which is the same place as 360 — the band is expressed as a wrap so a
    // literal 0 does not read as "out of range".
    const teams: Record<string, [number, number]> = {
      '--team-blue': [190, 240],
      '--team-red': [345, 360],
      '--team-green': [120, 165],
      '--team-gold': [35, 55],
    };
    for (const [token, [lo, hi]] of Object.entries(teams)) {
      const m = TOKENS.match(new RegExp(`${token}\\s*:\\s*(#[0-9a-fA-F]{6})`));
      expect(m, `${token} not declared`).not.toBeNull();
      const hsl = toHsl(m![1]!);
      expect(hsl).not.toBeNull();
      const h = hsl!.h;
      // Normalise a hue of 0 to 360 so the red band [345,360] accepts it.
      const norm = h === 0 ? 360 : h;
      const inBand = lo <= norm && norm <= hi;
      expect(inBand, `${token} hue ${h.toFixed(0)} outside ${lo}-${hi}`).toBe(true);
    }
  });
});

describe('UI style: banned patterns', () => {
  it('no backdrop blur anywhere (glassmorphism)', () => {
    const offenders = uiSources()
      .filter(({ text }) => /backdrop-filter|backdrop-blur/i.test(stripComments(text)))
      .map(({ name }) => name);
    expect(offenders, `backdrop blur in: ${offenders.join(', ')}`).toEqual([]);
  });

  it('no border-radius above the 2px hairline', () => {
    const offenders: string[] = [];
    for (const { name, text } of uiSources()) {
      for (const m of stripComments(text).matchAll(/border-radius\s*:\s*([^;]+);/g)) {
        const value = m[1]!.trim();
        if (value.startsWith('var(')) {
          // Only the declared hairline radius tokens are permitted.
          if (!/--radius-(none|hair)/.test(value)) offenders.push(`${name}: ${value}`);
          continue;
        }
        const px = Number(value.replace('px', ''));
        if (!Number.isFinite(px) || px > 2) offenders.push(`${name}: ${value}`);
      }
    }
    expect(offenders, `rounded corners (pill UI): ${offenders.join(', ')}`).toEqual([]);
  });

  it('no large ambient box-shadows (soft float)', () => {
    const offenders: string[] = [];
    for (const { name, text } of uiSources()) {
      for (const m of stripComments(text).matchAll(/box-shadow\s*:\s*([^;]+);/g)) {
        const value = m[1]!;
        // A blur radius above 24px with non-trivial alpha is the "floating card" tell.
        for (const shadow of value.split(',')) {
          const nums = shadow.match(/(-?\d+(?:\.\d+)?)px/g)?.map((n) => Math.abs(parseFloat(n))) ?? [];
          if (nums.length >= 3) {
            const blur = nums[2]!;
            if (blur > 24) offenders.push(`${name}: blur ${blur}px`);
          }
        }
      }
    }
    expect(offenders, `soft ambient shadows: ${offenders.join(', ')}`).toEqual([]);
  });

  it('no emoji in UI source', () => {
    // Emoji are the single most obvious "AI generated app" tell. The variation selector (FE0F) is
    // deliberately excluded from this class to avoid a combined-character false positive; the emoji
    // blocks themselves are what matter.
    const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2700}-\u{27BF}]/u;
    const offenders = uiSources()
      .filter(({ text }) => EMOJI.test(stripComments(text)))
      .map(({ name }) => name);
    expect(offenders, `emoji in: ${offenders.join(', ')}`).toEqual([]);
  });

  it('no webfont CDN', () => {
    const offenders = uiSources()
      .filter(({ text }) => /fonts\.(googleapis|gstatic)\.com|use\.typekit|cdn\..*font/i.test(text))
      .map(({ name }) => name);
    expect(offenders, `remote font in: ${offenders.join(', ')}`).toEqual([]);
  });
});

describe('UI icons: one stroke and fill rule', () => {
  it('has a working icon set', () => {
    expect(ICON_NAMES.length).toBeGreaterThan(20);
    expect(ICON_STROKE).toBe(2);
  });

  it('every icon renders a 24x24 viewBox with the shared stroke width', () => {
    for (const name of ICON_NAMES) {
      const svg = icon(name, { size: 16 });
      expect(svg, `${name} viewBox`).toContain('viewBox="0 0 24 24"');
      expect(svg, `${name} stroke width`).toContain(`stroke-width="${ICON_STROKE}"`);
      expect(svg, `${name} caps`).toContain('stroke-linecap="round"');
      expect(svg, `${name} joins`).toContain('stroke-linejoin="round"');
      expect(svg, `${name} not filled by default`).toContain('fill="none"');
    }
  });

  it('only marked icons use fill, and always as a 22% accent under the stroke', () => {
    for (const name of ICON_NAMES) {
      const svg = icon(name);
      const filled = svg.includes('fill-opacity="0.22"');
      if (ICONS[name]!.fill) {
        expect(filled, `${name} is marked fill but does not render a fill`).toBe(true);
      } else {
        expect(filled, `${name} is not marked fill but renders one`).toBe(false);
      }
    }
  });

  it('icon paths are plain geometry, not images or emoji', () => {
    for (const name of ICON_NAMES) {
      const d = ICONS[name]!.d;
      expect(d.length, `${name} path too short`).toBeGreaterThan(8);
      expect(d, `${name} must not embed an image`).not.toMatch(/href|<image/i);
      expect(d, `${name} path commands only`).toMatch(/^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]+$/);
    }
  });
});
