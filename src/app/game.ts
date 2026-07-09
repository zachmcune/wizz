// In-match orchestrator: wires sim + renderer + input + HUD + audio + loop together.
import { BUILD_SPACING_TILES, TICK_MS } from '../core/constants';
import { GameLoop } from '../core/game-loop';
import type { Registry } from '../data/registry';
import type { GameState, Command, PlayerId, MatchConfig } from '../sim/types';
import type { SimServices } from '../sim/context';
import { Renderer } from '../render/renderer';
import { GestureRecognizer } from '../input/gesture';
import { InputController } from '../input/controller';
import { KeyboardControls } from '../input/keyboard-controls';
import { initViewport } from '../ui/viewport';
import { Hud } from '../ui/hud';
import { Minimap } from '../ui/minimap';
import { ZoomSlider } from '../ui/zoom-slider';
import type { AudioManager } from '../audio/audio';
import type { ProjectionMode } from '../core/projection';
import { setProjectionMode } from '../core/projection';
import { defaultSaveMeta, saveGame, type SaveMeta } from '../storage/save';
import type { Settings } from '../storage/settings';
import { canBuildNearBase } from '../sim/build-zone';
import { footprintOverlapsNode } from '../sim/resource-nodes';
import { shouldRevealAllForViewer } from '../sim/views';
import type { Replay } from '../sim/replay';
import type { LockstepClient } from '../net/lockstep';
import type { WebSocketTransport } from '../net/ws-transport';
import { EventBridge } from './match/event-bridge';
import { PointerBinder } from './match/pointer-binder';
import { buildMatchOverlay } from './match/overlay-builder';
import { SimController } from './match/sim-controller';
import { SandboxController } from '../sandbox/sandbox-controller';
import { SandboxPanel } from '../sandbox/ui/sandbox-panel';
import { createSandboxAiHook } from '../sandbox/ai-director';
import { buildSandboxDebugOverlay } from '../sandbox/overlays/build-debug-overlay';
import type { SandboxDebugOverlay } from '../sandbox/overlays/build-debug-overlay';
import { isTouchPrimaryDevice } from '../sandbox/ui/touch';

const ORDER_COLORS: Record<string, number> = {
  move: 0x7fe3ff,
  attack: 0xff5d5d,
  attackMove: 0xffa14f,
  moveInOrder: 0x9ad66b,
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
  private simCtrl!: SimController;
  private eventBridge!: EventBridge;
  private pointerBinder: PointerBinder | null = null;
  private renderer: Renderer;
  private gesture!: GestureRecognizer;
  private controller!: InputController;
  private keyboard!: KeyboardControls;
  private hud!: Hud;
  private minimap!: Minimap;
  private zoomSlider!: ZoomSlider;
  private loop!: GameLoop;
  private humanId: PlayerId;
  private colorByOwner = new Map<PlayerId, string>();
  private boxEl: HTMLDivElement;
  private disposed = false;
  private fps = 60;
  private lastFrameTime = 0;
  private postGameCameraReady = false;
  private readonly lockstep: LockstepClient | null;
  private readonly matchId: string;
  private readonly onDesync: ((tick: number, peers: string[], replay: Replay) => void) | null;
  private readonly relayTransport: WebSocketTransport | null;
  private readonly useWorker: boolean;
  private readonly deadSpectatorReveal: boolean;
  private readonly matchProjectionMode: ProjectionMode;
  private saveMeta: SaveMeta;
  private startPaused: boolean;
  private readonly sandboxMode: boolean;
  private readonly matchConfig: MatchConfig | null;
  private sandboxCtrl: SandboxController | null = null;
  private sandboxPanel: SandboxPanel | null = null;
  private frameMs = 16;
  private onSandboxKeyDown = (e: KeyboardEvent): void => {
    this.sandboxPanel?.handleGlobalKey(e);
  };
  private onVisibilityResume = (): void => {
    if (document.visibilityState !== 'visible' || this.disposed) return;
    initViewport();
    this.renderer.handleResume();
    if (this.lockstep) {
      this.simCtrl?.resumeFromBackground();
      this.renderer.snapDisplay();
    }
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
      deadSpectatorReveal?: boolean;
      matchProjectionMode?: ProjectionMode;
      onDesync?: (tick: number, peers: string[], replay: Replay) => void;
      relayTransport?: WebSocketTransport;
      saveMeta?: SaveMeta;
      startPaused?: boolean;
      sandbox?: boolean;
      matchConfig?: MatchConfig;
    },
  ) {
    if (opts?.sandbox && opts?.lockstep) {
      throw new Error('Sandbox mode cannot run in lockstep/online matches');
    }
    this.sandboxMode = opts?.sandbox ?? false;
    this.matchConfig = opts?.matchConfig ?? null;
    this.lockstep = opts?.lockstep ?? null;
    this.matchId = opts?.matchId ?? 'skirmish_1v1';
    this.onDesync = opts?.onDesync ?? null;
    this.relayTransport = opts?.relayTransport ?? null;
    this.deadSpectatorReveal = opts?.deadSpectatorReveal ?? false;
    this.matchProjectionMode = opts?.matchProjectionMode ?? 'ortho';
    this.startPaused = opts?.startPaused ?? false;
    this.saveMeta =
      opts?.saveMeta ??
      defaultSaveMeta(
        opts?.localPlayerId ??
          state.players.find((p) => p.controller === 'human')?.id ??
          state.players[0]!.id,
        this.matchProjectionMode,
      );
    const wantWorker = opts?.useWorker ?? workerSupported();
    this.useWorker = this.sandboxMode ? false : wantWorker && workerSupported();

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
    this.eventBridge = new EventBridge(
      () => this.state,
      this.humanId,
      () => this.services,
      this.deadSpectatorReveal,
      this.audio,
      this.renderer.effects,
      (text) => this.hud?.showHint(text),
    );

    const aiEnabled = this.sandboxMode
      ? !this.state.sandbox!.settings.ai.disabled
      : this.lockstep
        ? this.state.players.some((p) => p.controller === 'ai')
        : true;
    const aiHook =
      this.sandboxMode && this.state.sandbox
        ? createSandboxAiHook(
            () => this.state.sandbox!.settings.ai,
            () => this.state.sandbox!.settings,
            () => this.humanId,
          )
        : undefined;
    this.simCtrl = new SimController(
      this.state,
      this.services,
      this.registry,
      this.lockstep,
      this.matchId,
      this.onDesync,
      (events) => {
        for (const ev of events) this.eventBridge.handle(ev);
      },
      () => this.renderer.syncTick(this.state),
      this.useWorker,
      aiEnabled,
      this.relayTransport,
      aiHook,
    );
    this.simCtrl.onResync = () => {
      this.renderer.syncTick(this.state);
      this.renderer.snapDisplay();
    };
    this.simCtrl.setSaveMeta(this.saveMeta, this.sandboxMode);

    const canvasHost = document.createElement('div');
    canvasHost.className = 'game-canvas-host';
    canvasHost.dataset.testid = 'game-canvas-host';
    this.host.appendChild(canvasHost);
    this.boxEl.style.position = 'absolute';
    this.boxEl.style.pointerEvents = 'none';
    canvasHost.appendChild(this.boxEl);
    await this.renderer.init(canvasHost);
    setProjectionMode(this.matchProjectionMode);
    this.renderer.setProjectionMode(this.matchProjectionMode);
    this.renderer.setNav(this.services.nav);
    this.renderer.setOwnerColors(this.state, this.humanId);

    const start = this.registry.map(this.state.mapId).startLocations[0]!;
    const sanctum = [...this.state.entities.values()].find((e) => e.owner === this.humanId && e.defId === 'sanctum');
    this.renderer.camera.centerOn(sanctum?.pos.x ?? start.x, sanctum?.pos.y ?? start.y);

    const mapSize = Math.max(72, Math.min(112, Math.floor(window.innerHeight * 0.26)));
    this.minimap = new Minimap(this.registry.map(this.state.mapId), this.renderer.camera, this.colorByOwner, mapSize);

    const enqueue = (cmd: Command) => this.simCtrl.enqueueCommands([cmd]);

    this.controller = new InputController(
      () => this.state,
      this.renderer.camera,
      this.registry,
      this.services.nav,
      this.humanId,
      enqueue,
      (kind, world) => this.renderer.effects.spawn('ring', world.x, world.y, ORDER_COLORS[kind] ?? 0xffffff, 14),
      (tx, ty, fp, spacing) => this.services.nav.canPlace(tx, ty, fp, spacing ?? BUILD_SPACING_TILES),
      (tx, ty, fp) => canBuildNearBase(this.state, this.services, this.humanId, tx, ty, fp),
      (tx, ty, fp) => footprintOverlapsNode(this.state, tx, ty, fp),
    );

    this.hud = new Hud(
      () => this.state,
      this.registry,
      this.controller,
      this.humanId,
      this.minimap,
      (art, color) => this.renderer.iconCanvas(art, color),
      {
        settings: this.settings,
        audio: this.audio,
        onSettingsChange: (s) => {
          this.renderer.setShowBuildingNames(s.showBuildingNames);
          this.renderer.refreshBuildingLabels(this.state);
        },
        soloPause: this.lockstep
          ? null
          : {
              isPaused: () => this.simCtrl.isPaused,
              onToggle: () => this.setPaused(!this.simCtrl.isPaused),
            },
      },
    );
    this.hud.onExit = () => this.exit();
    this.renderer.setShowBuildingNames(this.settings.showBuildingNames);
    if (this.relayTransport) {
      this.relayTransport.onError = (message) => {
        if (!this.disposed) this.hud.showHint(`Disconnected — ${message}`);
      };
      this.relayTransport.onReconnect = () => {
        if (this.disposed) return;
        this.hud.showHint('Reconnected — syncing match');
        this.simCtrl.resumeFromBackground();
        this.renderer.snapDisplay();
      };
    }
    this.controller.onHarvestNoRefinery = () => {
      this.hud.showHint('Tap teal mana nodes to harvest · Build Attunement Spire (MINE) to deposit');
    };
    this.host.append(this.hud.root);

    this.zoomSlider = new ZoomSlider(this.renderer.camera);
    this.host.append(this.zoomSlider.root);

    this.setupGestures();
    this.pointerBinder = new PointerBinder(this.renderer.app.canvas, {
      getEnded: () => this.state.ended,
      camera: this.renderer.camera,
      controller: this.controller,
      gesture: this.gesture,
      audio: this.audio,
    });
    this.pointerBinder.attach();
    this.keyboard = new KeyboardControls(this.controller);
    this.keyboard.attach();
    document.addEventListener('visibilitychange', this.onVisibilityResume);
    window.addEventListener('pageshow', this.onVisibilityResume);

    if (this.simCtrl.isWorkerMode) {
      const ready = await this.simCtrl.initWorker();
      if (!ready) {
        this.simCtrl.fallbackToMainThread();
        this.renderer.syncTick(this.state);
        this.renderer.snapDisplay();
      }
    } else {
      this.renderer.syncTick(this.state);
      this.renderer.snapDisplay();
    }

    if (this.lockstep) {
      this.simCtrl.catchUpLockstep();
      this.renderer.snapDisplay();
    }

    this.simCtrl.markSynced();

    this.loop = new GameLoop(
      () => this.simCtrl.stepFixed(),
      (alpha) => this.frame(alpha),
    );
    this.loop.start();
    if (this.sandboxMode && this.matchConfig) {
      this.sandboxCtrl = new SandboxController({
        state: this.state,
        services: this.services,
        registry: this.registry,
        simCtrl: this.simCtrl,
        getHumanId: () => this.humanId,
        setHumanId: (playerId) => this.switchControlledPlayer(playerId),
        controller: this.controller,
        camera: this.renderer.camera,
        matchConfig: this.matchConfig,
        saveMeta: this.saveMeta,
      });
      this.sandboxCtrl.syncAi();
      this.sandboxPanel = new SandboxPanel(
        this.sandboxCtrl,
        this.registry,
        {
          onPause: () => this.setPaused(true),
          onResume: () => this.setPaused(false),
          onStepFrame: () => {
            this.simCtrl.stepOneTick();
            this.renderer.syncTick(this.state);
          },
          onSetTimeScale: (s) => this.loop.setTimeScale(s),
          isPaused: () => this.simCtrl.isPaused,
        },
        this.host,
      );
      this.sandboxPanel.mount(this.host);
      window.addEventListener('keydown', this.onSandboxKeyDown);
      this.hud.showHint(
        isTouchPrimaryDevice()
          ? 'Sandbox — tap ⚙ (bottom-left) for dev tools'
          : 'Sandbox — press ` for dev panel, Ctrl+Shift+P for commands',
      );
    } else {
      this.hud.showHint('Tap teal nodes to send wisps · Build MINE + PWR, then RAD for full map intel');
    }

    if (this.startPaused) this.setPaused(true);
  }

  private setupGestures(): void {
    let boxStart = { x: 0, y: 0 };
    this.gesture = new GestureRecognizer(
      {
        onTap: (p) => {
          if (this.state.ended) return;
          this.controller.tap(p);
        },
        onDoubleTap: (p) => {
          if (this.state.ended) return;
          this.controller.doubleTap(p);
        },
        onPanMove: (dx, dy) => this.controller.panByScreen(dx, dy),
        onTwoFingerPan: (dx, dy) => this.controller.panByScreen(dx, dy),
        onBoxStart: (p) => {
          if (this.state.ended) return;
          boxStart = p;
          this.boxEl.style.display = 'block';
        },
        onBoxMove: (p) => {
          if (this.state.ended) return;
          const x = Math.min(boxStart.x, p.x);
          const y = Math.min(boxStart.y, p.y);
          this.boxEl.style.left = `${x}px`;
          this.boxEl.style.top = `${y}px`;
          this.boxEl.style.width = `${Math.abs(p.x - boxStart.x)}px`;
          this.boxEl.style.height = `${Math.abs(p.y - boxStart.y)}px`;
        },
        onBoxEnd: (a, b) => {
          if (this.state.ended) return;
          this.boxEl.style.display = 'none';
          this.controller.boxSelect(a, b);
        },
      },
      this.settings.dragMode,
    );
  }

  private switchControlledPlayer(playerId: PlayerId): void {
    if (!this.sandboxMode || this.disposed) return;
    if (!this.state.players.some((p) => p.id === playerId && !p.defeated)) return;
    this.humanId = playerId;
    this.controller.setPlayerId(playerId);
    this.eventBridge.setHumanId(playerId);
    this.hud.setPlayerId(playerId);
    this.renderer.setOwnerColors(this.state, this.humanId);
    this.saveMeta = { ...this.saveMeta, localPlayerId: playerId };
    this.simCtrl.setSaveMeta(this.saveMeta, this.sandboxMode);
    this.sandboxPanel?.setControlledPlayer(playerId);
    const sanctum = [...this.state.entities.values()].find((e) => e.owner === playerId && e.defId === 'sanctum');
    if (sanctum) this.renderer.camera.centerOn(sanctum.pos.x, sanctum.pos.y);
    this.hud.showHint(`Now controlling ${playerId}`);
  }

  private setPaused(paused: boolean): void {
    this.saveMeta = { ...this.saveMeta, paused };
    this.simCtrl.setSaveMeta(this.saveMeta, this.sandboxMode);
    this.simCtrl.setPaused(paused);
    this.loop?.setPaused(paused);
    this.hud?.setPaused(paused);
    if (!paused && !this.sandboxMode) void saveGame(this.state, this.saveMeta);
  }

  private frame(_loopAlpha: number): void {
    const now = performance.now();
    const dt = this.lastFrameTime ? now - this.lastFrameTime : 16;
    if (this.lastFrameTime && dt > 0) {
      this.fps = this.fps * 0.9 + (1000 / dt) * 0.1;
    }
    this.lastFrameTime = now;

    this.frameMs = dt;

    if (this.simCtrl.isPaused) {
      this.hud.update();
      if (this.sandboxMode && this.state.sandbox) {
        this.renderSandboxFrame(1);
      }
      return;
    }

    if (this.lockstep) this.simCtrl.drainLockstep((msg) => this.hud.showHint(msg));

    if (this.state.ended && !this.postGameCameraReady) {
      this.postGameCameraReady = true;
      this.gesture.setDragMode('pan');
    }

    const renderAlpha = Math.min(1, (now - this.simCtrl.lastSyncMs) / TICK_MS);

    this.keyboard.updateCamera(this.renderer.camera, dt);
    this.gesture.update(now);
    this.controller.syncSuperweaponMode();
    const lastPointer = this.pointerBinder?.getLastPointer() ?? { x: 0, y: 0 };
    const overlay = this.buildFrameOverlay(lastPointer);
    const revealAll = shouldRevealAllForViewer(this.state, this.humanId, this.deadSpectatorReveal);
    this.renderer.render(this.state, renderAlpha, this.controller.session.selection, overlay, dt, revealAll);
    this.minimap.render(this.state, this.humanId, this.services.nav, this.registry, revealAll);
    this.zoomSlider.syncFromCamera();
    this.hud.update();
    this.hud.setDebug(this.fps, this.state.tick, this.state.entities.size);
  }

  private buildFrameOverlay(lastPointer: { x: number; y: number }) {
    const base = buildMatchOverlay(
      this.state,
      this.services,
      this.registry,
      this.humanId,
      this.controller.session,
      this.renderer.camera,
      lastPointer,
    );
    if (!this.sandboxMode || !this.state.sandbox) return base;
    const debug = buildSandboxDebugOverlay(
      this.state,
      this.services,
      this.registry,
      this.state.sandbox.settings,
      this.fps,
      this.frameMs,
    );
    return { ...base, ...debug } as SandboxDebugOverlay;
  }

  private renderSandboxFrame(alpha: number): void {
    const lastPointer = this.pointerBinder?.getLastPointer() ?? { x: 0, y: 0 };
    const overlay = this.buildFrameOverlay(lastPointer);
    const revealAll = shouldRevealAllForViewer(this.state, this.humanId, this.deadSpectatorReveal);
    this.renderer.render(this.state, alpha, this.controller.session.selection, overlay, this.frameMs, revealAll);
    this.hud.update();
  }

  exit(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener('keydown', this.onSandboxKeyDown);
    this.sandboxPanel?.destroy();
    document.removeEventListener('visibilitychange', this.onVisibilityResume);
    window.removeEventListener('pageshow', this.onVisibilityResume);
    this.keyboard?.detach();
    this.pointerBinder?.detach();
    this.loop?.stop();
    this.simCtrl.terminate();
    this.simCtrl.autosaveOnExit();
    this.renderer.destroy();
    this.hud.root.remove();
    this.zoomSlider.root.remove();
    this.boxEl.remove();
    this.onExit();
  }
}
