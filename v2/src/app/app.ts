// THE APP — Phase 4's real UI shell.
//
// One root element, one screen at a time, all of it composed from the Obsidian & Brass design system.
// Screens are plain functions that build DOM and return a cleanup callback; the router owns which one is
// mounted, so no screen needs to know about any other.
//
// Everything here is wired to the live simulation: the lobby creates a real `MatchController`, the HUD
// reads real `GameState` every tick, the build/train/research panels issue real `Command`s, and the
// results screen reads the real winner.
import '../ui/fonts.css';
import '../ui/tokens.css';
import '../ui/components.css';
import '../ui/screens.css';
import './app.css';
import './hud.css';

import { loadRegistry } from '../data/loader';
import type { Registry } from '../data/registry';
import { loadAtlas, type LoadedAtlas } from '../render/atlas';
import { densityFor, el, setDensity } from '../ui/kit';
import { createAppState, type AppState, type ScreenId } from './state';
import { MatchController } from './match';
import { Hud } from './hud';
import { mountMenu } from './screens/menu';
import { mountLobby } from './screens/lobby';
import { mountSettings } from './screens/settings';
import { mountPause } from './screens/pause';
import { mountResults } from './screens/results';
import { mountSandbox } from './screens/sandbox';
import { mountGallery } from './screens/gallery';
import { mountResearchTree } from './screens/research';

/** A screen builder returns its root plus a teardown for anything it owns (listeners, RAF, renderer). */
export type Screen = { root: HTMLElement; destroy?: () => void };

export interface AppDeps {
  registry: Registry;
  atlas: LoadedAtlas;
}

export class App {
  private deps: AppDeps;
  private state: AppState;
  private root: HTMLElement;
  private screenRoot: HTMLElement;
  private current: Screen | null = null;
  private match: MatchController | null = null;
  private hud: Hud | null = null;
  private hudHost: HTMLElement | null = null;
  private researchOverlay: HTMLElement | null = null;

  constructor(root: HTMLElement, deps: AppDeps) {
    this.root = root;
    this.deps = deps;
    this.state = createAppState(deps.registry, densityFor(window.innerWidth, window.innerHeight));

    setDensity(this.state.density);
    this.root.replaceChildren();
    this.root.className = 'app-root';
    this.screenRoot = document.createElement('div');
    this.screenRoot.className = 'app-screen';
    this.root.append(this.screenRoot);

    window.addEventListener('resize', this.onResize);

    // Expose for the proof harness and for manual QA. Read-only by convention; the harness uses it to
    // drive the app the same way a player would.
    (window as unknown as { __app?: unknown }).__app = this;
  }

  get appState(): AppState {
    return this.state;
  }

  /** The loaded content registry and atlas, for screens that need to render or query defs. */
  get registry(): Registry {
    return this.deps.registry;
  }

  get atlas(): LoadedAtlas {
    return this.deps.atlas;
  }

  get controller(): MatchController | null {
    return this.match;
  }

  private onResize = (): void => {
    const d = densityFor(window.innerWidth, window.innerHeight);
    if (d !== this.state.density) {
      this.state.density = d;
      setDensity(d);
    }
  };

  // ───────────────────────────────────────────────────────────────────────── routing

  /** Navigate to a screen. Tears down the previous one and any match it owned. */
  go(screen: ScreenId): void {
    // Leaving the match tears down the renderer, which frees the WebGL context. Not doing this leaks a
    // context per match and Chromium starts dropping the oldest ones.
    const leavingMatch = this.current !== null && this.state.screen === 'match' && screen !== 'pause';
    if (leavingMatch) this.teardownMatch();

    this.current?.destroy?.();
    this.current = null;
    this.screenRoot.replaceChildren();
    this.state.screen = screen;

    const s = this.buildScreen(screen);
    this.current = s;
    this.screenRoot.append(s.root);
    // The URL carries the screen so a reload lands back where the player was, and so the proof harness
    // can deep-link any screen.
    const url = new URL(window.location.href);
    url.searchParams.set('screen', screen);
    window.history.replaceState(null, '', url.toString());
  }

  private buildScreen(screen: ScreenId): Screen {
    switch (screen) {
      case 'menu':
        return mountMenu(this);
      case 'lobby':
        return mountLobby(this);
      case 'settings':
        return mountSettings(this);
      case 'match':
        return this.mountMatch();
      case 'pause':
        return mountPause(this);
      case 'results':
        return mountResults(this);
      case 'sandbox':
        return mountSandbox(this);
      case 'gallery':
        return mountGallery(this);
    }
  }

  // ───────────────────────────────────────────────────────────────────────── match lifecycle

  /**
   * Start a match from the current lobby config.
   *
   * Async because the renderer needs a WebGL context and the atlas is already loaded; the caller
   * (`lobby`) awaits it so a failure can be shown on the lobby rather than silently doing nothing.
   */
  /**
   * Start a match in sandbox mode and land ON the sandbox screen.
   *
   * `startMatch()` navigates to the match screen, which is right for the lobby but wrong for the
   * sandbox — it would drop the player out of the dev tools they just opened.
   */
  async startSandbox(): Promise<void> {
    this.state.lobby.sandbox = true;
    await this.startMatch();
    // `startMatch` installed the live match; re-mount the sandbox so it wraps that match.
    this.current?.destroy?.();
    this.current = null;
    this.screenRoot.replaceChildren();
    const s = mountSandbox(this);
    this.current = s;
    this.screenRoot.append(s.root);
    this.state.screen = 'sandbox';
    const url = new URL(window.location.href);
    url.searchParams.set('screen', 'sandbox');
    window.history.replaceState(null, '', url.toString());
  }

  async startMatch(): Promise<void> {
    this.state.screen = 'match';
    this.current?.destroy?.();
    this.current = null;
    this.screenRoot.replaceChildren();

    await this.mountMatchAsync();
  }

  private mountMatch(): Screen {
    // Synchronous path: the harness calls `startMatch()` first, which has already built the session. If
    // the match was deep-linked (`?screen=match`), build one from the default lobby now.
    if (!this.match) {
      void this.mountMatchAsync();
      const wait = document.createElement('div');
      wait.className = 'app-boot';
      wait.textContent = 'Loading match…';
      return { root: wait };
    }
    return this.liveMatchScreen();
  }

  private async mountMatchAsync(): Promise<void> {
    const host = document.createElement('div');
    host.className = 'match-root';
    this.screenRoot.replaceChildren(host);

    const canvasHost = document.createElement('div');
    canvasHost.className = 'match-canvas';
    canvasHost.dataset.testid = 'game-canvas-host';
    host.append(canvasHost);

    this.match = await MatchController.create(this.deps.registry, this.deps.atlas, this.state.lobby, canvasHost, {
      onTick: (st) => this.hud?.update(st),
      onEnd: () => this.go('results'),
      onReject: (reason) => this.hud?.note('warn', humanizeReject(reason)),
    });

    this.hud = new Hud(this.match, this.deps.registry, this.state, {
      onOpenResearch: () => this.openResearchTree(),
      onPause: () => this.go('pause'),
    });
    this.hudHost = this.hud.root;
    host.append(this.hud.root);

    this.attachBoardInput(canvasHost);
    this.attachKeyboard();

    this.match.start();
    const st = this.match.state;
    this.hud.update(st);

    // Selection starts on the player's first building so the HUD is populated — the v1 lobby dropped
    // the player into an empty screen with no hint of what to do.
    this.selectFirstOwned();

    // Re-bind the router's notion of the current screen to this live one.
    this.current = { root: host, destroy: () => this.teardownMatch() };
  }

  private liveMatchScreen(): Screen {
    // Not used directly; `mountMatchAsync` installs `this.current`.
    const host = document.createElement('div');
    return { root: host };
  }

  private teardownMatch(): void {
    this.match?.destroy();
    this.match = null;
    this.hud = null;
    this.hudHost = null;
    this.state.selection.clear();
    this.state.placing = null;
    this.state.panel = 'none';
  }

  /** The live controller, for screens (pause, results, sandbox) that need it. */
  get session(): MatchController | null {
    return this.match;
  }

  /**
   * Open the research tree as an overlay ON TOP of the live match.
   *
   * It is an overlay rather than a route because the player needs to consult it mid-match; tearing the
   * match down to show it would lose the game.
   */
  openResearchTree(): void {
    if (this.researchOverlay) return;
    const tree = mountResearchTree(this, () => this.closeResearchTree());
    this.researchOverlay = el('div', 'screen screen--research-overlay');
    this.researchOverlay.append(tree.root);
    this.root.append(this.researchOverlay);
  }

  closeResearchTree(): void {
    this.researchOverlay?.remove();
    this.researchOverlay = null;
  }

  get hudRef(): Hud | null {
    return this.hud;
  }

  // ───────────────────────────────────────────────────────────────────────── board input

  private attachBoardInput(canvasHost: HTMLElement): void {
    const ctrl = this.match;
    if (!ctrl) return;
    const canvas = ctrl.rend.app.canvas;

    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let downX = 0;
    let downY = 0;

    canvas.addEventListener('pointerdown', (e) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      downX = e.clientX;
      downY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      ctrl.camera.panByScreen(e.clientX - lastX, e.clientY - lastY);
      lastX = e.clientX;
      lastY = e.clientY;
    });

    canvas.addEventListener('pointerup', (e) => {
      dragging = false;
      canvas.releasePointerCapture(e.pointerId);
      // A click is a press and release in nearly the same place; anything else was a pan.
      const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (moved > 6) return;
      const rect = canvas.getBoundingClientRect();
      const world = ctrl.rend.screenToWorld({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      this.handleBoardClick(world.x, world.y, e.shiftKey);
    });

    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        ctrl.camera.zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12);
      },
      { passive: false },
    );

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    void canvasHost;
  }

  /** Resolve a board click to a selection change or to an armed order. */
  private handleBoardClick(worldX: number, worldY: number, additive: boolean): void {
    const ctrl = this.match;
    if (!ctrl) return;
    const st = ctrl.state;

    // An armed order takes precedence over selection.
    if (this.state.placing) {
      const hit = this.entityAt(worldX, worldY);
      this.hud?.onBoardClick(worldX, worldY, hit);
      return;
    }

    const hit = this.entityAt(worldX, worldY);
    const myIndex = st.players.findIndex((p) => p.id === ctrl.me);

    if (hit !== null) {
      let slot = -1;
      for (let s = 0; s < st.entities.count; s++) if (st.entities.id[s] === hit) slot = s;
      if (slot >= 0 && st.entities.ownerIndex[slot] === myIndex) {
        if (!additive) this.state.selection.clear();
        this.state.selection.add(hit);
        this.hud?.update(st);
        return;
      }
      // Clicking an enemy with units selected issues an attack; otherwise it just clears selection.
      if (this.state.selection.size > 0) {
        const ids = [...this.state.selection];
        ctrl.issue({ type: 'attack', entityIds: ids, targetId: hit });
        return;
      }
    }

    if (!additive) this.state.selection.clear();
    this.hud?.update(st);
  }

  /** Nearest entity within a screen-space radius of the click, in world units. */
  private entityAt(worldX: number, worldY: number): number | null {
    const ctrl = this.match;
    if (!ctrl) return null;
    const st = ctrl.state;
    let best: number | null = null;
    let bestD = Infinity;
    // 26 world units is a comfortable tap radius at default zoom (~24 screen px).
    const MAX = 26;
    for (let s = 0; s < st.entities.count; s++) {
      if (st.entities.dead[s]) continue;
      const d = Math.hypot(st.entities.posX[s]! - worldX, st.entities.posY[s]! - worldY);
      if (d < MAX && d < bestD) {
        bestD = d;
        best = st.entities.id[s]!;
      }
    }
    return best;
  }

  private attachKeyboard(): void {
    const onKey = (e: KeyboardEvent): void => {
      const ctrl = this.match;
      if (!ctrl) return;
      if (e.key === 'Escape') {
        this.go('pause');
        return;
      }
      if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.state.selection = new Set(ctrl.myUnits());
        this.hud?.update(ctrl.state);
        return;
      }
      const step = 60;
      if (e.key === 'ArrowLeft') ctrl.camera.panByScreen(step, 0);
      else if (e.key === 'ArrowRight') ctrl.camera.panByScreen(-step, 0);
      else if (e.key === 'ArrowUp') ctrl.camera.panByScreen(0, step);
      else if (e.key === 'ArrowDown') ctrl.camera.panByScreen(0, -step);
      else if (e.key === '+' || e.key === '=') ctrl.camera.zoomBy(1.15);
      else if (e.key === '-') ctrl.camera.zoomBy(1 / 1.15);
    };
    window.addEventListener('keydown', onKey);
  }

  private selectFirstOwned(): void {
    const ctrl = this.match;
    if (!ctrl) return;
    const st = ctrl.state;
    const myIndex = st.players.findIndex((p) => p.id === ctrl.me);
    for (let s = 0; s < st.entities.count; s++) {
      if (st.entities.dead[s] || st.entities.kind[s] !== 1) continue;
      if (st.entities.ownerIndex[s] !== myIndex) continue;
      this.state.selection = new Set([st.entities.id[s]!]);
      this.hud?.update(st);
      return;
    }
  }

  /** Resume from pause: re-enter the live match without rebuilding it. */
  resume(): void {
    if (!this.match) {
      void this.startMatch();
      return;
    }
    this.current?.destroy?.();
    this.current = null;
    this.screenRoot.replaceChildren();
    const host = document.createElement('div');
    host.className = 'match-root';
    const canvasHost = document.createElement('div');
    canvasHost.className = 'match-canvas';
    host.append(canvasHost);

    // The renderer's canvas is reused — moving it into the new host keeps the WebGL context alive, which
    // is both faster and avoids context-loss churn when pausing repeatedly.
    const existing = this.match.rend.app.canvas;
    canvasHost.append(existing);
    if (this.hudHost) host.append(this.hudHost);

    this.screenRoot.append(host);
    this.state.screen = 'match';
    this.match.setPaused(false);
    this.current = { root: host, destroy: () => this.teardownMatch() };
    const url = new URL(window.location.href);
    url.searchParams.set('screen', 'match');
    window.history.replaceState(null, '', url.toString());
  }

  /** Leave the match entirely and return to the menu. */
  quitToMenu(): void {
    this.teardownMatch();
    this.go('menu');
  }

  /** Restart with the same lobby config. */
  restart(): void {
    this.teardownMatch();
    void this.startMatch();
  }
}

/** Turn a sim rejection code into something a player can act on. */
export function humanizeReject(reason: string): string {
  const map: Record<string, string> = {
    not_enough_mana: 'Not enough mana.',
    unit_cap: 'Unit cap reached.',
    invalid_placement: 'Cannot build there.',
    blocked: 'That spot is blocked.',
    no_power: 'Not enough power.',
    requires_tech: 'Research required.',
    queue_full: 'Production queue is full.',
    invalid_target: 'Invalid target.',
    no_such_entity: 'That no longer exists.',
    cannot_afford: 'Cannot afford that.',
  };
  return map[reason] ?? `Unavailable: ${reason.replace(/_/g, ' ')}.`;
}

// ───────────────────────────────────────────────────────────────────────── boot

export async function bootApp(): Promise<void> {
  const host = document.getElementById('boot');
  if (!host) return;
  const t0 = performance.now();
  const registry = loadRegistry();
  const atlas = await loadAtlas('/atlas-final/');
  const app = new App(host, { registry, atlas });
  const screen = new URLSearchParams(window.location.search).get('screen') ?? 'menu';
  app.go((screen as ScreenId) ?? 'menu');
  (window as unknown as { __bootMs?: number }).__bootMs = performance.now() - t0;
}

bootApp().catch((err: unknown) => {
  const host = document.getElementById('boot');
  if (host) {
    host.replaceChildren();
    const box = document.createElement('div');
    box.className = 'boot-error';
    box.textContent = `Failed to start: ${String(err)}`;
    host.append(box);
  }
  (window as unknown as { __appError?: string }).__appError = String(err);
});
