// In-match orchestrator: wires sim + renderer + input + HUD + audio + loop together.
// Owns no gameplay rules; it only routes commands in and events out.
import { TILE, TAP_SLOP_PX } from '../core/constants';
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

const ORDER_COLORS: Record<string, number> = {
  move: 0x7fe3ff,
  attack: 0xff5d5d,
  attackMove: 0xffa14f,
  harvest: 0x39d0c0,
  build: 0x8b6cff,
  deploy: 0x8b6cff,
  pack: 0x8b6cff,
  spell: 0xffd166,
};

export class Game {
  private sim: Simulation;
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
  ) {
    this.sim = new Simulation(state, services);
    this.humanId = state.players.find((p) => p.controller === 'human')?.id ?? state.players[0]!.id;
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
    this.renderer.setOwnerColors(this.state);

    // center camera on the human's start
    const human = this.state.players.find((p) => p.id === this.humanId)!;
    const start = this.registry.map(this.state.mapId).startLocations[
      // find our sanctum instead of relying on config index
      0
    ]!;
    const sanctum = [...this.state.entities.values()].find((e) => e.owner === this.humanId && e.defId === 'sanctum');
    this.renderer.camera.centerOn(sanctum?.pos.x ?? start.x, sanctum?.pos.y ?? start.y);
    void human;

    const mapSize = Math.max(72, Math.min(112, Math.floor(window.innerHeight * 0.26)));
    this.minimap = new Minimap(this.registry.map(this.state.mapId), this.renderer.camera, this.colorByOwner, mapSize);

    this.controller = new InputController(
      () => this.state,
      this.renderer.camera,
      this.renderer,
      this.registry,
      this.humanId,
      (cmd: Command) => this.sim.enqueueNow([cmd]),
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

    this.renderer.syncTick(this.state);
    this.loop = new GameLoop(
      () => this.step(),
      (alpha) => this.frame(alpha),
    );
    this.loop.start();
    this.hud.showHint('Tap teal nodes to send wisps · Build Attunement Spire (MINE) to deposit mana');
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
      this.gesture.pointerDown(e.pointerId, p.x, p.y, performance.now());
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = rel(e);
      this.lastPointer = p;
      const mode = this.controller.session.mode;
      if (mode === 'build' || mode === 'deploy') {
        const w = screenToWorld(p, this.renderer.camera.view());
        if (mode === 'build') this.controller.updateGhost(w);
        else this.controller.updateDeployGhost(w);
      }
      if (mode === 'normal' || mode === 'attackMove') {
        this.gesture.pointerMove(e.pointerId, p.x, p.y, performance.now());
      }
    });
    const up = (e: PointerEvent) => {
      const p = rel(e);
      const mode = this.controller.session.mode;
      const drift = Math.hypot(p.x - this.pointerStart.x, p.y - this.pointerStart.y);
      if (mode === 'normal' || mode === 'attackMove' || mode === 'build' || mode === 'deploy') {
        this.gesture.pointerUp(e.pointerId, p.x, p.y, performance.now());
      }
      // Small finger drift during a one-finger pan: treat as a tap (move order, select, etc.).
      if (mode === 'normal' && this.gesture.lastEndKind === 'pan' && drift <= TAP_SLOP_PX) {
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

  private step(): void {
    if (this.state.ended) {
      // keep rendering the final frame; stop advancing
      return;
    }
    const res = this.sim.step();
    for (const ev of res.events) this.handleEvent(ev);
    this.renderer.syncTick(this.state);
    this.tickCounter++;
    if (this.tickCounter % 200 === 0) void saveGame(this.state);
  }

  private handleEvent(ev: GameEvent): void {
    this.audio.play(ev);
    switch (ev.type) {
      case 'attackFired':
        this.renderer.effects.spawn('flash', ev.x, ev.y, 0xffe08a, 6);
        break;
      case 'damageDealt':
        this.renderer.effects.spawn('flash', ev.x, ev.y, 0xffffff, 5);
        break;
      case 'entityDied':
        this.renderer.effects.spawn('puff', ev.x, ev.y, 0x9a9a9a, 14);
        break;
      case 'buildingComplete': {
        const b = this.state.entities.get(ev.id);
        if (b) this.renderer.effects.spawn('ring', b.pos.x, b.pos.y, 0x8b6cff, 30);
        break;
      }
      case 'manaDeposited':
        this.renderer.effects.spawn('spark', ev.x, ev.y, 0x7fe3ff, 4);
        break;
      case 'spellCast':
        this.renderer.effects.spawn('ring', ev.x, ev.y, 0xffd166, 60);
        break;
    }
  }

  private frame(alpha: number): void {
    const now = performance.now();
    if (this.lastFrameTime) {
      const dt = now - this.lastFrameTime;
      if (dt > 0) this.fps = this.fps * 0.9 + (1000 / dt) * 0.1; // smoothed
    }
    this.lastFrameTime = now;

    this.gesture.update(now);
    const overlay = this.buildOverlay();
    this.renderer.render(this.state, alpha, this.controller.session.selection, overlay);
    this.minimap.render(this.state);
    this.zoomSlider.syncFromCamera();
    this.hud.update();
    this.hud.setDebug(this.fps, this.state.tick, this.state.entities.size);
  }

  private buildOverlay() {
    const s = this.controller.session;
    let ghost: { x: number; y: number; size: number; valid: boolean } | undefined;
    if (s.mode === 'build' && s.buildGhost && s.buildDefId) {
      const def = this.registry.buildings.get(s.buildDefId);
      if (def) ghost = { x: s.buildGhost.x, y: s.buildGhost.y, size: def.footprint * TILE, valid: s.buildGhost.valid };
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
    const buildZones =
      s.mode === 'build' || s.mode === 'deploy' ? buildZoneCircles(this.state, this.services, this.humanId) : undefined;
    return { ghost, spell, confirm, buildZones };
  }

  exit(): void {
    if (this.disposed) return;
    this.disposed = true;
    document.removeEventListener('visibilitychange', this.onVisibilityResume);
    window.removeEventListener('pageshow', this.onVisibilityResume);
    this.loop?.stop();
    void saveGame(this.state);
    this.renderer.destroy();
    this.hud.root.remove();
    this.zoomSlider.root.remove();
    this.boxEl.remove();
    this.onExit();
  }
}
