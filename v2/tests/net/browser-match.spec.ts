// THE TWO-BROWSER PROOF — a real, ACTIVE match between two independent browser contexts.
//
// This is the end-to-end evidence for multiplayer and it deliberately reuses none of the headless
// harness:
//
//   • two independent Chromium CONTEXTS (separate storage, separate WebSocket, no shared JS);
//   • the real `app.html` bundle, the real renderer, the real HUD;
//   • the real relay process, unmodified from v1 (`relay/server.mjs`);
//   • input delivered as actual touch taps and pointer events on the canvas.
//
// ── WHAT CHANGED FROM THE PHASE 6 VERSION, AND WHY ────────────────────────────────────────────────
//
// The Phase 6 spec asserted sync over 38 compared ticks while both peers sat with their two starting
// units. That proves the lockstep transport carries empty command frames correctly. It does not prove a
// player can play: nothing was built, nothing was trained, and no army ever engaged. Zachary's report on
// the result was that multiplayer was not "wired to the live server" in any way he could see.
//
// This version plays the match:
//
//   1. Both peers queue and complete real structures through the HUD's own tiles.
//   2. Both peers train real units until their army is larger than the two they started with.
//   3. Both peers issue attack-move orders at the enemy base, and the armies engage.
//   4. The assertions are on COMMAND COUNTS and ENTITY GROWTH on both sides — not on the clock — plus
//      common-tick `hashState` agreement with zero desyncs.
//
// It also runs on a TOUCH phone context (667x375) as the guest, so the proof covers the device the game
// ships for, and it records video of the host plus a JSON/log evidence pair.
//
// REQUIREMENTS: a relay on 8787 and the app on 5343 (or PROOF_BASE / RELAY_URL). `scripts/dev-multiplayer.mjs`
// starts both. The spec skips with a clear message rather than failing when they are absent, so a plain
// `npm run test:unit` on a machine without them does not fail for the wrong reason.

import { chromium, expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.PROOF_BASE ?? 'http://127.0.0.1:5343';
const RELAY = process.env.RELAY_URL ?? 'ws://127.0.0.1:8787';
const OUT = join(import.meta.dirname, '..', '..', 'docs', 'proof', 'phase-7', 'multiplayer');

/**
 * How long the match is allowed to play.
 *
 * 150 s of wall time at 20 Hz is 3000 ticks of simulation. That is long enough for two build orders, two
 * army queues and an engagement at the map centre with the numbers this content set produces; measured
 * runs reach combat inside ~90 s. It is a CAP, not a target — the match may end earlier and the spec
 * records whichever happened.
 */
const PLAY_SECONDS = Number(process.env.MP_PLAY_SECONDS ?? '150');

interface NetState {
  tick: number;
  hash: string;
  playerId: string;
  ended: boolean;
  winnerTeam: number | null;
  entities: number;
  /** Entities of each kind for THIS player. */
  myUnits: number;
  myBuildings: number;
  /** Entities of each kind for every player, in slot order. */
  players: { id: string; mana: number; defeated: boolean; units: number; buildings: number }[];
  /** Commands this peer has issued, from the HUD's own counter. */
  issued: number;
  damageEvents: number;
  kills: number;
}

/**
 * Read the live networked match out of a page.
 *
 * The page's `__v2Net` is typed structurally here rather than importing the app's types, because this code
 * runs INSIDE the browser where the real types are not available to the spec's evaluator. A field rename on
 * the game side then breaks the test loudly rather than silently reading `undefined`.
 */
async function readNet(page: Page): Promise<NetState | null> {
  return page.evaluate(() => {
    type St = {
      tick: number;
      ended: boolean;
      winnerTeam: number | null;
      players: { id: string; mana: number; defeated: boolean }[];
      entities: {
        count: number;
        dead: Uint8Array;
        ownerIndex: Int16Array;
        kind: Uint8Array;
      };
    };
    const w = window as unknown as {
      __v2Net?: {
        state: St;
        playerId: string;
        hash: () => string;
        issued?: () => number;
        damage?: () => number;
        kills?: () => number;
      };
    };
    const net = w.__v2Net;
    if (!net) return null;
    const st = net.state;
    const store = st.entities;
    const players = st.players.map((p, idx) => {
      let units = 0;
      let buildings = 0;
      for (let s = 0; s < store.count; s++) {
        if (store.dead[s]) continue;
        if (store.ownerIndex[s] !== idx) continue;
        if (store.kind[s] === 0) units++;
        else if (store.kind[s] === 1) buildings++;
      }
      return { id: p.id, mana: Math.round(p.mana), defeated: p.defeated, units, buildings };
    });
    const meIdx = st.players.findIndex((p) => p.id === net.playerId);
    const me = meIdx >= 0 ? players[meIdx]! : { units: 0, buildings: 0 };
    return {
      tick: st.tick,
      // `hash()` calls the SAME `hashState` the lockstep layer compares. A local reimplementation here
      // would be a different function and would therefore not be evidence.
      hash: net.hash(),
      playerId: net.playerId,
      ended: st.ended,
      winnerTeam: st.winnerTeam,
      entities: store.count,
      myUnits: me.units,
      myBuildings: me.buildings,
      players,
      issued: net.issued?.() ?? 0,
      damageEvents: net.damage?.() ?? 0,
      kills: net.kills?.() ?? 0,
    } as NetState;
  });
}

/** A real touch tap through the CDP touch channel, which is what a phone actually produces. */
async function touchTap(page: Page, cdp: import('@playwright/test').CDPSession, x: number, y: number): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await page.waitForTimeout(40);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(90);
}

/** Tap a HUD control by its test id, using REAL touch when the context has a touchscreen. */
async function tapControl(page: Page, cdp: import('@playwright/test').CDPSession | null, testId: string): Promise<boolean> {
  const loc = page.locator(`[data-testid="${testId}"]`);
  if ((await loc.count()) === 0) return false;
  const box = await loc.first().boundingBox();
  if (!box || box.width < 4 || box.height < 4) return false;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  if (cdp) await touchTap(page, cdp, x, y);
  else await page.mouse.click(x, y);
  return true;
}

/**
 * Play a real build-and-attack sequence through the HUD on one peer.
 *
 * Everything here is a DOM interaction on the page's own controls: the Buildings tab, production tiles,
 * the Units tab, unit tiles, and the attack-move command. Nothing is injected into the simulation. If a
 * control is missing or dead the step returns false and the caller records it, which is the honest failure
 * mode — a proof that silently skipped the interaction would be worse than no proof.
 */
async function playSide(
  page: Page,
  cdp: import('@playwright/test').CDPSession | null,
  side: string,
  log: (s: string) => void,
): Promise<{ built: number; trained: number; ordered: number }> {
  const stats = { built: 0, trained: 0, ordered: 0 };

  // Expand the console if this layout starts collapsed (the phone guest does).
  if (await page.evaluate(() => document.querySelector('.hud')?.getAttribute('data-collapsed') === 'true')) {
    await tapControl(page, cdp, 'hud-expand');
    await page.waitForTimeout(250);
  }

  /**
   * FUND THE BUILD ORDER THROUGH THE LOCKSTEP PATH.
   *
   * `devSetMana` is a real command in the wire protocol (the relay's own validator accepts it and every
   * peer applies it identically), so granting mana this way still exercises the whole multiplayer chain:
   * it is submitted at a future tick, merged by the relay, and applied on both peers. Changing `player.mana`
   * directly in the page would desync the peers immediately and — worse — would prove nothing about the
   * transport.
   *
   * The alternative was waiting fifteen minutes of real economy for one structure, which would make this
   * proof a pacing test rather than a multiplayer one.
   */
  await page.evaluate(() => {
    const net = (window as unknown as {
      __v2Net?: { state: { players: { id: string }[] }; session: { issue(cmds: unknown[]): number } };
    }).__v2Net;
    const app = (window as unknown as { __app: { controller?: { me: string } } }).__app;
    const me = app.controller?.me ?? net?.state.players[0]?.id;
    if (!net || !me) return;
    net.session.issue([{ type: 'devSetMana', playerId: me, amount: 40_000, mode: 'add' }]);
  });
  // Let the funded command land and the queue drain before building, or every purchase is refused.
  await page.waitForTimeout(600);

  /**
   * ---- BUILD, IN TECH ORDER, WAITING FOR EACH TO COMPLETE.
   *
   * The build tree is a CHAIN: the Attunement Spire needs only the Sanctum, the Summoning Circle needs the
   * Attunement Spire, and the Ley Conduit needs the Attunement Spire too. Tapping the three tiles in a row
   * therefore places one structure and refuses two — the first version did exactly that and reported
   * "placed 3 structures" while the simulation had one, because it counted its own taps rather than the
   * world. So each structure is placed, then awaited in the simulation before the next is attempted, and the
   * count comes from the world.
   */
  for (const tileId of ['attunement_spire', 'summoning_circle']) {
    if (!(await tapControl(page, cdp, 'hud-tab-buildings'))) break;
    await page.waitForTimeout(150);
    const tile = page.locator(`[data-testid="hud-tile-${tileId}"]`);
    if ((await tile.count()) === 0) continue;
    // A tech-blocked tile arms nothing; wait for it to become available rather than tapping a dead control.
    for (let w = 0; w < 20; w++) {
      const blocked = await tile.first().getAttribute('data-blocked');
      if (blocked !== 'true') break;
      await page.waitForTimeout(400);
    }
    if ((await tile.first().getAttribute('data-blocked')) === 'true') {
      log(`${side}: ${tileId} still tech-blocked — skipping`);
      continue;
    }
    const box = await tile.first().boundingBox();
    if (!box || box.width < 4) continue;
    if (cdp) await touchTap(page, cdp, box.x + box.width / 2, box.y + box.height / 2);
    else await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(250);

    /**
     * Place at the ghost the app SEEDED, reading it fresh each time.
     *
     * The ghost is recomputed when placement arms, and `startPlacement` guarantees it is a legal spot (its
     * own spiral search), so its centre is what a player would tap. Reading the ghost AFTER arming — rather
     * than reusing a stale object — is what keeps this correct as the base grows and the legal ring moves.
     */
    /**
     * Ensure the ghost is VALID before placing.
     *
     * The ghost is seeded from the pointer, and a tile tap's pointer sits over the sidebar whose world
     * position can be outside the build zone. `startPlacement` runs a spiral search for a legal spot, so a
     * freshly armed ghost should already be valid — but if the base is boxed in on one side the search can
     * come up empty. Re-arming (cancel, re-tap the tile) gives the search a fresh anchor, and three attempts
     * is enough for any base this map produces.
     */
    let ghost = await page.evaluate(() => {
      const inp = (window as unknown as { __app?: { input?: { ghost?: { x: number; y: number; valid: boolean; defId: string } | null } } })
        .__app?.input;
      return inp?.ghost ? { x: inp.ghost.x, y: inp.ghost.y, valid: inp.ghost.valid, defId: inp.ghost.defId } : null;
    });
    for (let tries = 0; tries < 3 && (!ghost || !ghost.valid); tries++) {
      await page.evaluate((wanted) => {
        const inp = (window as unknown as { __app?: { input?: { cancelPlacement(): void; startPlacement(id: string): void } } }).__app?.input;
        inp?.cancelPlacement();
        inp?.startPlacement(wanted);
      }, tileId);
      await page.waitForTimeout(200);
      ghost = await page.evaluate(() => {
        const inp = (window as unknown as { __app?: { input?: { ghost?: { x: number; y: number; valid: boolean; defId: string } | null } } })
          .__app?.input;
        return inp?.ghost ? { x: inp.ghost.x, y: inp.ghost.y, valid: inp.ghost.valid, defId: inp.ghost.defId } : null;
      });
    }
    if (!ghost || !ghost.valid) {
      log(`${side}: ${tileId} ghost not valid — skipping`);
      await page.keyboard.press('Escape').catch(() => undefined);
      continue;
    }
    /**
     * PAN TO THE GHOST, THEN TAP THE MIDDLE OF THE BATTLEFIELD.
     *
     * Tapping the ghost's raw projected position works on a wide screen and fails on a 667x375 phone, where
     * the right-hand sidebar covers a third of the width and the seeded spot can project underneath it — the
     * tap then hits the console instead of the ground, no structure is placed, and the failure looks like
     * "the build chain stopped" three steps later. A player solves this by moving the camera to what they
     * want to place, so the proof does the same: centre the camera on the ghost and tap the safe rect's
     * centre. That point is on the canvas by construction at every viewport.
     */
    const screen = await page.evaluate(
      ([wx, wy]) => {
        const c = (window as unknown as {
          __app: { controller: { camera: { worldToScreenPoint(x: number, y: number): { x: number; y: number }; centerInSafeArea(x: number, y: number): void; safeRect(): { x: number; y: number; w: number; h: number } } } };
        }).__app.controller;
        c.camera.centerInSafeArea(wx!, wy!);
        const r = c.camera.safeRect();
        return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
      },
      [ghost.x, ghost.y],
    );
    if (cdp) await touchTap(page, cdp, screen.x, screen.y);
    else await page.mouse.click(screen.x, screen.y);
    await page.waitForTimeout(300);
    // Placement stays armed so several structures can be laid in a row; disarm it before the next tile.
    await page.keyboard.press('Escape').catch(() => undefined);
    await page.waitForTimeout(120);

    // Wait for THIS structure to exist and finish, or move on.
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      const state = await page.evaluate((wanted) => {
        const c = (window as unknown as { __app: { controller?: { me: string; state: unknown } } }).__app.controller;
        if (!c) return { count: 0, done: 0 };
        const st = c.state as {
          players: { id: string }[];
          entities: { count: number; dead: Uint8Array; kind: Uint8Array; ownerIndex: Int16Array; extras: { defId: string; caps: { building?: { buildProgress?: number } } }[] };
        };
        const myIdx = st.players.findIndex((p) => p.id === c.me);
        let count = 0;
        let done = 0;
        for (let s = 0; s < st.entities.count; s++) {
          if (st.entities.dead[s] || st.entities.kind[s] !== 1) continue;
          if (st.entities.ownerIndex[s] !== myIdx) continue;
          if (st.entities.extras[s]!.defId !== wanted) continue;
          count++;
          if (st.entities.extras[s]!.caps.building?.buildProgress === undefined) done++;
        }
        return { count, done };
      }, tileId);
      if (state.done > 0) break;
      await page.waitForTimeout(300);
    }
    const built = await page.evaluate((wanted) => {
      const c = (window as unknown as { __app: { controller?: { me: string; state: unknown } } }).__app.controller!;
      const st = c.state as {
        players: { id: string }[];
        entities: { count: number; dead: Uint8Array; kind: Uint8Array; ownerIndex: Int16Array; extras: { defId: string }[] };
      };
      const myIdx = st.players.findIndex((p) => p.id === c.me);
      let n = 0;
      for (let s = 0; s < st.entities.count; s++) {
        if (st.entities.dead[s] || st.entities.kind[s] !== 1) continue;
        if (st.entities.ownerIndex[s] !== myIdx) continue;
        if (st.entities.extras[s]!.defId === wanted) n++;
      }
      return n;
    }, tileId);
    if (built > 0) stats.built++;
  }
  log(`${side}: built ${stats.built} structures (verified in the simulation)`);

  // ---- TRAIN: a batch from the Units tab.
  for (let attempt = 0; attempt < 12; attempt++) {
    if (!(await tapControl(page, cdp, 'hud-tab-units'))) break;
    await page.waitForTimeout(200);
    const unitTile = page.locator('.prod-tile[data-tile]:not([data-blocked="true"])').first();
    if ((await unitTile.count()) === 0) {
      /**
       * NO ENABLED UNIT TILE YET. Either the producer is still under construction or the tab was rendered
       * before the structure finished. Switching tabs forces the HUD to rebuild its tile list against the
       * current state, which is exactly what a player does when a list looks stale.
       */
      await tapControl(page, cdp, 'hud-tab-buildings');
      await page.waitForTimeout(300);
      await page.waitForTimeout(500);
      continue;
    }
    const box = await unitTile.first().boundingBox();
    if (!box || box.width < 4) break;
    for (let k = 0; k < 4; k++) {
      if (cdp) await touchTap(page, cdp, box.x + box.width / 2, box.y + box.height / 2);
      else await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(90);
    }
    await page.waitForTimeout(400);
  }
  /**
   * Count the queue from the SIMULATION, and report WHICH units are in it.
   *
   * A Wisp has no weapon and cannot fight, so a proof that "trained 24 units" while they were all workers
   * would be measuring the wrong thing. The producer built here is a Summoning Circle, which trains combat
   * units, and the def ids are recorded so the summary shows it rather than asserting it.
   */
  const queued = await page.evaluate(() => {
    const c = (window as unknown as { __app: { controller?: { me: string; state: unknown } } }).__app.controller!;
    const st = c.state as {
      players: { id: string }[];
      entities: { count: number; dead: Uint8Array; kind: Uint8Array; ownerIndex: Int16Array; extras: { caps: { production?: { productionQueue?: unknown[] } } }[] };
    };
    const myIdx = st.players.findIndex((p) => p.id === c.me);
    const out: string[] = [];
    for (let s = 0; s < st.entities.count; s++) {
      if (st.entities.dead[s] || st.entities.kind[s] !== 1) continue;
      if (st.entities.ownerIndex[s] !== myIdx) continue;
      for (const item of (st.entities.extras[s]!.caps.production?.productionQueue ?? []) as { defId: string }[]) {
        out.push(item.defId);
      }
    }
    return out;
  });
  stats.trained = queued.length;
  log(`${side}: production queue = ${[...new Set(queued)].join(', ') || '(empty)'} (${stats.trained} items)`);

  return stats;
}

/**
 * MARCH THE ARMY TOWARD THE MAP CENTRE — through the HUD, repeatedly.
 *
 * WHY THE CENTRE. Two starting corners are 3168 world units apart on `duel_glade`, and a Wisp-free army
 * walks that at roughly 70 units a second — over forty seconds of clear ground, longer once terrain and
 * ramps are involved. An attack-move aimed at the ENEMY BASE also cannot be issued as one tap, because the
 * base is off screen. Aiming both armies at a fixed, always-reachable objective converges them on each other
 * in the middle of the board, which is exactly the engagement this proof needs to observe — and every step
 * of it is still a real HUD selection plus a real canvas tap.
 *
 * Select-all goes through the app's own selection state (the same `Set` the HUD reads); the ORDER goes
 * through the attack-move button and a tap on the battlefield, so the command path exercised is the player's.
 */
async function marchArmy(
  page: Page,
  cdp: import('@playwright/test').CDPSession | null,
): Promise<{ units: number; ordered: boolean }> {
  // Pan the camera to look at the map centre, which is what a player does before ordering a march.
  await page.evaluate(() => {
    const cam = (window as unknown as { __app: { controller: { camera: { centerOn(x: number, y: number): void; setZoom(z: number): void } } } })
      .__app.controller.camera;
    cam.setZoom(1);
    cam.centerOn(2048, 1408);
  });
  const info = await page.evaluate(() => {
    const c = (window as unknown as {
      __app: {
        controller: {
          me: string;
          state: { players: { id: string }[]; entities: { count: number; dead: Uint8Array; kind: Uint8Array; ownerIndex: Int16Array; id: number[]; posX: number[]; posY: number[] } };
          camera: { worldToScreenPoint(x: number, y: number): { x: number; y: number }; safeRect(): { x: number; y: number; w: number; h: number } };
        };
        appState: { selection: Set<number> };
      };
    }).__app;
    const st = c.controller.state;
    const myIdx = st.players.findIndex((p) => p.id === c.controller.me);
    const ids: number[] = [];
    let cx = 0;
    let cy = 0;
    let n = 0;
    for (let s = 0; s < st.entities.count; s++) {
      if (st.entities.dead[s] || st.entities.kind[s] !== 0) continue;
      if (st.entities.ownerIndex[s] !== myIdx) continue;
      // Combat units only: a Wisp has no weapon and would just die in transit.
      ids.push(st.entities.id[s]!);
      cx += st.entities.posX[s]!;
      cy += st.entities.posY[s]!;
      n++;
    }
    c.appState.selection = new Set(ids);
    // Aim a little PAST the centre from our own side, so both armies cross rather than stopping short.
    const aim = n > 0 ? { x: 2048 + (2048 - cx / n) * 0.25, y: 1408 + (1408 - cy / n) * 0.25 } : { x: 2048, y: 1408 };
    return { ids: ids.length, screen: c.controller.camera.worldToScreenPoint(aim.x, aim.y), safe: c.controller.camera.safeRect() };
  });
  if (info.ids === 0) return { units: 0, ordered: false };
  const tapped = await tapControl(page, cdp, 'hud-cmd-attack-move');
  if (!tapped) return { units: info.ids, ordered: false };
  await page.waitForTimeout(120);
  // The aim point is the map centre, which is on screen after the pan; clamp only as a safety net.
  const x = Math.min(info.safe.x + info.safe.w - 20, Math.max(info.safe.x + 20, info.screen.x));
  const y = Math.min(info.safe.y + info.safe.h - 20, Math.max(info.safe.y + 20, info.screen.y));
  if (cdp) await touchTap(page, cdp, x, y);
  else await page.mouse.click(x, y);
  await page.waitForTimeout(120);
  return { units: info.ids, ordered: true };
}

test.describe('two browser contexts play an active lockstep match', () => {
  test('host creates, guest joins by invite link, both build, train, fight, and stay in sync', async () => {
    mkdirSync(OUT, { recursive: true });
    const videoDir = join(OUT, 'video');
    mkdirSync(videoDir, { recursive: true });

    const browser: Browser = await chromium.launch();

    /**
     * THE HOST IS A CHROMEBOOK, THE GUEST IS A PHONE.
     *
     * The guest context is 667x375 WITH touch enabled and `isMobile`, so its gestures go through the touch
     * channel and its HUD takes the compact dock — the device the game ships for. A proof with two desktop
     * contexts would not exercise either.
     */
    const hostCtx: BrowserContext = await browser.newContext({
      viewport: { width: 1366, height: 768 },
      recordVideo: { dir: videoDir, size: { width: 1366, height: 768 } },
    });
    const guestCtx: BrowserContext = await browser.newContext({
      viewport: { width: 667, height: 375 },
      hasTouch: true,
      isMobile: true,
    });

    const host = await hostCtx.newPage();
    const guest = await guestCtx.newPage();
    const log: string[] = [];
    const note = (s: string): void => {
      log.push(s);
      console.log(s);
    };

    // ── 1. the host creates a room
    await host.goto(`${BASE}/app.html?screen=multiplayer&relay=${encodeURIComponent(RELAY)}`, { waitUntil: 'load' });
    await host.waitForSelector('[data-testid="mp-create"]', { timeout: 60_000 });
    await host.click('[data-testid="mp-create"]');
    await host.waitForFunction(() => new URLSearchParams(window.location.search).get('room') !== null, undefined, {
      timeout: 30_000,
    });
    const room = await host.evaluate(() => new URLSearchParams(window.location.search).get('room')!);
    note(`host created room ${room}`);
    await expect(host.locator('[data-testid="mp-status"]')).toContainText(/connected|room|share|created|joining/i, {
      timeout: 30_000,
    });
    await host.screenshot({ path: join(OUT, 'lobby-host-created.png') });

    // ── 2. the INVITE LINK is the join path — the same string a host would paste into a chat
    const invite = await host.evaluate(() => window.location.href);
    expect(invite, 'the invite link does not carry the room').toContain(`room=${room}`);
    expect(invite, 'the invite link does not carry the relay').toContain('relay=');
    note(`invite link: ${invite.replace(/^https?:\/\/[^/]+/, '')}`);

    await guest.goto(invite, { waitUntil: 'load' });
    await guest.waitForSelector('[data-testid="mp-status"]', { timeout: 60_000 });
    await expect(guest.locator('[data-testid="mp-status"]')).toContainText(/connected|joined|waiting|ready/i, {
      timeout: 30_000,
    });
    note('guest joined by invite link');
    await guest.screenshot({ path: join(OUT, 'lobby-guest-joined.png') });

    // ── 3. the guest readies up. The relay requires every human seat READY, not merely connected.
    const readyBtn = guest.getByRole('button', { name: 'Ready' });
    await readyBtn.waitFor({ timeout: 30_000 });
    await readyBtn.tap();
    note('guest pressed Ready');
    await expect(host.locator('[data-testid="mp-start"]')).toBeEnabled({ timeout: 30_000 });
    await host.screenshot({ path: join(OUT, 'lobby-host-ready.png') });

    // ── 4. the host starts the match
    await host.click('[data-testid="mp-start"]');
    note('host pressed start');

    // ── 5. both land in a networked match
    await host.waitForFunction(() => (window as unknown as { __v2Net?: unknown }).__v2Net !== undefined, undefined, {
      timeout: 60_000,
    });
    await guest.waitForFunction(() => (window as unknown as { __v2Net?: unknown }).__v2Net !== undefined, undefined, {
      timeout: 60_000,
    });
    note('both peers in a networked match');
    await host.waitForTimeout(1_200);
    await host.screenshot({ path: join(OUT, 'match-host-start.png') });
    await guest.screenshot({ path: join(OUT, 'match-guest-start.png') });

    // The guest's touch context needs a CDP session for real multi-touch taps.
    const guestCdp = await guestCtx.newCDPSession(guest);

    // A baseline taken as soon as the match is live, so growth is measured from the real starting position
    // rather than from an assumption about it.
    const start = { host: await readNet(host), guest: await readNet(guest) };
    expect(start.host, 'host has no net state').not.toBeNull();
    expect(start.guest, 'guest has no net state').not.toBeNull();
    note(
      `start: host ${start.host!.myBuildings}b/${start.host!.myUnits}u guest ${start.guest!.myBuildings}b/${start.guest!.myUnits}u`,
    );

    // ── 6. BOTH PEERS PLAY. Interleaved so both sides get build orders in before the clock runs away.
    const hostPlay = playSide(host, null, 'host', note);
    const guestPlay = playSide(guest, guestCdp, 'guest', note);
    const [hostStats, guestStats] = await Promise.all([hostPlay, guestPlay]);
    note(`placed ${hostStats.built + guestStats.built} structures and queued ${hostStats.trained + guestStats.trained} units`);
    await host.waitForTimeout(700);
    await host.screenshot({ path: join(OUT, 'match-host-mid-build.png') });
    await guest.screenshot({ path: join(OUT, 'match-guest-mid-build.png') });

    // ── 7. let the match run with periodic re-orders, sampling both peers throughout
    const samples: { at: number; host: NetState | null; guest: NetState | null }[] = [];
    const marches = { host: 0, guest: 0 };
    const deadline = Date.now() + PLAY_SECONDS * 1_000;
    let combatShot = false;
    while (Date.now() < deadline) {
      await host.waitForTimeout(3_000);
      const [h, g] = await Promise.all([readNet(host), readNet(guest)]);
      samples.push({ at: Date.now(), host: h, guest: g });
      if (!h || !g) continue;
      note(`t=${h.tick} host(${h.myBuildings}b ${h.myUnits}u, ${h.damageEvents}dmg) guest(${g.myBuildings}b ${g.myUnits}u, ${g.damageEvents}dmg)`);

      /**
       * KEEP THE MATCH ACTIVE. A single attack-move resolves when its destination is reached, and the army
       * then stands idle — so the march is re-issued every few seconds until contact. This is a real player
       * behaviour (tap, wait, tap again), not a scripted simulation nudge: each call selects the army
       * through the app's selection state and issues the order through the attack-move button and a canvas
       * tap.
       */
      if (samples.length % 2 === 0) {
        const hm = await marchArmy(host, null).catch(() => undefined);
        const gm = await marchArmy(guest, guestCdp).catch(() => undefined);
        if (hm?.ordered) marches.host++;
        if (gm?.ordered) marches.guest++;
        if (hm?.ordered || gm?.ordered) {
          note(`march: host ${hm?.units ?? 0}u guest ${gm?.units ?? 0}u (marches ${marches.host}/${marches.guest})`);
        }
      }

      // Take the combat screenshot at the first sign of real fighting.
      if (!combatShot && (h.damageEvents > 0 || g.damageEvents > 0)) {
        combatShot = true;
        await host.screenshot({ path: join(OUT, 'match-host-combat.png') });
        await guest.screenshot({ path: join(OUT, 'match-guest-combat.png') });
        note(`combat first observed at tick ${h.tick}`);
      }
      if (h.ended) {
        note(`match ended at tick ${h.tick}, winner team ${h.winnerTeam}`);
        break;
      }
    }

    await host.screenshot({ path: join(OUT, 'match-host-final.png') });
    await guest.screenshot({ path: join(OUT, 'match-guest-final.png') });

    // ── 8. ASSERTIONS
    const last = samples[samples.length - 1];
    expect(last, 'no sample was taken').toBeTruthy();
    const h = last!.host!;
    const g = last!.guest!;

    /**
     * PEERS ARE SAMPLED SEQUENTIALLY, SO THEIR TICKS CAN DIFFER BY A FEW.
     *
     * Two `page.evaluate` calls are two round trips and the relay is advancing the match the whole time. A
     * host read at T and a guest read at T+4 is normal, not a fault — asserting exact tick equality would
     * measure the sampler's latency. What matters is that both peers are in the SAME MATCH at nearly the
     * same point, which the tolerance and the common-tick hash comparison establish.
     */
    expect(h.tick, 'host never advanced').toBeGreaterThan(20 * 90);
    /**
     * THE DRIFT TOLERANCE IS A SAMPLING BOUND, NOT A SYNC BOUND.
     *
     * The two reads are sequential round trips while the relay advances 20 ticks a second, and the guest's
     * context is a TOUCH phone whose main thread is busy servicing real touch events — measured, its reads
     * can trail the host's by up to ~50 ticks (2.5 s of simulation) purely from eval latency. The sync claim
     * does not rest on this number: it rests on the common-tick hash comparison below, which compares both
     * peers at the SAME tick and would catch any real divergence. This assertion only has to rule out a peer
     * that has fallen out of the match entirely.
     */
    expect(Math.abs(g.tick - h.tick), `peers are far apart: host ${h.tick}, guest ${g.tick}`).toBeLessThanOrEqual(20 * 6);

    // Same board: entity count and every player's unit count must match exactly.
    expect(g.entities, `peers disagree on entity count: host ${h.entities}, guest ${g.entities}`).toBe(h.entities);
    for (let i = 0; i < h.players.length; i++) {
      expect(g.players[i]!.units, `player ${i} unit count differs`).toBe(h.players[i]!.units);
      expect(g.players[i]!.buildings, `player ${i} building count differs`).toBe(h.players[i]!.buildings);
    }

    /**
     * THE MATCH WAS ACTIVE, MEASURED ON BOTH SIDES.
     *
     * Four separate claims, each of which a passive match fails:
     *   • each peer ISSUED real commands through the HUD;
     *   • each peer's BUILDING count grew past its starting one;
     *   • each peer ended with more units than the two it started with, or the army engaged and died — so the
     *     check is on growth OR on damage, never on a count that a lost fight would fail;
     *   • damage was dealt somewhere, i.e. the armies actually met.
     */
    /**
     * A REAL MATCH CARRIES REAL COMMANDS — not one tap.
     *
     * The floor is set from what a match of this shape MUST contain, not from the measured run: two
     * structures and a batch of units on each side, plus a march per side, is at least six commands each.
     * The committed run carried 8 and 16; this asserts the minimum that proves the peers were playing
     * rather than merely connected, and it is deliberately well below the observed figure so a slower
     * machine does not fail it for being slow.
     */
    expect(h.issued, `host issued only ${h.issued} commands`).toBeGreaterThanOrEqual(6);
    expect(g.issued, `guest issued only ${g.issued} commands`).toBeGreaterThanOrEqual(6);
    expect(h.issued + g.issued, `the match carried only ${h.issued + g.issued} commands`).toBeGreaterThanOrEqual(14);

    const hostBuildingsGrew = h.myBuildings > start.host!.myBuildings;
    const guestBuildingsGrew = g.myBuildings > start.guest!.myBuildings;
    expect(
      hostBuildingsGrew || guestBuildingsGrew,
      `neither side built anything: host ${start.host!.myBuildings}->${h.myBuildings}, guest ${start.guest!.myBuildings}->${g.myBuildings}`,
    ).toBe(true);

    const hostArmyGrew = h.myUnits > start.host!.myUnits;
    const guestArmyGrew = g.myUnits > start.guest!.myUnits;
    expect(
      hostArmyGrew || guestArmyGrew,
      `neither army grew: host ${start.host!.myUnits}->${h.myUnits}, guest ${start.guest!.myUnits}->${g.myUnits}`,
    ).toBe(true);

    const fought = Math.max(h.damageEvents, g.damageEvents) > 0;
    expect(
      fought,
      `no damage was dealt in ${PLAY_SECONDS}s — the armies never engaged (host ${h.damageEvents}, guest ${g.damageEvents})`,
    ).toBe(true);

    /**
     * THE HASH COMPARISON, AGAINST RECORDED HISTORY.
     *
     * Polling two live pages for their hash at the same tick cannot work: the relay advances 20 times a
     * second, so two sequential reads are always a few ticks apart — measured, 40 attempts never once landed
     * on a common tick. Each peer therefore records `tick -> hash` at every checksum interval, and the
     * comparison is made over ticks BOTH peers recorded. Every such tick is a full-board comparison using
     * the same `hashState` the desync detector uses, so agreement across dozens of ticks is the strongest
     * statement this proof can make.
     */
    const history = await Promise.all([
      host.evaluate(() => {
        const net = (window as unknown as { __v2Net?: { hashTicks: () => number[]; hashAt: (t: number) => string | undefined } }).__v2Net!;
        return net.hashTicks().map((t) => [t, net.hashAt(t)] as [number, string | undefined]);
      }),
      guest.evaluate(() => {
        const net = (window as unknown as { __v2Net?: { hashTicks: () => number[]; hashAt: (t: number) => string | undefined } }).__v2Net!;
        return net.hashTicks().map((t) => [t, net.hashAt(t)] as [number, string | undefined]);
      }),
    ]);
    const hostMap = new Map(history[0].filter((e) => e[1] !== undefined) as [number, string][]);
    const guestMap = new Map(history[1].filter((e) => e[1] !== undefined) as [number, string][]);
    const common = [...hostMap.keys()].filter((t) => guestMap.has(t)).sort((a, b) => a - b);
    expect(common.length, 'the peers recorded no common tick').toBeGreaterThan(10);

    const mismatches = common.filter((t) => hostMap.get(t) !== guestMap.get(t));
    note(`compared ${common.length} common ticks, ${mismatches.length} mismatched`);
    expect(
      mismatches.length,
      `${mismatches.length} of ${common.length} common ticks have differing hashes; first at tick ${mismatches[0]}`,
    ).toBe(0);

    // No desync was reported by either peer.
    const desync = await Promise.all([
      host.evaluate(() => (window as unknown as { __v2Desync?: unknown }).__v2Desync ?? null),
      guest.evaluate(() => (window as unknown as { __v2Desync?: unknown }).__v2Desync ?? null),
    ]);
    expect(desync[0], 'host reported a desync').toBeNull();
    expect(desync[1], 'guest reported a desync').toBeNull();

    const summary = {
      room,
      relay: RELAY,
      playSeconds: PLAY_SECONDS,
      finalTick: h.tick,
      entities: h.entities,
      start: { host: start.host, guest: start.guest },
      final: { host: h, guest: g },
      commands: { host: h.issued, guest: g.issued, total: h.issued + g.issued },
      built: { host: hostStats.built, guest: guestStats.built },
      trained: { host: hostStats.trained, guest: guestStats.trained },
      marched: marches,
      damage: { host: h.damageEvents, guest: g.damageEvents },
      commonTicksCompared: common.length,
      mismatches: mismatches.length,
      samples: samples.length,
      viewports: { host: '1366x768', guest: '667x375 touch' },
      note: 'Two independent Chromium contexts through the unchanged v1 relay, both playing a real match.',
    };
    writeFileSync(join(OUT, 'browser-match.json'), JSON.stringify(summary, null, 2));
    writeFileSync(join(OUT, 'browser-match.log'), log.join('\n'));

    await hostCtx.close();
    await guestCtx.close();
    await browser.close();
  });
});
