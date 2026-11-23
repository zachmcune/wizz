// THE APP — the shell: router, match lifecycle, and the touch/mouse input binding.
//
// One root element, one screen at a time, composed from the Obsidian & Brass design system. Screens are
// plain functions that build DOM and return a cleanup callback; the router owns which one is mounted, so
// no screen needs to know about any other.
//
// INPUT IS ONE PATH FOR BOTH INPUT DEVICES. A mouse is a pointer with one button, so the same gesture
// recogniser that gives a phone tap-to-select / drag-to-pan / pinch-to-zoom also gives desktop
// click-to-select / drag-to-box / wheel-to-zoom. Keyboard panning and shortcuts run alongside. That is
// not an economy — it means a bug fixed on touch is fixed on desktop, and the Playwright proofs can
// drive one code path instead of two.
//
// FRAMING IS INSET-AWARE. The camera is told the measured HUD insets on every mount and resize, so
// "centre on my Sanctum" puts it in the middle of the BATTLEFIELD rather than in the middle of the
// window, where the sidebar would cover it.
import '../ui/fonts.css';
import '../ui/tokens.css';
import '../ui/components.css';
import '../ui/screens.css';
import './app.css';
import './console.css';
import './hud.css';

import { loadRegistry } from '../data/loader';
import type { Registry } from '../data/registry';
import { loadAtlas, type LoadedAtlas } from '../render/atlas';
import { hashState } from '../sim/hash';
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
import { mountMultiplayer } from './screens/multiplayer';
import { NetworkedMatch } from './networked-match';
import { WebSocketTransport } from '../net/ws-transport';
import type { SlotSpec } from '../net/session';
import type { LobbyStateWire } from '../net/protocol';
import { GestureRecognizer } from './input/gesture';
import { BoardInput } from './input/board-input';
import { PointerBinder } from './input/pointer-binder';
import type { Camera } from '../render/camera';

/** Everything a networked match needs to exist, produced by the multiplayer lobby. */
export interface MultiplayerJoin {
  room: string;
  relayUrl: string;
  connId: string;
  playerId: string;
  seed: number;
  startTick: number;
  lobby: LobbyStateWire;
}

/** A screen builder returns its root plus a teardown for anything it owns (listeners, RAF, renderer). */
export type Screen = { root: HTMLElement; destroy?: () => void };

export interface AppDeps {
  registry: Registry;
  atlas: LoadedAtlas;
}

/** The live match, whether local or networked. Both classes implement this surface. */
export interface LiveMatch {
  state: import('../sim/types').GameState;
  services: import('../sim/context').SimServices;
  me: import('../sim/types').PlayerId;
  camera: Camera;
  rend: import('../render/renderer').Renderer;
  readonly elapsedSeconds: number;
  issue: (cmd: import('./match').CommandPayload) => boolean;
  myUnits: () => number[];
}

export class App {
  private deps: AppDeps;
  private state: AppState;
  private root: HTMLElement;
  private screenRoot: HTMLElement;
  private current: Screen | null = null;
  private match: MatchController | null = null;
  private netMatch: NetworkedMatch | null = null;
  private hud: Hud | null = null;
  private hudHost: HTMLElement | null = null;
  private researchOverlay: HTMLElement | null = null;
  private researchDestroy: (() => void) | null = null;

  // ---- input
  private gesture: GestureRecognizer | null = null;
  private binder: PointerBinder | null = null;
  private boardInput: BoardInput | null = null;
  private boxEl: HTMLElement | null = null;
  private keyboardHandler: ((e: KeyboardEvent) => void) | null = null;
  /**
   * Frame driver for the gesture recogniser's clock.
   *
   * The recogniser promotes a HELD press into a box select after 400 ms of stillness, and it can only do
   * that if something calls `update(now)`. Without this loop the long-press path was dead code in the app
   * while passing its unit tests — the exact gap a unit-tested state machine leaves. The renderer already
   * runs its own rAF; this is a second, tiny one that does nothing but hand over the clock, so it cannot
   * interfere with rendering.
   */
  private gestureRaf = 0;

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

  get controller(): LiveMatch | null {
    return (this.match ?? this.netMatch) as LiveMatch | null;
  }

  /** The board-input layer, for screens and proofs that drive orders. */
  get input(): BoardInput | null {
    return this.boardInput;
  }

  private onResize = (): void => {
    const d = densityFor(window.innerWidth, window.innerHeight);
    if (d !== this.state.density) {
      this.state.density = d;
      setDensity(d);
    }
    this.hud?.syncLayout();
    this.applyHudInsets();
  };

  /** Tell the camera how much of the screen the HUD is covering, then re-frame if nothing is selected. */
  private applyHudInsets(): void {
    const cam = this.controller?.camera;
    if (!cam || !this.hud) return;
    cam.setInsets(this.hud.safeInsets());
  }

  // ───────────────────────────────────────────────────────────────────────── routing

  /** Navigate to a screen. Tears down the previous one and any match it owned. */
  go(screen: ScreenId): void {
    /**
     * Which navigations tear the match down.
     *
     * `pause` keeps it (it is an overlay). `results` ALSO keeps it: the results screen reads the final
     * GameState to build its scoreboard, so destroying the session there left every panel empty and
     * zeroed — the scoreboard rendered as a bug. The loop is stopped via `setPaused(true)` instead, and
     * the renderer lives until the player leaves results entirely.
     *
     * Every other destination (menu, lobby, settings, gallery, sandbox) frees the WebGL context;
     * without that a context leaks per match and Chromium starts dropping the oldest ones.
     */
    const keepsSession = screen === 'pause' || screen === 'results';
    const leavingMatch = this.current !== null && this.state.screen === 'match' && !keepsSession;
    if (leavingMatch) this.teardownMatch();
    if (screen === 'results' && this.match) this.match.stop();

    // Set the destination BEFORE destroying the old screen: the outgoing screen's destroy callback reads
    // `state.screen` to decide whether the session must survive this transition.
    this.state.screen = screen;
    this.current?.destroy?.();
    this.current = null;
    this.screenRoot.replaceChildren();

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
      case 'multiplayer':
        return mountMultiplayer(this);
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

  // ───────────────────────────────────────────────────────────────────────── multiplayer

  /**
   * Join a lockstep match announced by the relay.
   *
   * Kept separate from `startMatch` because the two differ in what drives the clock: a local match
   * accumulates wall time, a networked one steps only on relay-confirmed ticks. `NetworkedMatch` owns
   * that difference; this method's job is only to build the slot list from the lobby and install the
   * renderer.
   */
  startMultiplayerMatch(join: MultiplayerJoin): void {
    void this.mountMultiplayerMatch(join);
  }

  /** Resume an in-progress match after a rejoin, adopting the host's state. */
  resumeMultiplayer(join: MultiplayerJoin): void {
    void this.mountMultiplayerMatch(join);
  }

  private async mountMultiplayerMatch(join: MultiplayerJoin): Promise<void> {
    this.teardownMatch();
    this.state.screen = 'match';
    this.current?.destroy?.();
    this.current = null;
    this.screenRoot.replaceChildren();

    const { host, canvasHost } = this.buildMatchHost();

    const slots: SlotSpec[] = join.lobby.slots
      .filter((s) => s.kind !== 'closed')
      .map((s, i) => ({
        id: s.id,
        controller: s.kind === 'ai' ? 'ai' : 'human',
        team: i,
        color: s.color,
        factionId: s.factionId,
        startIndex: s.startIndex ?? i,
        ...(s.aiDifficulty ? { aiDifficulty: s.aiDifficulty } : {}),
      }));

    const socket = new WebSocket(join.relayUrl);
    const transport = new WebSocketTransport(socket);
    transport.enableReconnect({ url: join.relayUrl, room: join.room, connId: join.connId });
    socket.addEventListener('open', () => {
      transport.sendRaw({ t: 'rejoin', room: join.room.toUpperCase(), connId: join.connId });
    });

    const net = await NetworkedMatch.create({
      registry: this.deps.registry,
      atlas: this.deps.atlas,
      host: canvasHost,
      transport,
      mapId: join.lobby.mapId,
      seed: join.seed,
      slots,
      localPlayerId: join.playerId,
      onTick: (st) => this.hud?.update(st),
      onEnd: () => this.go('results'),
      onReject: (reason) => this.hud?.note('warn', humanizeReject(reason)),
      onDesync: (capture) => {
        // A desync is reported to the player AND captured, because reproducing it offline is the only way it
        // gets fixed. The capture carries the command log from tick 0.
        this.hud?.note('bad', `Desync detected at tick ${capture.tick}. The match can continue but peers disagree.`);
        (window as unknown as { __v2Desync?: unknown }).__v2Desync = capture;
      },
      onStallHint: (hint) => this.hud?.note('warn', hint),
      onEvents: (events) => {
        for (const ev of events) {
          if (ev.type === 'damageDealt' || ev.type === 'attackFired') counters.damage++;
          else if (ev.type === 'entityDied') counters.kills++;
        }
      },
    });

    this.netMatch = net;
    this.installHud(net as unknown as LiveMatch, host);
    net.start();
    this.hud!.update(net.state);
    this.frameOnMyBase();
    this.selectFirstOwned();

    /**
     * Instrumentation the match proof reads: commands issued, damage events and deaths.
     *
     * A proof that asserted "the match was active" from a clock alone would pass on a match where nobody
     * did anything, which is exactly the failure this replaces. These counters are incremented from the
     * simulation's own EVENT stream, so they cannot be inflated by a UI that thinks it did something.
     */
    const counters = { issued: 0, damage: 0, kills: 0 };
    const originalIssue = net.issue.bind(net);
    net.issue = (cmd) => {
      const ok = originalIssue(cmd);
      if (ok) counters.issued++;
      return ok;
    };

    (window as unknown as { __v2Net?: unknown }).__v2Net = {
      state: net.state,
      session: net.session,
      playerId: join.playerId,
      /** Commands this peer accepted, from the app's own command path. */
      issued: () => counters.issued,
      /** Damage events seen by this peer's simulation. */
      damage: () => counters.damage,
      /** Deaths seen by this peer's simulation. */
      kills: () => counters.kills,
      /**
       * The canonical state hash, computed by the SAME function lockstep compares.
       *
       * Exposed so the browser proof can assert agreement on exactly the quantity that matters. A test that
       * recomputed a hash of its own would be asserting a different thing — and a simpler one — than the live
       * desync detector.
       */
      hash: () => hashState(net.state),
      /** Recorded `tick -> hash` history, so an external observer can compare peers at the same tick. */
      hashAt: (t: number) => net.session.hashAt(t),
      hashTicks: () => net.session.hashTicks(),
    };

    this.current = {
      root: host,
      destroy: () => {
        if (this.state.screen === 'results' || this.state.screen === 'pause') return;
        this.teardownMatch();
      },
    };
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
    const { host, canvasHost } = this.buildMatchHost();

    this.match = await MatchController.create(this.deps.registry, this.deps.atlas, this.state.lobby, canvasHost, {
      onTick: (st) => this.hud?.update(st),
      onEnd: () => this.go('results'),
      onReject: (reason) => this.hud?.note('warn', humanizeReject(reason)),
    });

    this.installHud(this.match as unknown as LiveMatch, host);
    this.match.start();
    this.hud!.update(this.match.state);
    this.frameOnMyBase();

    // Selection starts on the player's first building so the HUD is populated — the v1 lobby dropped
    // the player into an empty screen with no hint of what to do.
    this.selectFirstOwned();

    // Re-bind the router's notion of the current screen to this live one.
    // The match screen's teardown must NOT destroy a session that a following screen still needs. When
    // the router is navigating to `results` or `pause`, `go()` handles the lifecycle; this callback only
    // frees the renderer when the match screen is genuinely being replaced.
    this.current = {
      root: host,
      destroy: () => {
        if (this.state.screen === 'results' || this.state.screen === 'pause') return;
        this.teardownMatch();
      },
    };
  }

  /** The match host: a full-bleed canvas plus the HUD's own layer, in one positioned box. */
  private buildMatchHost(): { host: HTMLElement; canvasHost: HTMLElement } {
    const host = el('div', 'match-root') as HTMLElement;
    host.className = 'match-root';
    const canvasHost = document.createElement('div');
    canvasHost.className = 'match-canvas';
    canvasHost.dataset.testid = 'game-canvas-host';
    host.append(canvasHost);
    this.screenRoot.append(host);
    return { host, canvasHost };
  }

  /**
   * Build and attach the HUD and the whole input stack for a live match.
   *
   * One function for both controllers: the HUD, the gestures and the picking are all identical offline
   * and online, because both controllers implement the same surface. A second wiring for multiplayer is
   * how the two would drift.
   */
  private installHud(match: LiveMatch, host: HTMLElement): void {
    const map = this.deps.registry.map(match.state.mapId);
    this.boxEl = el('div', 'hud-box');
    this.boxEl.dataset.testid = 'hud-box';

    this.boardInput = new BoardInput({
      getState: () => match.state,
      getServices: () => match.services,
      registry: this.deps.registry,
      map: () => map,
      me: () => match.me,
      viewport: () => ({ w: window.innerWidth, h: window.innerHeight }),
      camera: () => match.camera,
      app: this.state,
      issue: (cmd) => match.issue(cmd),
      note: (kind, text) => this.hud?.note(kind, text),
      onChange: () => {
        this.syncPlacementOverlay();
        this.hud?.refresh(match.state);
      },
    });

    this.hud = new Hud(match as unknown as MatchController, this.deps.registry, this.state, {
      atlas: this.deps.atlas,
      input: this.boardInput,
      onOpenResearch: () => this.openResearchTree(),
      onPause: () => this.go('pause'),
    });
    this.hudHost = this.hud.root;
    host.append(this.hud.root, this.boxEl);

    // Gestures. Touch defaults to drag-to-PAN, which is what a phone player expects; a long press still
    // starts a box select, and desktop gets drag-to-box because a mouse drag on the board has always
    // meant "select". The `?drag=` override exists for the proof harness to drive both.
    const dragMode = new URLSearchParams(window.location.search).get('drag') === 'pan' ? 'pan' : touchDefaultDrag();
    let boxOrigin: { x: number; y: number } | null = null;
    this.gesture = new GestureRecognizer(
      {
        onTap: (p) => this.boardInput?.tap(p),
        onDoubleTap: (p) => this.boardInput?.doubleTap(p),
        onPanMove: (dx, dy) => this.boardInput?.pan(dx, dy),
        onTwoFingerPan: (dx, dy) => this.boardInput?.pan(dx, dy),
        onPinch: (factor, center) => this.boardInput?.pinch(factor, center),
        onBoxStart: (p) => {
          boxOrigin = { ...p };
          this.boardInput?.showBox({ x: p.x, y: p.y, w: 0, h: 0 });
        },
        onBoxMove: (p) => {
          if (!boxOrigin) return;
          this.boardInput?.showBox(normaliseBoxFromStart(boxOrigin, p));
        },
        onBoxEnd: (a, b) => {
          boxOrigin = null;
          this.boardInput?.showBox(null);
          this.boardInput?.boxSelect(a, b);
        },
        onLongPress: () => {
          // A long press is a deliberate box select even in pan mode; the HUD says so.
          this.hud?.note('info', 'Drag to select');
        },
      },
      dragMode,
    );

    const canvas = match.rend.app.canvas;
    this.binder = new PointerBinder({
      canvas,
      gesture: this.gesture,
      input: this.boardInput,
      isInert: () => match.state.ended || this.state.screen !== 'match',
    });
    this.binder.attach();

    this.boardInput.attachBox(this.boxEl);
    // The box is `position: fixed`, so it belongs to the app root rather than to the HUD's grid.
    this.root.append(this.boxEl);

    // Drive the recogniser's clock (see `gestureRaf`).
    const pump = (now: number): void => {
      this.gesture?.update(now);
      this.gestureRaf = requestAnimationFrame(pump);
    };
    this.gestureRaf = requestAnimationFrame(pump);

    this.hud.syncLayout();
    this.applyHudInsets();
    this.attachKeyboard(match);
    this.syncPlacementOverlay();
  }

  /**
   * Push the current placement ghost into the renderer.
   *
   * Called on every input change rather than every frame: the ghost only moves when the pointer moves or
   * the selection changes, and rebuilding a Graphics per frame for a static ghost is waste.
   */
  private syncPlacementOverlay(): void {
    const match = this.controller;
    const input = this.boardInput;
    if (!match) return;
    match.rend.setPlacement(input?.ghost ?? null, input?.zoneTiles ?? []);
  }

  private attachKeyboard(match: LiveMatch): void {
    this.detachKeyboard();
    const onKey = (e: KeyboardEvent): void => {
      if (this.state.screen !== 'match' && this.state.screen !== 'sandbox') return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const cam = match.camera;
      const step = 60;
      switch (e.key) {
        case 'Escape':
          if (this.boardInput?.armed) this.boardInput.disarm();
          else if (this.state.placing) this.boardInput?.cancelPlacement();
          else this.go('pause');
          e.preventDefault();
          return;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          if (e.key === 'a' && !e.ctrlKey && !e.metaKey) {
            this.boardInput?.arm('attackMove');
            e.preventDefault();
            return;
          }
          cam.panByScreen(step, 0);
          e.preventDefault();
          return;
        case 'ArrowRight':
        case 'd':
        case 'D':
          cam.panByScreen(-step, 0);
          e.preventDefault();
          return;
        case 'ArrowUp':
        case 'w':
        case 'W':
          cam.panByScreen(0, step);
          e.preventDefault();
          return;
        case 'ArrowDown':
        case 's':
        case 'S':
          cam.panByScreen(0, -step);
          e.preventDefault();
          return;
        case '+':
        case '=':
          cam.zoomBy(1.15);
          e.preventDefault();
          return;
        case '-':
        case '_':
          cam.zoomBy(1 / 1.15);
          e.preventDefault();
          return;
        case ' ':
          if (e.shiftKey) {
            cam.centerInSafeArea(match.state.players[0] ? match.state.entities.posX[0]! : 0, match.state.entities.posY[0]!);
            e.preventDefault();
          }
          return;
        default:
          break;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        this.state.selection = new Set(match.myUnits());
        this.hud?.refresh(match.state);
        return;
      }
      if (e.key === 'Home') {
        this.frameOnMyBase();
        e.preventDefault();
      }
    };
    this.keyboardHandler = onKey;
    window.addEventListener('keydown', onKey);
  }

  private detachKeyboard(): void {
    if (this.keyboardHandler) window.removeEventListener('keydown', this.keyboardHandler);
    this.keyboardHandler = null;
  }

  private liveMatchScreen(): Screen {
    // Not used directly; `mountMatchAsync` installs `this.current`.
    const host = document.createElement('div');
    return { root: host };
  }

  private teardownMatch(): void {
    this.detachKeyboard();
    if (this.gestureRaf) cancelAnimationFrame(this.gestureRaf);
    this.gestureRaf = 0;
    this.binder?.detach();
    this.binder = null;
    this.gesture = null;
    this.boardInput = null;
    this.boxEl?.remove();
    this.boxEl = null;
    this.hud?.destroy();
    this.netMatch?.destroy();
    this.netMatch = null;
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
    this.researchDestroy = tree.destroy;
    this.researchOverlay = el('div', 'screen screen--research-overlay');
    this.researchOverlay.append(tree.root);
    this.root.append(this.researchOverlay);
  }

  closeResearchTree(): void {
    // Release the resize observer with the overlay, or every open/close leaks one.
    this.researchDestroy?.();
    this.researchDestroy = null;
    this.researchOverlay?.remove();
    this.researchOverlay = null;
  }

  get hudRef(): Hud | null {
    return this.hud;
  }

  /**
   * Centre the camera on the local player's Sanctum, inside the HUD-free playable rect.
   *
   * Called on mount and after a resize. The Sanctum is the anchor because it is the one thing every
   * player must be able to find instantly; v1 centred there too.
   */
  frameOnMyBase(): void {
    const match = this.controller;
    if (!match) return;
    applyHudInsetsToCamera(match.camera, this.hud);
    const st = match.state;
    const myIndex = st.players.findIndex((p) => p.id === match.me);
    if (myIndex < 0) return;
    let sx = 0;
    let sy = 0;
    let found = false;
    for (let s = 0; s < st.entities.count; s++) {
      if (st.entities.dead[s]) continue;
      if (st.entities.kind[s] !== 1) continue;
      if (st.entities.ownerIndex[s] !== myIndex) continue;
      const def = this.deps.registry.buildings.get(st.entities.extras[s]!.defId);
      if (!def?.isConstructionYard) continue;
      sx = st.entities.posX[s]!;
      sy = st.entities.posY[s]!;
      found = true;
      break;
    }
    if (!found) return;
    match.camera.frameOn(sx, sy);
  }

  private selectFirstOwned(): void {
    const match = this.controller;
    if (!match) return;
    const st = match.state;
    const myIndex = st.players.findIndex((p) => p.id === match.me);
    for (let s = 0; s < st.entities.count; s++) {
      if (st.entities.dead[s] || st.entities.kind[s] !== 1) continue;
      if (st.entities.ownerIndex[s] !== myIndex) continue;
      this.state.selection = new Set([st.entities.id[s]!]);
      this.hud?.refresh(st);
      return;
    }
  }

  /** Resume from pause: re-enter the live match without rebuilding it. */
  resume(): void {
    const live = this.controller;
    if (!live) {
      void this.startMatch();
      return;
    }
    this.current?.destroy?.();
    this.current = null;
    this.screenRoot.replaceChildren();
    const { host, canvasHost } = this.buildMatchHost();

    // The renderer's canvas is reused — moving it into the new host keeps the WebGL context alive, which
    // is both faster and avoids context-loss churn when pausing repeatedly.
    const existing = live.rend.app.canvas;
    canvasHost.append(existing);
    if (this.hudHost) host.append(this.hudHost);
    if (this.boxEl) host.append(this.boxEl);

    this.screenRoot.append(host);
    this.state.screen = 'match';
    if (this.match) this.match.setPaused(false);
    if (this.netMatch) this.netMatch.setPaused(false);

    // Re-arm the input on the (unchanged) canvas: the listeners were on the canvas and survive a
    // re-parent, but the binder holds a reference to the canvas element only, so nothing needs rewiring.
    this.hud?.syncLayout();
    this.applyHudInsets();
    this.attachKeyboard(live);
    this.current = {
      root: host,
      destroy: () => {
        if (this.state.screen === 'results' || this.state.screen === 'pause') return;
        this.teardownMatch();
      },
    };
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

/** Apply the HUD's measured insets to a camera, tolerating a missing HUD (sandbox, tests). */
function applyHudInsetsToCamera(cam: Camera, hud: Hud | null): void {
  if (!hud) {
    cam.setInsets({ left: 0, top: 0, right: 0, bottom: 0 });
    return;
  }
  cam.setInsets(hud.safeInsets());
}

/**
 * What a one-finger drag means by default for this device.
 *
 * A coarse pointer (a finger) pans, because looking around is the most common gesture on a phone and a
 * select-drag that pans instead is the single most irritating thing a touch RTS can do. A fine pointer
 * boxes, because that is what a mouse drag has always meant. Both are still available on both: a long
 * press starts a box on touch, and `?drag=` overrides for the proof harness.
 */
function touchDefaultDrag(): 'pan' | 'select' {
  try {
    return window.matchMedia('(pointer: coarse)').matches ? 'pan' : 'select';
  } catch {
    return 'select';
  }
}

/** Normalise two viewport points into a rect. Local to the input wiring. */
function normaliseBoxFromStart(a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number; w: number; h: number } {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}

/** Turn a sim rejection code into something a player can act on. */
export function humanizeReject(reason: string): string {
  const map: Record<string, string> = {
    not_enough_mana: 'Not enough mana.',
    mana: 'Not enough mana.',
    unit_cap: 'Unit cap reached.',
    limit: 'You already have one.',
    invalid_placement: 'Cannot build there.',
    blocked: 'That spot is blocked.',
    range: 'Too far from your base.',
    no_power: 'Not enough power.',
    requires_tech: 'Research required.',
    requires: 'Research required.',
    faction: 'Not available to your faction.',
    queue_full: 'Production queue is full.',
    capacity: 'That structure is full.',
    duplicate: 'Already queued.',
    cooldown: 'Still recharging.',
    busy: 'That structure is busy.',
    cannot_sell: 'That cannot be sold.',
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
