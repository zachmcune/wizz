// EXPANSION CAPTURE — the widest footprint a side actually holds, framed together, with live counts.
//
// STEP 0(d) of the Phase 6 brief asks for an overview shot showing both bases of a side WITH EXPANSIONS.
//
// THIS SHOT CANNOT BE PRODUCED, AND THAT IS THE FINDING.
//
// An earlier version of this harness counted 3 "bases" per side and appeared to prove the AI expands. It was
// wrong: the definition grouped refineries within 12 tiles of each other, and the three anchors it found were the
// sanctum plus TWO refineries 64 units apart inside the same starting base. Printing the anchor positions over a
// whole match settles it:
//
//   t=6m  p1: sanctum@(464,464) attunement_spire@(544,544) attunement_spire@(480,544)
//   t=18m p1: sanctum@(464,464) attunement_spire@(544,544) attunement_spire@(480,544)
//
// Nothing is placed outside the starting cluster at any point in the match. The AI never expands, so there are no
// "both bases of the surviving side" to photograph.
//
// What this harness therefore produces is the honest alternative: the WIDEST FOOTPRINT the chosen side ever
// holds, framed so a reviewer can see everything it owns, with the real base/building/army counts burned into the
// frame. It reports `1 base` because that is what there is. A shot that implied a second base would be false.
//
// Why the AI does not expand, measured: expansion needs a wall chain (5 × 40 mana), a forward refinery (750) and
// units parked to hold it, all out of the same income that funds the push — and matches are decided at ~12 min by
// the worker line, before any of that can pay back. See `docs/proof/phase-5/ai/phase6-fairness.md` §2.
//
// Usage:
//   PROOF_BASE=http://127.0.0.1:5343 npx vite-node audit/capture-expansion.ts
import { chromium, type Page } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.PROOF_BASE ?? 'http://127.0.0.1:5343';
const OUT = join(import.meta.dirname, '..', 'docs', 'proof', 'phase-5', 'ai');
const SEED = process.env.CAPTURE_SEED ?? '1000';
const D0 = process.env.CAPTURE_D0 ?? 'hard';
const D1 = process.env.CAPTURE_D1 ?? 'normal';
const SPEED = Number(process.env.CAPTURE_SPEED ?? '14');
/** Which player's bases to frame: 0 is the first-listed (Hard) side. */
const SIDE = Number(process.env.OVERVIEW_SIDE ?? '0');

const VIEWPORTS = [
  { name: 'phone', width: 844, height: 390, touch: true },
  { name: 'chromebook', width: 1366, height: 768, touch: false },
];

interface SideInfo {
  id: string;
  /** Distinct mining-base clusters, each with a centroid and its building count. */
  bases: { x: number; y: number; buildings: number }[];
  buildings: number;
  workers: number;
  army: number;
}

/**
 * Read both sides out of the live match.
 *
 * A "base" is a refinery or construction yard together with the buildings within 12 tiles of it — the same
 * definition `capture-overview.ts` uses, so the two captures cannot disagree about what a base is.
 */
async function readSides(page: Page): Promise<{ minutes: number; sides: SideInfo[]; ended: boolean }> {
  return page.evaluate(() => {
    const w = window as unknown as { __v2?: { state: any; registry: any } };
    const v2 = w.__v2!;
    const st = v2.state;
    const reg = v2.registry;
    const store = st.entities;

    const sides = st.players.map((p: any) => {
      const mine: number[] = [];
      for (let s = 0; s < store.count; s++) {
        if (store.dead[s]) continue;
        if (store.ownerId(store.ownerIndex[s]) !== p.id) continue;
        mine.push(s);
      }
      const blds = mine.filter((s) => store.kind[s] === 1);
      const units = mine.filter((s) => store.kind[s] === 0);
      const army = units.filter((s) => {
        const u = reg.units.get(store.extras[s].defId);
        return !!u?.weapon && !u.isHarvester;
      });
      const anchors = blds.filter((s) => {
        const d = reg.buildings.get(store.extras[s].defId);
        return d?.isRefinery || d?.isConstructionYard;
      });
      const bases: { x: number; y: number; buildings: number }[] = [];
      for (const a of anchors) {
        const near = blds.filter(
          (b) => Math.hypot(store.posX[b] - store.posX[a], store.posY[b] - store.posY[a]) < 12 * 32,
        );
        const cx = near.reduce((acc: number, b: number) => acc + store.posX[b], 0) / Math.max(1, near.length);
        const cy = near.reduce((acc: number, b: number) => acc + store.posY[b], 0) / Math.max(1, near.length);
        // The same cluster discovered from a second anchor is not a second base.
        if (bases.some((c) => Math.hypot(c.x - cx, c.y - cy) < 12 * 32)) continue;
        bases.push({ x: cx, y: cy, buildings: near.length });
      }
      return {
        id: p.id,
        bases,
        buildings: blds.length,
        workers: units.length - army.length,
        army: army.length,
      } as SideInfo;
    });

    const text = [...document.querySelectorAll('.hud-stats, .overlay-stats, .stat')]
      .map((e) => e.textContent)
      .join(' ');
    const m = text.match(/t=([\d.]+)m/);
    return { minutes: m ? Number(m[1]) : st.tick / 1200, sides, ended: st.ended === true };
  });
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const report: string[] = [];

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      hasTouch: vp.touch,
      deviceScaleFactor: 2,
      isMobile: vp.touch,
    });
    const page = await context.newPage();
    await page.goto(`${BASE}/index.html?speed=${SPEED}&seed=${SEED}&d0=${D0}&d1=${D1}`, { waitUntil: 'load' });
    await page.waitForSelector('[data-testid="game-canvas-host"] canvas', { timeout: 60_000 });

    /**
     * WATCH FOR PEAK EXPANSION. Sampling every 1.2 s of wall time (≈17 s of sim time at speed 14), remember the
     * best moment for the chosen side and stop there. The alternative — capturing at a fixed minute — is exactly
     * how the Phase 5 shot ended up showing one base.
     */
    let best: { bases: number; at: number } = { bases: 0, at: 0 };
    const deadline = Date.now() + 200_000;
    let lastMinutes = 0;
    /**
     * CAPTURE MID-MATCH, NOT AT THE END.
     *
     * The first version stopped at `s.ended`, which produced a shot of a finished match: 12 buildings, 20 army and
     * the enemy at 0 — technically honest, but it shows a won game with nothing to look at rather than the
     * contested state a reviewer needs. The loop now stops at a target minute while the match is still live, which
     * is the moment the footprint is actually interesting.
     */
    const TARGET_MIN = Number(process.env.CAPTURE_AT_MIN ?? '11');
    while (Date.now() < deadline) {
      const s = await readSides(page);
      lastMinutes = s.minutes;
      const side = s.sides[SIDE];
      const n = side?.bases.length ?? 0;
      if (n > best.bases) best = { bases: n, at: s.minutes };
      if (s.minutes >= TARGET_MIN) break;
      if (s.ended) break;
      await page.waitForTimeout(1_000);
    }

    const snap = await readSides(page);
    const side = snap.sides[SIDE] ?? snap.sides[0]!;
    const others = snap.sides.filter((_, i) => i !== SIDE);

    /** Frame EVERY base the side holds, so the picture covers the expansion rather than just the home cluster. */
    const pts = side.bases.length > 0 ? side.bases : [{ x: 2048, y: 1408 }];
    const minX = Math.min(...pts.map((p) => p.x));
    const maxX = Math.max(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y));
    const maxY = Math.max(...pts.map((p) => p.y));
    const centreX = (minX + maxX) / 2;
    const centreY = (minY + maxY) / 2;
    const spanX = Math.max(maxX - minX, 400);
    const spanY = Math.max(maxY - minY, 300);
    const fit = Math.max(spanX / 1250, spanY / 780, 0.4);
    const zoom = Math.max(0.3, Math.min(1.0, 0.9 / fit));

    await page.evaluate(
      ({ cx, cy, z }: { cx: number; cy: number; z: number }) => {
        const v2 = (window as unknown as { __v2: { renderer: any } }).__v2;
        v2.renderer.camera.centerOn(cx, cy);
        v2.renderer.camera.setZoom(z);
      },
      { cx: centreX, cy: centreY, z: zoom },
    );
    await page.waitForTimeout(800);

    const caption =
      `${side.id} — ${side.bases.length} base${side.bases.length === 1 ? '' : 's'}` +
      (side.bases.length > 1 ? ` (expansion) ` : ' ') +
      `${side.buildings} buildings, ${side.workers} workers, ${side.army} army` +
      `  |  enemy: ${others.map((o) => `${o.buildings} bld`).join(', ')}` +
      `  |  t=${snap.minutes.toFixed(1)} min, seed ${SEED} (${D0} vs ${D1}), peak ${best.bases} bases @ ${best.at.toFixed(1)}m`;

    await page.evaluate((text: string) => {
      let el = document.getElementById('overview-caption');
      if (!el) {
        el = document.createElement('div');
        el.id = 'overview-caption';
        el.setAttribute(
          'style',
          [
            'position:fixed',
            'left:12px',
            'bottom:12px',
            'z-index:99999',
            'background:rgba(8,10,18,0.9)',
            'color:#eaf0ff',
            'font:600 15px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace',
            'padding:9px 13px',
            'border:1px solid rgba(180,140,70,0.55)',
            'border-radius:4px',
            'letter-spacing:0.2px',
            'pointer-events:none',
            'max-width:calc(100vw - 48px)',
          ].join(';'),
        );
        document.body.appendChild(el);
      }
      el.textContent = text;
    }, caption);
    await page.waitForTimeout(250);

    const file = join(OUT, `footprint-${vp.name}-${snap.minutes.toFixed(0)}min.png`);
    await page.screenshot({ path: file });
    const line = `${vp.name} ${vp.width}x${vp.height} t=${lastMinutes.toFixed(1)}m zoom=${zoom.toFixed(2)} -> ${file}\n   ${caption}`;
    console.log(line);
    report.push(line);
    await context.close();
  }

  writeFileSync(join(OUT, 'footprint-captions.txt'), report.join('\n') + '\n');
  await browser.close();
}

await main();
