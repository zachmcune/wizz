// OVERVIEW CAPTURE — both bases of the surviving side in one frame.
//
// The 18-minute Chromebook shot showed only the main base, about six buildings, because the camera was parked on the player's
// sanctum at zoom 1.15. That is honest proof of the base but it does not show the thing the capture is supposed to
// demonstrate: that the AI EXPANDED, and where its second base went. A reviewer looking at it cannot see the second base at
// all, so the shot cannot support a claim about expansion.
//
// This captures the same match moment from an overview instead: the camera is moved to the midpoint between the side's two
// bases (or between its base and its army centroid when it has one base), then zoomed out until both fit. Building counts are
// read from the live simulation and burned into the caption, so the image states its own evidence rather than relying on a
// caption written afterwards.
//
// Usage:
//   PROOF_BASE=http://127.0.0.1:5343 npx vite-node audit/capture-overview.ts
import { chromium, type Page } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.PROOF_BASE ?? 'http://127.0.0.1:5343';
const OUT = process.env.OVERVIEW_OUT ?? join(import.meta.dirname, '..', 'docs', 'proof', 'phase-5', 'ai');
const TARGET_MIN = Number(process.env.OVERVIEW_MIN ?? '18');
const SEED = process.env.CAPTURE_SEED ?? '1000';
const D0 = process.env.CAPTURE_D0 ?? 'hard';
const D1 = process.env.CAPTURE_D1 ?? 'normal';
const SPEED = Number(process.env.CAPTURE_SPEED ?? 14);
/** Which player's bases to frame. 0 = the first player (the one the HUD reports). */
const SIDE = Number(process.env.OVERVIEW_SIDE ?? '0');

const VIEWPORTS = [
  { name: 'phone', width: 844, height: 390, touch: true },
  { name: 'chromebook', width: 1366, height: 768, touch: false },
];

interface Snapshot {
  minutes: number;
  /** Per side: building count, base count, worker and army counts, and the base centroids. */
  sides: {
    id: string;
    buildings: number;
    bases: number;
    /** Completed refineries more than 12 tiles from this side's own sanctum — a genuine second mining base. */
    outsideRefineries: number;
    workers: number;
    army: number;
    centres: { x: number; y: number }[];
  }[];
}

async function simMinutes(page: Page): Promise<number> {
  const text = await page.evaluate(() => [...document.querySelectorAll('.hud-stats')].map((e) => e.textContent).join(' '));
  const m = text.match(/t=([\d.]+)m/);
  return m ? Number(m[1]) : 0;
}

/** Read the live match out of the page's exposed hook. */
async function snapshot(page: Page): Promise<Snapshot> {
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
      // A "base" is a completed refinery cluster: group buildings within 12 tiles of each refinery or the sanctum.
      const isBase = (s: number) => {
        const d = reg.buildings.get(store.extras[s].defId);
        return d?.isRefinery || d?.isConstructionYard;
      };
      const anchors = blds.filter(isBase);
      /**
       * A "base" is a completed refinery cluster, and the count must SEPARATE a forward base from the home cluster.
       *
       * The 12-tile clustering used here is the same radius `countBases` uses, and on this map the nearest unserved node is
       * 14.1 tiles from home — so an expansion built on it merges into the home cluster and reports "1 base" even when the
       * AI demonstrably expanded. The report therefore carries BOTH numbers: the cluster count (for continuity with earlier
       * proof packs) and the count of completed refineries that are further than 12 tiles from the side's own sanctum, which
       * is the strict "outside the starting cluster" figure `audit/expand-outcomes.ts` reports.
       */
      const yardSlot = blds.find((s) => reg.buildings.get(store.extras[s].defId)?.isConstructionYard);
      const homeX = yardSlot !== undefined ? store.posX[yardSlot] : store.posX[blds[0] ?? 0];
      const homeY = yardSlot !== undefined ? store.posY[yardSlot] : store.posY[blds[0] ?? 0];
      const outsideRefs = blds.filter((s) => {
        const d = reg.buildings.get(store.extras[s].defId);
        if (!d?.isRefinery) return false;
        return Math.hypot(store.posX[s] - homeX, store.posY[s] - homeY) > 12 * 32;
      }).length;
      const centres: { x: number; y: number }[] = [];
      for (const a of anchors) {
        const near = blds.filter(
          (b) => Math.hypot(store.posX[b] - store.posX[a], store.posY[b] - store.posY[a]) < 12 * 32,
        );
        const cx = near.reduce((acc, b) => acc + store.posX[b], 0) / Math.max(1, near.length);
        const cy = near.reduce((acc, b) => acc + store.posY[b], 0) / Math.max(1, near.length);
        if (!centres.some((c) => Math.hypot(c.x - cx, c.y - cy) < 12 * 32)) centres.push({ x: cx, y: cy });
      }
      return {
        id: p.id,
        buildings: blds.length,
        bases: centres.length,
        outsideRefineries: outsideRefs,
        workers: units.length - army.length,
        army: army.length,
        centres,
      };
    });
    const text = [...document.querySelectorAll('.hud-stats')].map((e) => e.textContent).join(' ');
    const m = text.match(/t=([\d.]+)m/);
    return { minutes: m ? Number(m[1]) : 0, sides };
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

    // Advance to the target minute, or stop early if the match ends.
    const deadline = Date.now() + 240_000;
    while (Date.now() < deadline) {
      const t = await simMinutes(page);
      if (t >= TARGET_MIN) break;
      const ended = await page.evaluate(() => (window as unknown as { __v2?: { state: any } }).__v2?.state?.ended === true);
      if (ended) break;
      await page.waitForTimeout(1200);
    }

    const snap = await snapshot(page);
    const side = snap.sides[SIDE] ?? snap.sides[0]!;
    const others = snap.sides.filter((_, i) => i !== SIDE);

    /**
     * FRAME THE SIDE'S WHOLE FOOTPRINT: ITS BASES *AND* ITS ARMY.
     *
     * The 18-minute Chromebook shot this replaces showed only the main base at zoom 1.15 — about six buildings — so a
     * reviewer could not see the army, the outer defences, or where the side actually stood on the map. This frames every
     * base centre AND the army centroid, so the picture covers everything the side owns that is not spread across the
     * whole map, and the zoom is chosen to fit that span with margin.
     *
     * The base COUNT is read from the live simulation and burned into the caption, so the claim in the caption is exactly
     * what the frame shows. On the current AI that count is typically 1: the winner reaches a decisive army before it
     * finishes expanding, so a "two bases of the surviving side" shot is not available without changing the AI's
     * expansion. The caption states the real number rather than implying one.
     */
    const army = await page.evaluate(() => {
      const w = window as unknown as { __v2?: { state: any; registry: any } };
      const v2 = w.__v2!;
      const st = v2.state;
      const store = st.entities;
      const per = st.players.map((p: any) => {
        const ids: number[] = [];
        for (let s = 0; s < store.count; s++) {
          if (store.dead[s]) continue;
          if (store.ownerId(store.ownerIndex[s]) !== p.id) continue;
          const u = v2.registry.units.get(store.extras[s].defId);
          if (!u?.weapon || u.isHarvester) continue;
          if (store.kind[s] !== 0) continue;
          ids.push(s);
        }
        if (ids.length === 0) return null;
        return {
          x: ids.reduce((a, s) => a + store.posX[s], 0) / ids.length,
          y: ids.reduce((a, s) => a + store.posY[s], 0) / ids.length,
          n: ids.length,
        };
      });
      return per;
    });
    const ar = army[SIDE] ?? null;

    const pts = side.centres.length > 0 ? [...side.centres] : [{ x: 0, y: 0 }];
    if (ar) pts.push({ x: ar.x, y: ar.y });
    const minX = Math.min(...pts.map((p) => p.x));
    const maxX = Math.max(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y));
    const maxY = Math.max(...pts.map((p) => p.y));
    const spanX = maxX - minX;
    const spanY = maxY - minY;
    const centreX = (minX + maxX) / 2;
    const centreY = (minY + maxY) / 2;
    // Fit the span with margin, and never zoom in past 1.0 (which would crop the cluster).
    const fit = Math.max(spanX / 1250, spanY / 780, 0.42);
    const zoom = Math.max(0.34, Math.min(1.0, 0.92 / fit));

    await page.evaluate(
      ({ cx, cy, z }: { cx: number; cy: number; z: number }) => {
        const v2 = (window as unknown as { __v2: { renderer: any } }).__v2;
        v2.renderer.camera.centerOn(cx, cy);
        v2.renderer.camera.setZoom(z);
      },
      { cx: centreX, cy: centreY, z: zoom },
    );
    await page.waitForTimeout(700);

    /**
     * BURN THE EVIDENCE INTO THE IMAGE.
     *
     * A caption written separately can drift from what the picture shows. Drawing the side's own counts over the frame means
     * the number of bases and buildings in the claim is always the number visible in the shot.
     */
    const caption =
      `${side.id} — ${side.bases} cluster${side.bases === 1 ? '' : 's'}, ` +
      `${side.outsideRefineries} forward refiner${side.outsideRefineries === 1 ? 'y' : 'ies'}, ${side.buildings} buildings, ` +
      `${side.workers} workers, ${side.army} army` +
      (ar ? ` @ (${Math.round(ar.x)},${Math.round(ar.y)})` : '') +
      `  |  enemy: ${others.map((o) => `${o.buildings} bld`).join(', ')}` +
      `  |  t=${snap.minutes.toFixed(1)} min, seed ${SEED} (${D0} vs ${D1}), overview`;
    await page.evaluate((text: string) => {
      const host = document.querySelector('[data-testid="game-canvas-host"]') as HTMLElement | null;
      if (!host) return;
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
            'background:rgba(8,10,18,0.88)',
            'color:#eaf0ff',
            'font:600 15px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace',
            'padding:9px 13px',
            'border:1px solid rgba(120,170,255,0.45)',
            'border-radius:8px',
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

    const file = join(OUT, `overview-${vp.name}-${snap.minutes.toFixed(0)}min.png`);
    await page.screenshot({ path: file });
    const line = `${vp.name} ${vp.width}x${vp.height} t=${snap.minutes.toFixed(1)}m zoom=${zoom.toFixed(2)} -> ${file}\n   ${caption}`;
    console.log(line);
    report.push(line);

    await context.close();
  }

  writeFileSync(join(OUT, 'overview-captions.txt'), report.join('\n') + '\n');
  await browser.close();
}

await main();
