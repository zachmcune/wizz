// In-match orchestrator: wires sim + renderer + input + HUD + audio + loop together.
// Owns no gameplay rules; it only routes commands in and events out.
import { TILE, TAP_SLOP_PX, TICK_MS } from '../core/constants';
import { screenToWorld } from '../core/coords';
import { GameLoop } from '../core/game-loop';
import type { Registry } from '../data/registry';
import type { GameState, Command, GameEvent, PlayerId } from '../sim/types';
import type { SimServices } from '../sim/context';
import { Simulation } from '../sim/simulation';
import { Renderer } from '../render/renderer';
import { GestureRecognizer } from '../input/gesture';
import { InputController } from '../input/controller';
import { lockLandscape } from '../ui/orientation';
import { initViewport } from '../ui/viewport';
import { Hud } from '../ui/hud';
import { Minimap } from '../ui/minimap';
import { ZoomSlider } from '../ui/zoom-slider';
import { AudioManager } from '../audio/audio';
import type { Settings } from '../storage/settings';
import { saveGame } from '../storage/save';
import { canBuildNearBase, buildZoneCircles } from '../sim/build-zone';
import { isWorldPointVisible } from '../sim/views';
import { applyTransferState, packState } from '../sim/state-transfer';
import { rebuildBuildingNav } from '../sim/building-nav';
import { ReplayRecorder, serializeReplay, type Replay } from '../sim/replay';
import { WorkerSimClient } from './worker-client';
import { LockstepClient } from '../net/lockstep';
import { CHECKSUM_INTERVAL_TICKS } from '../net/protocol';
import { hashState } from '../sim/hash';

const ORDER_COLORS: Record<string, number> = {
  move: 0x7fe3ff,
  attack: 0xff5d5d,
  attackMove: 0xffa14f,
  harvest: 0x39d0c0,
  build: 0x8b6cff,
  deploy: 0x8b6cff,
  pack: 0x8b6cff,
  spell: 0xffd166,
  rally: 0x7fe3ff,
};

function workerSupported(): boolean {
  return typeof Worker !== 'undefined';
}

export class Game {
  private sim: Simulation | null;
  private worker: WorkerSimClient | null = null;
  private useWorker: boolean;
  private lockstep: LockstepClient | null = null;
  private matchId: string;
  private onDesync: ((tick: number, peers: string[], replay: Replay) => void) | null = null;
  private replay = new ReplayRecorder();
  private renderer: Renderer;
  private gesture!: GestureRecognizer;
  private controller!: InputController;
  private hud!: Hud;
  private minimap!: Minimap;
  private zoomSlider!: ZoomSlider;
  private loop!: GameLoop;
  private humanId: PlayerId;
  private colorByOwner = new Map<PlayerId, string>();
  private boxEl: HTMLDivElement;
  private tickCounter = 0;
  private disposed = false;
  private lastPointer = { x: 0, y: 0 };
  private fps = 60;
  private lastFrameTime = 0;
  private lastSimSyncMs = 0;
  private pointerStart = { x: 0, y: 0 };
  private onVisibilityResume = (): void => {
    if (document.visibilityState !== 'visible' || this.disposed) return;
    initViewport();
    this.renderer.handleResume();
  };

  constructor(
    private host: HTMLElement,
    private registry: Registry,
    private state: GameState,
    private services: SimServices,
    private audio: AudioManager,
    private settings: Settings,
    private onExit: () => void,
    opts?: {
      useWorker?: boolean;
      lockstep?: LockstepClient;
      matchId?: string;
      localPlayerId?: PlayerId;
      onDesync?: (tick: number, peers: string[], replay: Replay) => void;
    },
  ) {
    this.lockstep = opts?.lockstep ?? null;
    this.matchId = opts?.matchId ?? 'skirmish_1v1';
    this.onDesync = opts?.onDesync ?? null;
    const wantWorker = opts?.useWorker ?? workerSupported();
    this.useWorker = wantWorker && !this.lockstep && workerSupported();
    if (this.useWorker && workerSupported()) {
      this.worker = new WorkerSimClient();
      this.sim = null;
    } else {
      this.useWorker = false;
      this.sim = new Simulation(state, services);
      if (this.lockstep) this.sim.aiEnabled = false;
    }
    this.humanId =
      opts?.localPlayerId ??
      state.players.find((p) => p.controller === 'human')?.id ??
      state.players[0]!.id;
    for (const p of state.players) this.colorByOwner.set(p.id, p.color);
    this.renderer = new Renderer(registry, registry.map(state.mapId));
    this.boxEl = document.createElement('div');
    this.boxEl.className = 'box-select';
    this.boxEl.style.display = 'none';
  }

  async start(): Promise<void> {
    const canvasHost = document.createElement('div');
    canvasHost.className = 'game-canvas-host';
    this.host.appendChild(canvasHost);
    this.boxEl.style.position = 'absolute';
    this.boxEl.style.pointerEvents = 'none';
    canvasHost.appendChild(this.boxEl);
    await this.renderer.init(canvasHost);
    this.renderer.setNav(this.services.nav);
    this.renderer.setOwnerColors(this.state, this.humanId);

    const start = this.registry.map(this.state.mapId).startLocations[0]!;
    const sanctum = [...this.state.entities.values()].find((e) => e.owner === this.humanId && e.defId === 'sanctum');
    this.renderer.camera.centerOn(sanctum?.pos.x ?? start.x, sanctum?.pos.y ?? start.y);

    const mapSize = Math.max(72, Math.min(112, Math.floor(window.innerHeight * 0.26)));
    this.minimap = new Minimap(this.registry.map(this.state.mapId), this.renderer.camera, this.colorByOwner, mapSize);

    const enqueue = (cmd: Command) => this.enqueueCommands([cmd]);

    this.controller = new InputController(
      () => this.state,
      this.renderer.camera,
      this.renderer,
      this.registry,
      this.humanId,
      enqueue,
      (kind, world) => this.renderer.effects.spawn('ring', world.x, world.y, ORDER_COLORS[kind] ?? 0xffffff, 14),
      (tx, ty, fp) => this.services.nav.canPlace(tx, ty, fp),
      (tx, ty, fp) => canBuildNearBase(this.state, this.services, this.humanId, tx, ty, fp),
    );

    this.hud = new Hud(() => this.state, this.registry, this.controller, this.humanId, this.minimap);
    this.hud.onExit = () => this.exit();
    this.controller.onHarvestNoRefinery = () => {
      this.hud.showHint('Tap teal mana nodes to harvest · Build Attunement Spire (MINE) to deposit');
    };
    this.host.append(this.hud.root);

    this.zoomSlider = new ZoomSlider(this.renderer.camera);
    this.host.append(this.zoomSlider.root);

    this.setupGestures();
    this.setupPointer();
    this.setupKeyboard();
    document.addEventListener('visibilitychange', this.onVisibilityResume);
    window.addEventListener('pageshow', this.onVisibilityResume);

    if (this.worker) {
      const ready = await this.waitForWorkerReady();
      if (!ready) {
        this.worker.terminate();
        this.worker = null;
        this.sim = new Simulation(this.state, this.services);
        this.renderer.syncTick(this.state);
        this.renderer.snapDisplay();
      }
    } else {
      this.renderer.syncTick(this.state);
      this.renderer.snapDisplay();
    }

    if (this.lockstep) this.catchUpLockstep();

    this.lastSimSyncMs = performance.now();

    this.loop = new GameLoop(
      () => this.step(),
      (alpha) => this.frame(alpha),
    );
    this.loop.start();
    this.hud.showHint('Tap teal nodes to send wisps · Build MINE + PWR, then RAD for full map intel');
  }

  private enqueueCommands(cmds: Command[]): void {
    if (!cmds.length) return;
    this.replay.record(this.state.tick, cmds);
    if (this.lockstep) {
      this.lockstep.submitLocal(this.state.tick, cmds);
      return;
    }
    if (this.worker) this.worker.send(cmds);
    else this.sim?.enqueueNow(cmds);
  }

  private setupGestures(): void {
    let boxStart = { x: 0, y: 0 };
    this.gesture = new GestureRecognizer(
      {
        onTap: (p) => this.controller.tap(p),
        onDoubleTap: (p) => this.controller.doubleTap(p),
        onPanMove: (dx, dy) => this.controller.panByScreen(dx, dy),
        onTwoFingerPan: (dx, dy) => this.controller.panByScreen(dx, dy),
        onBoxStart: (p) => {
          boxStart = p;
          this.boxEl.style.display = 'block';
        },
        onBoxMove: (p) => {
          const x = Math.min(boxStart.x, p.x);
          const y = Math.min(boxStart.y, p.y);
          this.boxEl.style.left = `${x}px`;
          this.boxEl.style.top = `${y}px`;
          this.boxEl.style.width = `${Math.abs(p.x - boxStart.x)}px`;
          this.boxEl.style.height = `${Math.abs(p.y - boxStart.y)}px`;
        },
        onBoxEnd: (a, b) => {
          this.boxEl.style.display = 'none';
          this.controller.boxSelect(a, b);
        },
      },
      this.settings.dragMode,
    );
  }

  private wallDragging = false;

  private setupPointer(): void {
    const canvas = this.renderer.app.canvas;
    const rel = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    canvas.addEventListener('pointerdown', (e) => {
      this.audio.unlock();
      void lockLandscape();
      const p = rel(e);
      this.lastPointer = p;
      this.pointerStart = p;
      canvas.setPointerCapture(e.pointerId);
      const mode = this.controller.session.mode;
      if (mode === 'build' && this.controller.isWallBuild()) {
        this.wallDragging = true;
        const w = screenToWorld(p, this.renderer.camera.view());
        this.controller.startWallDrag(w);
      }
      this.gesture.pointerDown(e.pointerId, p.x, p.y, performance.now());
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = rel(e);
      this.lastPointer = p;
      const mode = this.controller.session.mode;
      if (mode === 'build' && this.controller.isWallBuild() && this.wallDragging) {
        const w = screenToWorld(p, this.renderer.camera.view());
        this.controller.updateWallDrag(w);
        return;
      }
      if (mode === 'build' || mode === 'deploy') {
        const w = screenToWorld(p, this.renderer.camera.view());
        if (mode === 'build') this.controller.updateGhost(w);
        else this.controller.updateDeployGhost(w);
      }
      if (mode === 'rally') {
        if (this.gesture.activePointers >= 2) {
          this.gesture.pointerMove(e.pointerId, p.x, p.y, performance.now());
        } else {
          const w = screenToWorld(p, this.renderer.camera.view());
          this.controller.updateRallyCursor(w);
        }
        return;
      }
      if (mode === 'normal' || mode === 'attackMove') {
        this.gesture.pointerMove(e.pointerId, p.x, p.y, performance.now());
      }
    });
    const up = (e: PointerEvent) => {
      const p = rel(e);
      const mode = this.controller.session.mode;
      const drift = Math.hypot(p.x - this.pointerStart.x, p.y - this.pointerStart.y);
      if (mode === 'rally') {
        this.gesture.pointerUp(e.pointerId, p.x, p.y, performance.now());
        try {
          canvas.releasePointerCapture(e.pointerId);
        } catch {
          /* already released */
        }
        if (this.gesture.activePointers === 0) {
          const panned = this.gesture.lastEndKind === 'pan' || this.gesture.lastEndKind === 'pinch';
          if (!panned && drift <= TAP_SLOP_PX) this.controller.confirmRally(screenToWorld(p, this.renderer.camera.view()));
        }
        return;
      }
      if (mode === 'build' && this.controller.isWallBuild()) {
        this.gesture.pointerUp(e.pointerId, p.x, p.y, performance.now());
        if (this.wallDragging) {
          if (drift > TAP_SLOP_PX && this.controller.hasWallDragTiles()) {
            this.controller.confirmWallDrag();
          } else if (drift <= TAP_SLOP_PX) {
            this.controller.tap(p);
          }
          this.controller.endWallDrag();
          this.wallDragging = false;
        }
        return;
      }
      if (mode === 'normal' || mode === 'attackMove' || mode === 'build' || mode === 'deploy') {
        this.gesture.pointerUp(e.pointerId, p.x, p.y, performance.now());
      }
      // Recover taps lost to tiny camera pans (common on touch).
      if (
        (mode === 'normal' || mode === 'build' || mode === 'deploy') &&
        drift <= TAP_SLOP_PX &&
        this.gesture.lastEndKind !== 'tap' &&
        this.gesture.lastEndKind !== 'box'
      ) {
        this.controller.tap(p);
      } else if (mode === 'normal' && this.gesture.lastEndKind === 'pan' && drift <= TAP_SLOP_PX) {
        this.controller.tap(p);
      }
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
  }

  private setupKeyboard(): void {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.controller.clearSelection();
    });
  }

  private step(): boolean {
    if (this.state.ended) return false;

    // Lockstep sim is network-driven; drained every frame in frame().
    if (this.lockstep) return false;

    if (this.worker) return this.worker.requestStep();

    const res = this.sim!.step();
    for (const ev of res.events) this.handleEvent(ev);
    this.renderer.syncTick(this.state);
    this.markSimSynced();
    this.tickCounter++;
    if (this.tickCounter % 200 === 0) void saveGame(this.state);
    return true;
  }

  /** Process one confirmed lockstep tick. */
  private advanceLockstepSim(syncRender: boolean): boolean {
    const tick = this.state.tick;
    if (!this.lockstep?.isTickReady(tick)) return false;
    const cmds = this.lockstep.commandsForTick(tick) ?? [];
    this.sim!.enqueue(tick, cmds);
    const res = this.sim!.step();
    for (const ev of res.events) this.handleEvent(ev);
    if (syncRender) {
      this.renderer.syncTick(this.state);
      this.markSimSynced();
    }
    this.tickCounter++;
    if (this.tickCounter % CHECKSUM_INTERVAL_TICKS === 0) this.reportChecksum(tick);
    if (this.tickCounter % 200 === 0) void saveGame(this.state);
    this.lockstep.pruneBefore(Math.max(0, tick - 120));
    return true;
  }

  /** Fast-forward through relay ticks buffered during match load. */
  private catchUpLockstep(): void {
    if (!this.lockstep) return;
    let safety = 0;
    while (this.advanceLockstepSim(false) && safety < 10_000) safety++;
    this.renderer.syncTick(this.state);
    this.renderer.snapDisplay();
    this.markSimSynced();
  }

  private markSimSynced(): void {
    this.lastSimSyncMs = performance.now();
  }

  private waitForWorkerReady(): Promise<boolean> {
    const worker = this.worker;
    if (!worker) return Promise.resolve(false);

    return new Promise((resolve) => {
      const timeout = window.setTimeout(() => resolve(worker.isReady), 4000);
      worker.onReady = (transfer) => {
        clearTimeout(timeout);
        applyTransferState(this.state, transfer);
        rebuildBuildingNav(this.state, this.services, this.registry);
        this.renderer.syncTick(this.state);
        this.renderer.snapDisplay();
        this.markSimSynced();
        resolve(true);
      };
      worker.onTick = ({ state, events }) => {
        applyTransferState(this.state, state);
        rebuildBuildingNav(this.state, this.services, this.registry);
        for (const ev of events) this.handleEvent(ev);
        this.renderer.syncTick(this.state);
        this.markSimSynced();
        this.tickCounter++;
        if (this.tickCounter % 200 === 0) void saveGame(this.state);
      };
      worker.initState(packState(this.state));
    });
  }

  private reportChecksum(tick: number): void {
    if (!this.lockstep) return;
    const ownHash = hashState(this.state);
    const bad = this.lockstep.detectDesync(tick, ownHash);
    if (bad.length) {
      const replay = this.replay.toReplay(this.matchId);
      this.onDesync?.(tick, bad, replay);
      console.error('[lockstep] desync at tick', tick, 'peers:', bad, 'replay:', serializeReplay(replay));
    }
  }

  private handleEvent(ev: GameEvent): void {
    const visible = this.isEventVisible(ev);
    if (visible) this.audio.play(ev);
    switch (ev.type) {
      case 'attackFired':
        if (visible) this.renderer.effects.spawn('flash', ev.x, ev.y, 0xffe08a, 6);
        break;
      case 'damageDealt':
        if (visible) this.renderer.effects.spawn('flash', ev.x, ev.y, 0xffffff, 5);
        break;
      case 'entityDied':
        if (visible) this.renderer.effects.spawn('puff', ev.x, ev.y, 0x9a9a9a, 14);
        break;
      case 'buildingComplete': {
        const b = this.state.entities.get(ev.id);
        if (b && isWorldPointVisible(this.state, this.humanId, b.pos.x, b.pos.y, this.services.nav)) {
          this.renderer.effects.spawn('ring', b.pos.x, b.pos.y, 0x8b6cff, 30);
        }
        break;
      }
      case 'manaDeposited':
        if (visible) this.renderer.effects.spawn('spark', ev.x, ev.y, 0x7fe3ff, 4);
        break;
      case 'spellCast':
        if (visible) this.renderer.effects.spawn('ring', ev.x, ev.y, 0xffd166, 60);
        break;
    }
  }

  private isEventVisible(ev: GameEvent): boolean {
    const nav = this.services.nav;
    switch (ev.type) {
      case 'attackFired':
      case 'damageDealt':
      case 'entityDied':
      case 'manaDeposited':
      case 'spellCast':
        return isWorldPointVisible(this.state, this.humanId, ev.x, ev.y, nav);
      case 'buildingComplete': {
        const b = this.state.entities.get(ev.id);
        return b ? isWorldPointVisible(this.state, this.humanId, b.pos.x, b.pos.y, nav) : false;
      }
      default:
        return true;
    }
  }

  /** Process every confirmed lockstep tick available (keeps client synced with relay). */
  private drainLockstepTicks(): void {
    if (!this.lockstep) return;
    let safety = 0;
    while (this.advanceLockstepSim(true) && safety++ < 128) {
      /* catch up */
    }
  }

  private frame(_loopAlpha: number): void {
    const now = performance.now();
    const dt = this.lastFrameTime ? now - this.lastFrameTime : 16;
    if (this.lastFrameTime && dt > 0) {
      this.fps = this.fps * 0.9 + (1000 / dt) * 0.1;
    }
    this.lastFrameTime = now;

    if (this.lockstep) this.drainLockstepTicks();

    const renderAlpha = Math.min(1, (now - this.lastSimSyncMs) / TICK_MS);

    this.gesture.update(now);
    const overlay = this.buildOverlay();
    this.renderer.render(this.state, renderAlpha, this.controller.session.selection, overlay, dt);
    this.minimap.render(this.state, this.humanId, this.services.nav, this.registry);
    this.zoomSlider.syncFromCamera();
    this.hud.update();
    this.hud.setDebug(this.fps, this.state.tick, this.state.entities.size);
  }

  private buildOverlay() {
    const s = this.controller.session;
    let ghost: { x: number; y: number; size: number; valid: boolean } | undefined;
    let wallGhosts: { x: number; y: number; size: number; valid: boolean }[] | undefined;
    if (s.mode === 'build' && s.buildDefId) {
      const def = this.registry.buildings.get(s.buildDefId);
      if (def) {
        const size = def.footprint * TILE;
        if (s.wallDragTiles?.length) {
          wallGhosts = s.wallDragTiles.map((t) => ({ x: t.x, y: t.y, size, valid: t.valid }));
        } else if (s.buildGhost) {
          ghost = { x: s.buildGhost.x, y: s.buildGhost.y, size, valid: s.buildGhost.valid };
        }
      }
    } else if (s.mode === 'deploy' && s.buildGhost) {
      const def = this.registry.buildings.get('waystone_camp');
      if (def) ghost = { x: s.buildGhost.x, y: s.buildGhost.y, size: def.footprint * TILE, valid: s.buildGhost.valid };
    }
    let spell: { x: number; y: number; radius: number } | undefined;
    if (s.mode === 'spell' && s.spellId) {
      const def = this.registry.spells.get(s.spellId);
      if (def && def.aoeRadius > 0) {
        const w = screenToWorld(this.lastPointer, this.renderer.camera.view());
        spell = { x: w.x, y: w.y, radius: def.aoeRadius };
      }
    }
    const confirm = s.pendingConfirm ? { x: s.pendingConfirm.x, y: s.pendingConfirm.y } : null;
    let rallyMarker: { fromX: number; fromY: number; toX: number; toY: number } | undefined;
    if (s.mode === 'rally' && s.rallyBuildingId && s.rallyCursor) {
      const b = this.state.entities.get(s.rallyBuildingId);
      if (b) rallyMarker = { fromX: b.pos.x, fromY: b.pos.y, toX: s.rallyCursor.x, toY: s.rallyCursor.y };
    } else if (s.selection.size === 1) {
      const id = [...s.selection][0]!;
      const b = this.state.entities.get(id);
      if (b?.kind === 'building' && b.rally) {
        rallyMarker = { fromX: b.pos.x, fromY: b.pos.y, toX: b.rally.x, toY: b.rally.y };
      }
    }
    const buildZones = s.mode === 'build' ? buildZoneCircles(this.state, this.services, this.humanId) : undefined;
    return { ghost, wallGhosts, spell, confirm, buildZones, rallyMarker };
  }

  exit(): void {
    if (this.disposed) return;
    this.disposed = true;
    document.removeEventListener('visibilitychange', this.onVisibilityResume);
    window.removeEventListener('pageshow', this.onVisibilityResume);
    this.loop?.stop();
    this.worker?.terminate();
    void saveGame(this.state);
    this.renderer.destroy();
    this.hud.root.remove();
    this.zoomSlider.root.remove();
    this.boxEl.remove();
    this.onExit();
  }
}
