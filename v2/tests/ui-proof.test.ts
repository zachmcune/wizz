// THE PHASE 7 UI PROOF PACK — guards on what a reviewer will actually look at.
//
// `tests/ui-style-proof.test.ts` guards the Phase 4 style pack. This file guards the Phase 7 COMMAND
// CONSOLE pack: the main menu, skirmish lobby, multiplayer lobby, in-match HUD and its interaction states,
// pause and settings, captured at five viewports.
//
// Every rule below corresponds to a way a screenshot can be WRONG while still being a file:
//
//   • the file is missing                          -> coverage check per viewport per screen
//   • the file is blank or one flat colour          -> distinct-colour-bucket count
//   • the file has regressed to violet              -> rendered-pixel hue scan, independently re-run
//   • the file is a stale duplicate of another      -> md5 uniqueness
//   • the numbers beside it describe another moment -> the recorded measurements are checked for internal
//                                                     consistency and against the layout contract
//   • the HUD claims a layout it does not have      -> `data-layout` must match the viewport's orientation
//   • a phone has no reachable build panel          -> every viewport must show 4 tabs, 8 commands, and a
//                                                     control it can actually tap
//
// The last two are the ones that matter: they are the reported defects, and they are checked from the
// numbers the harness measured at capture time rather than by eyeballing the images.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';

const ROOT = join(__dirname, '..');
const PROOF = join(ROOT, 'docs/proof/phase-7/ui');
const SHOTS = join(PROOF, 'screens');

interface Capture {
  file: string;
  viewport: string;
  screen: string;
  state: string;
  width: number;
  height: number;
  bytes: number;
  md5: string;
  buckets: number;
  purpleFraction: number;
  measured: Record<string, number | string | boolean>;
}

const report = JSON.parse(readFileSync(join(PROOF, 'ui-proof.json'), 'utf8')) as {
  generatedAt: string;
  viewports: string[];
  screens: string[];
  captures: Capture[];
  errors: string[];
};

const VIEWPORTS = ['phone-667x375', 'phone-844x390', 'phone-portrait-390x844', 'chromebook-1366x768', 'desktop-1920x1080'];
const SCREENS = ['menu', 'lobby', 'multiplayer', 'settings', 'match', 'pause', 'results', 'gallery'];

describe('phase 7 UI proof: coverage', () => {
  it('has a capture of every screen at every viewport', () => {
    const missing: string[] = [];
    for (const vp of VIEWPORTS) {
      for (const screen of SCREENS) {
        const file = join(SHOTS, `${vp}--${screen}.png`);
        if (!existsSync(file)) {
          missing.push(`${vp}/${screen}`);
          continue;
        }
        // 8 KB is well under any real screen and well over an empty PNG.
        if (statSync(file).size < 8_000) missing.push(`${vp}/${screen} (too small)`);
      }
    }
    expect(missing, `missing or empty captures: ${missing.join(', ')}`).toEqual([]);
  });

  it('has the in-match interaction states the brief asks for', () => {
    const need = [
      'selection',
      'tab-buildings',
      'tab-defenses',
      'tab-units',
      'tab-tech',
      'placement',
      'collapsed',
    ];
    const missing: string[] = [];
    for (const vp of VIEWPORTS) {
      for (const state of need) {
        const c = report.captures.find((x) => x.viewport === vp && x.state === state && x.screen === 'match');
        if (!c) missing.push(`${vp}/${state}`);
      }
    }
    expect(missing, `missing interaction captures: ${missing.join(', ')}`).toEqual([]);
  });

  it('records no page errors during any capture', () => {
    expect(report.errors, report.errors.join('; ')).toEqual([]);
  });

  it('covers exactly the five declared viewports', () => {
    const seen = [...new Set(report.captures.map((c) => c.viewport))].sort();
    expect(seen).toEqual([...VIEWPORTS].sort());
  });
});

describe('phase 7 UI proof: every capture is unique and not blank', () => {
  it('no two captures are byte-identical', () => {
    const seen = new Map<string, string>();
    const dupes: string[] = [];
    for (const c of report.captures) {
      const prev = seen.get(c.md5);
      if (prev) dupes.push(`${prev} == ${c.file}`);
      else seen.set(c.md5, c.file);
    }
    expect(dupes, `duplicate captures: ${dupes.join(', ')}`).toEqual([]);
  });

  it('every capture has real visual variety', async () => {
    const flat: string[] = [];
    for (const c of report.captures) {
      const file = join(PROOF, c.file);
      const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const buckets = new Set<number>();
      for (let i = 0; i < info.width * info.height; i++) {
        buckets.add(((data[i * 4]! >> 3) << 10) | ((data[i * 4 + 1]! >> 3) << 5) | (data[i * 4 + 2]! >> 3));
      }
      // 64 buckets is far below any real screen (measured 380-2370) and far above a blank one (1-3).
      if (buckets.size < 64) flat.push(`${c.file}: ${buckets.size} colours`);
    }
    expect(flat, flat.join('; ')).toEqual([]);
  });

  it('re-measures purple directly from the pixels, independently of the harness', async () => {
    /**
     * The harness records `purpleFraction`; this re-derives it from the PNGs so a harness bug cannot hide
     * a violet interface. The band is the same one `tests/art-no-purple.test.ts` uses for baked sprites:
     * blue dominant, red present, green suppressed, and actually saturated.
     */
    const offenders: string[] = [];
    for (const c of report.captures) {
      const { data, info } = await sharp(join(PROOF, c.file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      let opaque = 0;
      let purple = 0;
      for (let i = 0; i < info.width * info.height; i++) {
        if (data[i * 4 + 3]! < 200) continue;
        opaque++;
        const r = data[i * 4]!;
        const g = data[i * 4 + 1]!;
        const b = data[i * 4 + 2]!;
        const mx = Math.max(r, g, b);
        const mn = Math.min(r, g, b);
        const sat = mx === 0 ? 0 : (mx - mn) / mx;
        if (sat > 0.3 && b > g + 40 && r > g + 15) purple++;
      }
      const frac = purple / Math.max(1, opaque);
      if (frac > 0.005) offenders.push(`${c.file}: ${(frac * 100).toFixed(2)}% purple`);
    }
    expect(offenders, offenders.join('; ')).toEqual([]);
  });
});

describe('phase 7 UI proof: the HUD is a command console on every viewport', () => {
  /** The resting-state match capture per viewport. */
  const matchCaptures = report.captures.filter((c) => c.screen === 'match' && c.state === '');

  it('every viewport has a resting HUD capture', () => {
    expect(matchCaptures).toHaveLength(VIEWPORTS.length);
  });

  for (const vp of VIEWPORTS) {
    it(`${vp}: docked correctly, four tabs, eight commands, thumb-sized controls`, () => {
      const c = matchCaptures.find((x) => x.viewport === vp);
      expect(c, `${vp}: no HUD capture`).toBeTruthy();
      const m = c!.measured;
      const portrait = vp.includes('portrait');
      // The dock follows the orientation: a right sidebar in landscape, a bottom console in portrait.
      expect(m.layout, `${vp}: layout`).toBe(portrait ? 'bottom' : 'side');
      // The battlefield keeps its space at every orientation.
      expect(Number(m.battlefieldShare), `${vp}: battlefield share`).toBeGreaterThan(0.55);
      // Four real categories, eight labelled commands.
      expect(Number(m.tabs), `${vp}: category tabs`).toBe(4);
      expect(Number(m.commands), `${vp}: command buttons`).toBe(8);
      // Every control is at least 28px on its short side: a thumb, not a cursor.
      expect(Number(m.smallestControl), `${vp}: smallest control`).toBeGreaterThanOrEqual(28);
      // And controls exist to be tapped at all.
      expect(Number(m.controls), `${vp}: interactive controls found`).toBeGreaterThan(10);
      // The production grid has tiles on the default (Buildings) tab.
      expect(Number(m.tiles), `${vp}: production tiles`).toBeGreaterThan(0);
    });

    it(`${vp}: the starting frame centres the Sanctum in the battlefield`, () => {
      const c = matchCaptures.find((x) => x.viewport === vp);
      const m = c!.measured;
      const fx = Number(m.sanctumFx);
      const fy = Number(m.sanctumFy);
      // 0.5 is the centre of the safe rect. The portrait viewport clamps 0.10 high because the map's
      // diamond cannot be centred any other way there; measured 0.403.
      expect(fx, `${vp}: Sanctum across`).toBeGreaterThan(0.44);
      expect(fx, `${vp}: Sanctum across`).toBeLessThan(0.56);
      expect(fy, `${vp}: Sanctum down`).toBeGreaterThan(0.36);
      expect(fy, `${vp}: Sanctum down`).toBeLessThan(0.56);
      // And the battlefield is map, not backdrop.
      expect(Number(m.coverage), `${vp}: map coverage`).toBeGreaterThan(0.5);
      // The zoom is a real match zoom, not pinned at a limit.
      const zoom = Number(m.zoom);
      expect(zoom, `${vp}: zoom`).toBeGreaterThan(0.6);
      expect(zoom, `${vp}: zoom`).toBeLessThan(2);
    });
  }

  it('the portrait console starts collapsed, so the battlefield is not a letterbox', () => {
    const c = matchCaptures.find((x) => x.viewport === 'phone-portrait-390x844');
    expect(c!.measured.collapsed).toBe('true');
  });

  it('the landscape console starts expanded, where width is the cheap axis', () => {
    for (const vp of ['phone-667x375', 'phone-844x390', 'chromebook-1366x768', 'desktop-1920x1080']) {
      const c = matchCaptures.find((x) => x.viewport === vp);
      expect(c!.measured.collapsed, `${vp}: collapsed`).toBe('false');
    }
  });
});

describe('phase 7 UI proof: the build panel shows real content', () => {
  it('every category tab has production tiles', () => {
    const failures: string[] = [];
    for (const vp of VIEWPORTS) {
      for (const tab of ['buildings', 'defenses', 'units', 'tech']) {
        const c = report.captures.find((x) => x.viewport === vp && x.state === `tab-${tab}`);
        expect(c, `${vp}/${tab}: missing capture`).toBeTruthy();
        const tiles = Number(c!.measured.tiles);
        if (tiles <= 0) failures.push(`${vp}/${tab}: no tiles`);
      }
    }
    expect(failures, failures.join('; ')).toEqual([]);
  });

  it('build and unit tiles draw REAL atlas sprites, not placeholders', () => {
    /**
     * The whole point of the picture-first sidebar is that the thumbnail is the sprite. A tile that fell
     * back to a glyph would satisfy "there is a picture area" while defeating the design, so the harness
     * counts tiles that carry a resolved `data-thumb` frame key and this requires them to outnumber the
     * glyph fallbacks on the buildings and units tabs.
     */
    const failures: string[] = [];
    for (const vp of VIEWPORTS) {
      for (const tab of ['buildings', 'defenses', 'units']) {
        const c = report.captures.find((x) => x.viewport === vp && x.state === `tab-${tab}`);
        const thumbs = Number(c!.measured.realSpriteThumbs);
        const tiles = Number(c!.measured.tiles);
        if (thumbs < Math.ceil(tiles * 0.5)) {
          failures.push(`${vp}/${tab}: only ${thumbs}/${tiles} tiles have an atlas sprite`);
        }
      }
    }
    expect(failures, failures.join('; ')).toEqual([]);
  });

  it('the tech tab lists research, which has no sprite and uses a glyph', () => {
    const c = report.captures.find((x) => x.viewport === 'chromebook-1366x768' && x.state === 'tab-tech');
    expect(Number(c!.measured.tiles)).toBeGreaterThan(4);
    // Research is not an entity, so there is deliberately no atlas frame for it.
    expect(Number(c!.measured.realSpriteThumbs)).toBe(0);
  });
});

describe('phase 7 UI proof: the placement preview is reachable and valid', () => {
  it('every viewport reaches a placement ghost and it is legal', () => {
    /**
     * THE REPORTED FLOW. Pick a structure in the sidebar, see a placement preview, tap to place. The
     * harness arms placement by tapping the first affordable tile and moves the pointer over the
     * battlefield; the ghost must then exist AND be valid, because `startPlacement` searches for a legal
     * spot rather than dumping the ghost wherever the pointer was (over the sidebar, in the old build).
     */
    const failures: string[] = [];
    for (const vp of VIEWPORTS) {
      const c = report.captures.find((x) => x.viewport === vp && x.state === 'placement');
      expect(c, `${vp}: no placement capture`).toBeTruthy();
      const m = c!.measured;
      if (!m.ghostDef) failures.push(`${vp}: no ghost`);
      else if (m.ghostValid !== true) failures.push(`${vp}: ghost invalid (${String(m.ghostReason)})`);
    }
    expect(failures, failures.join('; ')).toEqual([]);
  });

  it('the ghost names a real building def', () => {
    const defs = new Set(
      ['attunement_spire', 'summoning_circle', 'ley_conduit', 'arcane_sentry', 'stone_wall', 'arcane_gate'],
    );
    for (const c of report.captures.filter((x) => x.state === 'placement')) {
      expect(defs.has(String(c.measured.ghostDef)), `${c.viewport}: ghost def ${String(c.measured.ghostDef)}`).toBe(true);
    }
  });
});

describe('phase 7 UI proof: the selection readout is populated', () => {
  it('selecting units puts a count in the HUD', () => {
    for (const vp of VIEWPORTS) {
      const c = report.captures.find((x) => x.viewport === vp && x.state === 'selection');
      expect(c, `${vp}: no selection capture`).toBeTruthy();
      expect(Number(c!.measured.selectedUnits), `${vp}: units selected`).toBeGreaterThan(0);
    }
  });
});

describe('phase 7 UI proof: the pack is self-describing', () => {
  it('records when it was generated and against which base URL', () => {
    expect(report.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(report.viewports).toEqual(VIEWPORTS);
    expect(report.screens).toEqual(SCREENS);
  });

  it('every capture records the viewport it was taken at', () => {
    /**
     * The viewport names are `<device>-<w>x<h>` and `<device>-<orientation>-<w>x<h>`, so the SIZE is always
     * the last `x`-separated pair in the name — not the first pair after stripping the device prefix, which
     * is what an earlier version did and which parsed "phone-portrait-390x844" as NaN.
     */
    for (const c of report.captures) {
      const m = c.viewport.match(/(\d+)x(\d+)$/);
      expect(m, `${c.file}: viewport name "${c.viewport}" has no size`).not.toBeNull();
      expect(c.width, `${c.file}: width`).toBe(Number(m![1]));
      expect(c.height, `${c.file}: height`).toBe(Number(m![2]));
    }
  });

  it('has a README that names the pack and how to regenerate it', () => {
    const readme = join(PROOF, 'README.md');
    expect(existsSync(readme), 'the proof pack has no README').toBe(true);
    const text = readFileSync(readme, 'utf8');
    expect(text).toContain('capture-ui-proof');
    expect(text).toContain('ui-proof.json');
  });
});
