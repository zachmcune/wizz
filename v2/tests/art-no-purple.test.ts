// NO PURPLE IN THE BAKED SPRITES.
//
// Zachary, reviewing head 277a26d: "The bigger buildings now show a lot of bright violet and lilac (the sanctum tiers, the
// scrying obelisk, attunement, nexus and others), which reads as the 'purple AI slop' look Zachary rejects."
//
// The UI has had a no-purple rule since the style pass, but it only inspected CSS tokens — the ART was never checked, so
// the same hue crept back in through the palette used by `art/palette2.ts`. This suite closes that gap at the pixel level:
// it measures, in the baked sprite, what share of visible pixels fall in the violet/magenta hue band.
//
// The band is 250-330 degrees, the same one `ui-tokens.test.ts` bans, so one definition governs both chrome and art.
//
// The threshold is 2% per sprite. That is tight enough to forbid a violet body or a lilac robe while leaving room for a
// small arcane accent — a rune glint, an eye, a crystal tip — which is what "restrained" means here.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const ROOT = join(__dirname, '..');
const ATLAS = join(ROOT, 'public/atlas-final');

/**
 * The banned hue band, in degrees.
 *
 * 250-330 is violet through magenta. It is deliberately the same range the UI token test uses: the style guide bans the
 * hue, not a particular CSS file.
 */
const PURPLE_MIN = 250;
const PURPLE_MAX = 330;

/** Maximum share of a sprite's visible pixels that may sit in the banned band. */
const MAX_PURPLE_SHARE = 0.02;

/**
 * A pixel counts as violet only when it has real CHROMA.
 *
 * HSL saturation is unreliable at the extremes of lightness: `rgb(254,250,255)` is essentially white, yet its saturation
 * computes as 1.0 because the denominator `(1 - |2L-1|)` collapses to 0.02. An early version of this test therefore
 * flagged every emissive white highlight as "violet" and reported 47% for the wisp's glowing core.
 *
 * So the test uses absolute chroma — `max - min` in 0..1 — which is what the eye judges. A near-white highlight has
 * chroma around 0.02 and is correctly ignored; a lilac robe has chroma above 0.15 and is caught.
 */
const MIN_CHROMA = 0.12;
const MIN_LIGHTNESS = 0.12;

function hueOf(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1) || 1);
  let hue: number;
  if (max === rn) hue = ((gn - bn) / d) % 6;
  else if (max === gn) hue = (bn - rn) / d + 2;
  else hue = (rn - gn) / d + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  return { h: hue, s, l };
}

function isPurple(r: number, g: number, b: number): boolean {
  const { h, l } = hueOf(r, g, b);
  const chroma = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
  return h >= PURPLE_MIN && h <= PURPLE_MAX && chroma >= MIN_CHROMA && l >= MIN_LIGHTNESS;
}

interface SpriteStats {
  /** Visible (opaque) pixels examined. */
  visible: number;
  /** Visible pixels in the violet band. */
  purple: number;
  share: number;
  /** The most-saturated violet pixel found, for a useful failure message. */
  worst: { r: number; g: number; b: number; h: number; s: number } | null;
}

const pageCache = new Map<number, { data: Buffer; width: number; channels: number }>();

async function statsFor(
  atlas: 'units' | 'buildings',
  key: string,
): Promise<SpriteStats> {
  const man = JSON.parse(readFileSync(join(ATLAS, `${atlas}.json`), 'utf8')) as {
    pages: { file: string }[];
    frames: Record<string, { page: number; x: number; y: number; w: number; h: number }>;
  };
  const f = man.frames[key];
  if (!f) throw new Error(`no frame ${key}`);
  const pageFile = man.pages[f.page]!.file;
  let page = pageCache.get(-1 - f.page);
  if (!page || page.width === 0) {
    const { data, info } = await sharp(join(ATLAS, pageFile))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    page = { data, width: info.width, channels: info.channels };
    pageCache.set(-1 - f.page, page);
  }
  let visible = 0;
  let purple = 0;
  let worst: SpriteStats['worst'] = null;
  for (let y = f.y; y < f.y + f.h; y++) {
    for (let x = f.x; x < f.x + f.w; x++) {
      const i = (y * page.width + x) * page.channels;
      if (page.data[i + 3]! <= 200) continue;
      visible++;
      const r = page.data[i]!;
      const g = page.data[i + 1]!;
      const b = page.data[i + 2]!;
      if (!isPurple(r, g, b)) continue;
      purple++;
      const { h } = hueOf(r, g, b);
      const chroma = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
      if (!worst || chroma > worst.s) worst = { r, g, b, h: Math.round(h), s: Number(chroma.toFixed(2)) };
    }
  }
  return { visible, purple, share: visible === 0 ? 0 : purple / visible, worst };
}

function buildingIds(): string[] {
  return readdirSync(join(ROOT, 'data/buildings'))
    .map((f) => (JSON.parse(readFileSync(join(ROOT, 'data/buildings', f), 'utf8')) as { id: string }).id)
    .sort();
}

function unitIds(): string[] {
  return readdirSync(join(ROOT, 'data/units'))
    .map((f) => (JSON.parse(readFileSync(join(ROOT, 'data/units', f), 'utf8')) as { id: string }).id)
    .sort();
}

describe('no purple in the baked sprites', () => {
  it.each(buildingIds())('%s: building sprite is free of violet', async (id) => {
    /**
     * Measured on 277a26d's art this fails a large part of the roster — the sanctum, scrying obelisk, attunement spire and
     * arcane nexus were all built from `PAL.violet`, `PAL.violetLit` and `PAL.violetDeep`, which sit squarely in the banned
     * band. That is the "purple AI slop" look in the report.
     */
    const s = await statsFor('buildings', `building/${id}/blue/0`);
    expect(s.visible, `${id}: sprite is empty, the ratio is not measurable`).toBeGreaterThan(32);
    const detail = s.worst
      ? `worst pixel rgb(${s.worst.r},${s.worst.g},${s.worst.b}) hue ${s.worst.h}, chroma ${s.worst.s}`
      : 'none';
    expect(
      s.share,
      `${id}: ${(s.share * 100).toFixed(1)}% of its visible pixels are violet/magenta (limit ${MAX_PURPLE_SHARE * 100}%) — ${detail}`,
    ).toBeLessThanOrEqual(MAX_PURPLE_SHARE);
  });

  it.each(unitIds())('%s: unit sprite is free of violet', async (id) => {
    // The robe palette used the same violet family, so units are held to the same rule.
    const s = await statsFor('units', `unit/${id}/blue/0`);
    expect(s.visible, `${id}: sprite is empty`).toBeGreaterThan(32);
    const detail = s.worst
      ? `worst pixel rgb(${s.worst.r},${s.worst.g},${s.worst.b}) hue ${s.worst.h}, chroma ${s.worst.s}`
      : 'none';
    expect(
      s.share,
      `${id}: ${(s.share * 100).toFixed(1)}% of its visible pixels are violet/magenta (limit ${MAX_PURPLE_SHARE * 100}%) — ${detail}`,
    ).toBeLessThanOrEqual(MAX_PURPLE_SHARE);
  });
});
