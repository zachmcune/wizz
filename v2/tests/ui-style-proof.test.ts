// GUARDS ON THE UI STYLE PROOF PACK.
//
// `tests/ui-tokens.test.ts` enforces the style rules in SOURCE. This suite verifies the DELIVERABLES —
// that the thing Zachary will actually look at exists, is complete, and is not wrong in the ways a
// screenshot can be wrong:
//
//   • a shot is missing                      -> coverage check
//   • a shot is blank or one flat colour     -> drawn-pixel check
//   • a shot silently regressed to purple    -> rendered-pixel hue check
//   • the recording/gallery claims are hollow -> structural checks on the JSON reports
//
// The purple check is the important one. Enforcing it in CSS only proves the *stylesheets* are clean;
// it does not prove the RENDERED page is, because a canvas, an inline style or a browser default could
// still introduce violet. So the shots are inspected at the pixel level too.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';

const ROOT = join(__dirname, '..');
const PROOF = join(ROOT, 'docs/proof/ui-style');
const SHOTS = join(PROOF, 'screens');

const report = JSON.parse(readFileSync(join(PROOF, 'ui-proof.json'), 'utf8')) as {
  shots: {
    viewport: string;
    screen: string;
    density?: string;
    size: string;
    bytes: number;
    md5: string;
    drawnFraction?: number;
    purpleFraction?: number;
  }[];
  errors: string[];
  purple: { shot: string; purpleFraction: number }[];
};

const VIEWPORTS = ['phone-667x375', 'phone-844x390', 'chromebook-1366x768', 'desktop-1920x1080'];
const SCREENS = ['hud', 'lobby', 'menu'];

describe('ui style proof: coverage', () => {
  it('has a shot for every screen at every viewport', () => {
    for (const vp of VIEWPORTS) {
      for (const screen of SCREENS) {
        const file = join(SHOTS, `${vp}--${screen}.png`);
        expect(existsSync(file), `missing ${vp} / ${screen}`).toBe(true);
        expect(statSync(file).size, `${vp}/${screen} is too small to contain a screen`).toBeGreaterThan(8000);
      }
    }
  });

  it('has the style guide page at desktop and phone', () => {
    for (const f of ['styleguide-1920x1080.png', 'styleguide-667x375.png']) {
      const p = join(PROOF, f);
      expect(existsSync(p), `missing ${f}`).toBe(true);
      expect(statSync(p).size, `${f} too small`).toBeGreaterThan(60_000);
    }
  });

  it('records the density tier used for each viewport', () => {
    const expected: Record<string, string> = {
      'phone-667x375': 'compact',
      'phone-844x390': 'compact',
      'chromebook-1366x768': 'regular',
      'desktop-1920x1080': 'roomy',
    };
    for (const shot of report.shots.filter((s) => s.density)) {
      expect(shot.density, `${shot.viewport} used the wrong density`).toBe(expected[shot.viewport]);
    }
  });

  it('reports no page errors for any capture', () => {
    expect(report.errors, report.errors.join('; ')).toEqual([]);
  });
});

describe('ui style proof: every shot is unique and not blank', () => {
  it('no two shots are byte-identical', () => {
    const md5s = report.shots.map((s) => s.md5);
    const dupes = md5s.filter((h, i) => md5s.indexOf(h) !== i);
    expect([...new Set(dupes)], 'duplicate captures').toEqual([]);
  });

  it('every mockup shot drew a substantial amount of interface', async () => {
    for (const shot of report.shots.filter((s) => s.drawnFraction !== undefined)) {
      const file = join(SHOTS, `${shot.viewport}--${shot.screen}.png`);
      const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      // Count distinct 5-bit colour buckets: a blank or single-flat-colour screen collapses to a handful.
      const buckets = new Set<number>();
      for (let i = 0; i < info.width * info.height; i++) {
        const r = data[i * 4]! >> 3;
        const g = data[i * 4 + 1]! >> 3;
        const b = data[i * 4 + 2]! >> 3;
        buckets.add((r << 10) | (g << 5) | b);
      }
      expect(buckets.size, `${shot.viewport}/${shot.screen} has almost no visual variety`).toBeGreaterThan(12);
      expect(shot.drawnFraction, `${shot.viewport}/${shot.screen} is mostly empty`).toBeGreaterThan(0.05);
    }
  });
});

describe('ui style proof: no purple in the rendered interface', () => {
  it('the harness reported no purple violations', () => {
    expect(report.purple, JSON.stringify(report.purple)).toEqual([]);
  });

  it('every recorded purple fraction is below the threshold', () => {
    for (const shot of report.shots.filter((s) => s.purpleFraction !== undefined)) {
      expect(shot.purpleFraction, `${shot.viewport}/${shot.screen} has purple pixels`).toBeLessThanOrEqual(0.005);
    }
  });

  it('re-scanning the pixels directly finds no purple region', async () => {
    // Independent of what the harness recorded: re-scan the PNGs here, so a harness bug cannot hide a
    // violet interface.
    const offenders: string[] = [];
    for (const vp of VIEWPORTS) {
      for (const screen of SCREENS) {
        const file = join(SHOTS, `${vp}--${screen}.png`);
        const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
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
          // Violet/indigo: blue dominant, red present, green suppressed, and actually saturated.
          if (sat > 0.3 && b > g + 40 && r > g + 15) purple++;
        }
        const frac = purple / Math.max(1, opaque);
        if (frac > 0.005) offenders.push(`${vp}/${screen}: ${(frac * 100).toFixed(2)}% purple`);
      }
    }
    expect(offenders, offenders.join('; ')).toEqual([]);
  });
});

describe('ui style proof: the style guide is complete', () => {
  it('documents every section Zachary asked for', () => {
    const md = readFileSync(join(ROOT, 'docs/UI_STYLE_GUIDE.md'), 'utf8');
    // Palette, typefaces, panel and frame construction, button states, icon style, spacing scale,
    // motion rules, and per-viewport sizes.
    for (const heading of [
      '## 3. Palette',
      '## 4. Typefaces',
      '## 5. Panel construction',
      '## 6. Buttons',
      '## 7. Icons',
      '## 8. Spacing',
      '## 9. Motion',
      '## 10. Density tiers and target sizes',
      '## 11. Enforcement',
    ]) {
      expect(md.includes(heading), `style guide missing "${heading}"`).toBe(true);
    }
  });

  it('lists hex values for the whole palette', () => {
    const md = readFileSync(join(ROOT, 'docs/UI_STYLE_GUIDE.md'), 'utf8');
    const hexes = md.match(/#[0-9a-f]{6}/gi) ?? [];
    expect(hexes.length, 'style guide has too few documented hex values').toBeGreaterThan(20);
  });

  it('covers the team-colour separation requirement explicitly', () => {
    const md = readFileSync(join(ROOT, 'docs/UI_STYLE_GUIDE.md'), 'utf8');
    expect(md).toContain('content, never chrome');
    expect(md).toContain('Why copper does not collide with team gold');
  });
});

describe('ui style system: fonts are self-hosted', () => {
  it('ships every woff2 it references', () => {
    const fontsCss = readFileSync(join(ROOT, 'src/ui/fonts.css'), 'utf8');
    const urls = [...fontsCss.matchAll(/url\('([^']+)'\)/g)].map((m) => m[1]!);
    expect(urls.length, 'no font URLs found').toBeGreaterThanOrEqual(5);
    for (const u of urls) {
      // url('/fonts/x.woff2') -> public/fonts/x.woff2
      const rel = u.replace(/^\//, '');
      expect(existsSync(join(ROOT, 'public', rel)), `missing font file ${rel}`).toBe(true);
    }
  });

  it('does not reference any remote font host', () => {
    const fontsCss = readFileSync(join(ROOT, 'src/ui/fonts.css'), 'utf8');
    expect(fontsCss).not.toMatch(/https?:\/\//);
  });

  it('every @font-face declares a display strategy', () => {
    const fontsCss = readFileSync(join(ROOT, 'src/ui/fonts.css'), 'utf8');
    const faces = fontsCss.match(/@font-face\s*{[^}]*}/g) ?? [];
    expect(faces.length).toBeGreaterThanOrEqual(5);
    for (const f of faces) expect(f, 'font-face without font-display').toContain('font-display');
  });
});

describe('ui style proof: the deliverables are wired into the build', () => {
  it('registers the style guide and proof harness as Vite entries', () => {
    const cfg = readFileSync(join(ROOT, 'vite.config.ts'), 'utf8');
    expect(cfg, 'styleguide.html is not a build entry').toContain("styleguide: resolve(__dirname, 'styleguide.html')");
    expect(cfg, 'ui-proof.html is not a build entry').toContain("uiproof: resolve(__dirname, 'ui-proof.html')");
  });

  it('has the token file as the single source of palette values', () => {
    const tokens = readFileSync(join(ROOT, 'src/ui/tokens.css'), 'utf8');
    // The palette groups the guide documents must all exist.
    for (const group of ['--ink-950', '--bone-100', '--copper-500', '--signal-good', '--team-blue']) {
      expect(tokens, `token ${group} missing`).toContain(group);
    }
  });
});

describe('the CI workflow that verifies all of this', () => {
  // A workflow file with a YAML error fails the whole run with "This run likely failed because of a
  // workflow file issue" and NO jobs execute — which silently removes all coverage while looking like
  // an infrastructure hiccup. I hit exactly that: an unquoted `name:` value containing a colon.
  //
  // There is no YAML parser in this project's dependency tree, so this checks the specific structural
  // properties that matter rather than trying to reimplement YAML.
  const WF = join(ROOT, '..', '.github/workflows/ci.yml');

  it('exists and declares the v1 jobs plus a v2 job', () => {
    expect(existsSync(WF), 'CI workflow missing').toBe(true);
    const wf = readFileSync(WF, 'utf8');
    for (const job of ['quality:', 'slow:', 'e2e:', 'v2:']) {
      expect(wf, `CI workflow has no "${job}" job`).toContain(job);
    }
  });

  it('runs the v2 suite and build, not just the v1 root scripts', () => {
    const wf = readFileSync(WF, 'utf8');
    const v2 = wf.slice(wf.indexOf('\n  v2:'));
    // The CI job runs the perf gate alone first, then everything else — both count as "runs the tests".
    expect(
      v2.includes('npm test') || v2.includes('test:unit'),
      'v2 job does not run v2 tests',
    ).toBe(true);
    expect(v2, 'v2 job does not build v2').toContain('npm run build');
    expect(v2, 'v2 job does not set its working directory to v2').toContain('working-directory: v2');
  });

  it('has no unquoted step name containing a colon', () => {
    // This is the exact defect that broke the run: `- name: Lint (rules: ...)` parses as a mapping.
    const wf = readFileSync(WF, 'utf8');
    const offenders: string[] = [];
    for (const line of wf.split('\n')) {
      const m = line.match(/^\s*-\s*name:\s*(.+)$/);
      if (!m) continue;
      const value = m[1]!;
      if (value.startsWith('"') || value.startsWith("'")) continue;
      // An unquoted value containing ": " is a YAML mapping error.
      if (value.includes(': ')) offenders.push(value.trim());
    }
    expect(offenders, `unquoted step names containing a colon: ${offenders.join(' | ')}`).toEqual([]);
  });

  it('asserts the v2 build output contains every deployed entry', () => {
    const wf = readFileSync(WF, 'utf8');
    for (const entry of ['dist/index.html', 'dist/gallery.html', 'dist/styleguide.html', 'dist/ui-proof.html']) {
      expect(wf, `CI does not assert ${entry} exists in the build`).toContain(entry);
    }
  });
});
