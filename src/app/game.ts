// In-match orchestrator: wires sim + renderer + input + HUD + audio + loop together.
import { BUILD_SPACING_TILES, TICK_MS } from '../core/constants';
import { GameLoop } from '../core/game-loop';
import type { Registry } from '../data/registry';
import type { GameState, Command, PlayerId } from '../sim/types';
import type { SimServices } from '../sim/context';
import { Renderer } from '../render/renderer';
import { GestureRecognizer } from '../input/gesture';
import { InputController } from '../input/controller';
import { initViewport } from '../ui/viewport';
import { Hud } from '../ui/hud';
import { Minimap } from '../ui/minimap';
import { ZoomSlider } from '../ui/zoom-slider';
import type { AudioManager } from '../audio/audio';
import type { ProjectionMode } from '../core/projection';
import { setProjectionMode } from '../core/projection';
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
  private simCtrl!: SimController;
  private eventBridge!: EventBridge;
  private pointerBinder: PointerBinder | null = null;
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
  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') this.controller.clearSelection();
  };
  private onVisibilityChange = (): void => {
    if (this.disposed) return;
    if (document.visibilityState === 'hidden') {
      this.simCtrl.setBackgrounded(true);
      return;
    }
    void this.handleForegroundResume();
  };

  private async handleForegroundResume(): Promise<void> {
    this.simCtrl.setBackgrounded(false);
    initViewport();
    this.renderer.handleResume();
    this.loop?.resetAfterGap();
    this.audio.unlock();

    if (this.relayTransport && !this.relayTransport.connected) {
      try {
        this.hud.showHint('Reconnecting…');
        await this.relayTransport.reconnect(this.state.tick);
        this.hud.showHint('Reconnected');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'rejoin failed';
        this.hud.showHint(`Disconnected — ${message}`);
        return;
      }
    }

    if (this.lockstep) {
      this.simCtrl.resumeLockstep();
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
    },
  ) {
    this.lockstep = opts?.lockstep ?? null;
    this.matchId = opts?.matchId ?? 'skirmish_1v1';
    this.onDesync = opts?.onDesync ?? null;
    this.relayTransport = opts?.relayTransport ?? null;
    this.deadSpectatorReveal = opts?.deadSpectatorReveal ?? false;
    this.matchProjectionMode = opts?.matchProjectionMode ?? 'ortho';
    const wantWorker = opts?.useWorker ?? workerSupported();
    this.useWorker = wantWorker && !this.lockstep && workerSupported();

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
    );

    const aiEnabled = this.lockstep ? this.state.players.some((p) => p.controller === 'ai') : true;
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
    );

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

    this.hud = new Hud(() => this.state, this.registry, this.controller, this.humanId, this.minimap);
    this.hud.onExit = () => this.exit();
    if (this.relayTransport) {
      this.relayTransport.onError = (message) => {
        if (!this.disposed) this.hud.showHint(`Disconnected — ${message}`);
      };
      this.relayTransport.onDisconnected = () => {
        if (!this.disposed && document.visibilityState === 'visible') {
          this.hud.showHint('Connection lost — tap the app to reconnect');
        }
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
    window.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('pageshow', this.onVisibilityChange);

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
    this.hud.showHint('Tap teal nodes to send wisps · Build MINE + PWR, then RAD for full map intel');
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

  private frame(_loopAlpha: number): void {
    const now = performance.now();
    const dt = this.lastFrameTime ? now - this.lastFrameTime : 16;
    if (this.lastFrameTime && dt > 0) {
      this.fps = this.fps * 0.9 + (1000 / dt) * 0.1;
    }
    this.lastFrameTime = now;

    if (this.lockstep) this.simCtrl.drainLockstep((msg) => this.hud.showHint(msg));

    if (this.state.ended && !this.postGameCameraReady) {
      this.postGameCameraReady = true;
      this.gesture.setDragMode('pan');
    }

    const renderAlpha = Math.min(1, (now - this.simCtrl.lastSyncMs) / TICK_MS);

    this.gesture.update(now);
    const lastPointer = this.pointerBinder?.getLastPointer() ?? { x: 0, y: 0 };
    const overlay = buildMatchOverlay(
      this.state,
      this.services,
      this.registry,
      this.humanId,
      this.controller.session,
      this.renderer.camera,
      lastPointer,
    );
    const revealAll = shouldRevealAllForViewer(this.state, this.humanId, this.deadSpectatorReveal);
    this.renderer.render(this.state, renderAlpha, this.controller.session.selection, overlay, dt, revealAll);
    this.minimap.render(this.state, this.humanId, this.services.nav, this.registry, revealAll);
    this.zoomSlider.syncFromCamera();
    this.hud.update();
    this.hud.setDebug(this.fps, this.state.tick, this.state.entities.size);
  }

  exit(): void {
    if (this.disposed) return;
    this.disposed = true;
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('pageshow', this.onVisibilityChange);
    window.removeEventListener('keydown', this.onKeyDown);
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
