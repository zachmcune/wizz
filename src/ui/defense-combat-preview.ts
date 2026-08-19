// Live oblique vignette for gallery entities — uses the real renderer + sim.
import { GameLoop } from '../core/game-loop';
import { TICK_MS } from '../core/constants';
import type { Registry } from '../data/registry';
import type { EntityId, GameEvent, GameState } from '../sim/types';
import { spawnCelestialScorch, spawnCelestialSkyStrike } from '../render/celestial-cannon-vfx';
import { spawnStormSequence } from '../render/storm-conductor-vfx';
import { isUnitInSanctuaryAura, resetSanctuaryVfx, spawnSanctuaryAttackTrail, tickSanctuarySpireAudio } from '../render/sanctuary-spire-vfx';
import {
  isSentryDamageSource,
  registerSentryBoltFired,
  resetArcaneSentryVfx,
  spawnSentrySilhouetteFlash,
  tickArcaneSentryAudio,
} from '../render/arcane-sentry-vfx';
import {
  applyAttackFxBursts,
  attackFiredBursts,
  attackFxForEntity,
  attackHitBursts,
} from '../render/attack-fx';
import { Renderer } from '../render/renderer';
import { AudioManager } from '../audio/audio';
import { el } from './dom';
import {
  galleryPreviewTitleKind,
  previewScenarioFor,
  previewShouldReset,
  setupPreviewScene,
  PREVIEW_DEFENDER,
  PREVIEW_FOCUS_X,
  PREVIEW_FOCUS_Y,
  type GalleryPreviewSubject,
  type PreviewScenario,
} from './gallery-preview-scene';
import type { Simulation } from '../sim/simulation';

export {
  isDefenseBuilding,
  isGalleryPreviewable,
  previewScenarioFor,
  galleryPreviewHint,
  galleryPreviewCardTitle,
} from './gallery-preview-scene';
export type { GalleryPreviewSubject } from './gallery-preview-scene';

const PREVIEW_ZOOM = 2.4;

let previewPendingStormChain = false;

function handlePreviewEvent(
  ev: GameEvent,
  effects: Renderer['effects'],
  getState: () => GameState,
  registry: Registry,
  audio: AudioManager,
): void {
  const state = getState();
  switch (ev.type) {
    case 'attackFired': {
      const src = state.entities.get(ev.sourceId);
      if (src?.defId === 'celestial_cannon') {
        audio.playCelestialFire();
        effects.spawn('flash', ev.x, ev.y, 0xd9f3ff, 12);
        break;
      }
      if (src?.defId === 'storm_conductor') {
        previewPendingStormChain = true;
        break;
      }
      if (src?.defId === 'arcane_sentry') {
        const crystalIndex = ev.crystalIndex ?? 0;
        audio.playSentryBolt(crystalIndex);
        registerSentryBoltFired(ev.sourceId, crystalIndex, src.facing, ev.x, ev.y);
        break;
      }
      const fx = attackFxForEntity(registry, src);
      const inSanctuary = src?.kind === 'unit' && isUnitInSanctuaryAura(state, registry, src);
      if (inSanctuary && src) {
        audio.playSanctuaryBuffShimmer();
        spawnSanctuaryAttackTrail(ev.x, ev.y, src.facing);
      } else {
        audio.play(ev);
      }
      if (fx && src) {
        applyAttackFxBursts(effects, attackFiredBursts(fx, src.facing), ev.x, ev.y, src.facing);
      } else if (!inSanctuary) {
        effects.spawn('flash', ev.x, ev.y, 0xffe08a, 6);
      }
      break;
    }
    case 'beamStarted':
      audio.play(ev);
      effects.spawn('flash', ev.x, ev.y, 0xffa060, 8);
      break;
    case 'damageDealt':
      if (!previewPendingStormChain) {
        if (isSentryDamageSource(state, ev.sourceId)) {
          spawnSentrySilhouetteFlash(ev.targetId, ev.x, ev.y);
        } else {
          const src = ev.sourceId !== undefined ? state.entities.get(ev.sourceId) : undefined;
          const fx = attackFxForEntity(registry, src);
          if (fx && src) {
            applyAttackFxBursts(effects, attackHitBursts(fx, src.facing), ev.x, ev.y, src.facing);
          } else {
            effects.spawn('flash', ev.x, ev.y, 0xffffff, 5);
          }
        }
      }
      break;
    case 'healApplied': {
      const target = state.entities.get(ev.targetId);
      const inSanctuary = target?.kind === 'unit' && isUnitInSanctuaryAura(state, registry, target);
      if (!inSanctuary) effects.spawn('spark', ev.x, ev.y, 0x8fffd2, 5);
      break;
    }
    case 'attackCharging': {
      const src = state.entities.get(ev.sourceId);
      if (src?.defId === 'celestial_cannon') {
        audio.playCelestialChargeStart();
      } else if (src?.defId === 'storm_conductor') {
        audio.playStormChargeStart();
      } else {
        audio.play(ev);
        effects.spawn('ring', ev.x, ev.y, 0xd9f3ff, 36);
      }
      break;
    }
    case 'chainLightningFired':
      previewPendingStormChain = false;
      audio.playStormPrimaryStrike();
      for (let i = 1; i < ev.hits.length; i++) {
        audio.playStormChainJump(i);
      }
      effects.spawn('flash', ev.hits[0]!.x, ev.hits[0]!.y, 0xffffff, 22);
      spawnStormSequence(ev.x, ev.y, ev.hits);
      break;
    case 'artilleryImpact':
      audio.playCelestialImpact();
      effects.spawn('flash', ev.x, ev.y, 0xffffff, ev.radius * 0.55);
      effects.spawn('shockwave', ev.x, ev.y, 0xd9f3ff, ev.radius);
      spawnCelestialScorch(ev.x, ev.y, ev.radius);
      spawnCelestialSkyStrike(ev.x, ev.y, ev.radius);
      break;
    case 'entityDied':
      audio.play(ev);
      effects.spawn('puff', ev.x, ev.y, 0x9a9a9a, 14);
      break;
    case 'manaDeposited':
      audio.play(ev);
      effects.spawn('spark', ev.x, ev.y, 0x7fe3ff, 4);
      break;
    case 'manaConjured':
      audio.play(ev);
      effects.spawn('spark', ev.x, ev.y, 0xb58cff, 6);
      break;
    case 'buildingComplete': {
      const b = state.entities.get(ev.id);
      if (b) {
        audio.play(ev);
        effects.spawn('ring', b.pos.x, b.pos.y, 0x8b6cff, 30);
      }
      break;
    }
    case 'mobileHQDeployed': {
      const b = state.entities.get(ev.id);
      if (b) effects.spawn('flash', b.pos.x, b.pos.y, 0x8b6cff, 16);
      break;
    }
  }
}

export class DefenseCombatPreview {
  readonly overlay = el('div', 'art-gallery-combat-overlay');
  private panel = el('div', 'art-gallery-combat-panel');
  private titleEl = el('h2', 'art-gallery-combat-title');
  private captionEl = el('p', 'art-gallery-combat-caption');
  private panHintEl = el('p', 'art-gallery-combat-pan-hint', 'Drag to pan the battlefield.');
  private canvasHost = el('div', 'art-gallery-combat-canvas');
  private closeBtn = el('button', 'btn art-gallery-combat-close', 'Close');
  private renderer: Renderer | null = null;
  private loop: GameLoop | null = null;
  private sim: Simulation | null = null;
  private focusEntityId: EntityId = 0;
  private opposingIds: EntityId[] = [];
  private scenario: PreviewScenario;
  private ticksSinceReset = 0;
  private destroyed = false;
  private panActive = false;
  private audio = new AudioManager();
  private lastPanX = 0;
  private lastPanY = 0;
  private readonly onResize = (): void => this.applyViewport();

  constructor(
    private registry: Registry,
    private defId: string,
    name: string,
    private teamColor: string,
    private onClose: () => void,
    private subject: GalleryPreviewSubject = 'building',
  ) {
    this.scenario = previewScenarioFor(registry, subject, defId);
    this.titleEl.textContent = `${name} — ${galleryPreviewTitleKind(this.scenario)}`;
    this.captionEl.textContent = this.scenario.caption;
    this.closeBtn.addEventListener('click', () => this.close());
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });
    this.panel.append(this.titleEl, this.captionEl, this.panHintEl, this.canvasHost, this.closeBtn);
    this.overlay.appendChild(this.panel);
  }

  async open(): Promise<void> {
    document.body.appendChild(this.overlay);
    this.audio.unlock();
    this.bootstrapScene();

    const map = this.registry.map('duel_glade');
    this.renderer = new Renderer(this.registry, map);
    await this.renderer.init(this.canvasHost);
    this.renderer.setNav(this.sim!.services.nav);
    this.renderer.setOwnerColors(this.sim!.state, PREVIEW_DEFENDER);
    this.frameCamera();
    this.bindPan();
    this.renderer.syncTick(this.sim!.state);
    this.renderer.app.renderer.on('resize', this.onResize);

    this.loop = new GameLoop(
      () => this.stepSim(),
      (alpha) => this.renderFrame(alpha),
    );
    this.loop.start();
  }

  private applyViewport(): void {
    if (!this.renderer) return;
    const w = this.canvasHost.clientWidth || 640;
    const h = this.canvasHost.clientHeight || 360;
    this.renderer.camera.setViewport(w, h);
  }

  private frameCamera(): void {
    if (!this.renderer || !this.sim) return;
    this.applyViewport();
    const cam = this.renderer.camera;
    const focus = this.sim.state.entities.get(this.focusEntityId);
    const focusX = focus?.pos.x ?? PREVIEW_FOCUS_X;
    const focusY = focus?.pos.y ?? PREVIEW_FOCUS_Y;
    cam.centerOn(focusX, focusY);
    cam.setZoom(PREVIEW_ZOOM);
  }

  private bindPan(): void {
    const host = this.canvasHost;
    host.style.touchAction = 'none';
    host.title = 'Drag to pan';

    const onPointerDown = (e: PointerEvent): void => {
      if (e.button !== 0) return;
      this.panActive = true;
      this.lastPanX = e.clientX;
      this.lastPanY = e.clientY;
      host.classList.add('art-gallery-combat-canvas-grabbing');
      host.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent): void => {
      if (!this.panActive || !this.renderer) return;
      const dx = e.clientX - this.lastPanX;
      const dy = e.clientY - this.lastPanY;
      this.lastPanX = e.clientX;
      this.lastPanY = e.clientY;
      this.renderer.camera.panByScreen(dx, dy);
    };

    const onPointerEnd = (e: PointerEvent): void => {
      if (!this.panActive) return;
      this.panActive = false;
      host.classList.remove('art-gallery-combat-canvas-grabbing');
      if (host.hasPointerCapture(e.pointerId)) host.releasePointerCapture(e.pointerId);
    };

    host.addEventListener('pointerdown', onPointerDown);
    host.addEventListener('pointermove', onPointerMove);
    host.addEventListener('pointerup', onPointerEnd);
    host.addEventListener('pointercancel', onPointerEnd);
  }

  private bootstrapScene(): void {
    const built = setupPreviewScene(this.registry, this.subject, this.defId, this.teamColor);
    this.sim = built.sim;
    this.focusEntityId = built.focusEntityId;
    this.opposingIds = built.opposingIds;
    this.scenario = built.scenario;
    this.ticksSinceReset = 0;
    this.captionEl.textContent = built.scenario.caption;
    this.renderer?.syncTick(built.state);
    this.renderer?.effects.reset();
    resetSanctuaryVfx();
    resetArcaneSentryVfx();
    this.renderer?.snapDisplay();
    this.frameCamera();
  }

  private retargetFocus(state: GameState): void {
    if (state.entities.get(this.focusEntityId)) return;
    if (this.scenario.kind !== 'deploy' || !this.scenario.deployAs) return;
    for (const e of state.entities.values()) {
      if (e.owner === PREVIEW_DEFENDER && e.defId === this.scenario.deployAs && e.hp > 0) {
        this.focusEntityId = e.id;
        return;
      }
    }
  }

  private shouldReset(state: GameState): boolean {
    return previewShouldReset(state, this.scenario, this.focusEntityId, this.opposingIds, this.ticksSinceReset);
  }

  private stepSim(): boolean {
    if (this.destroyed || !this.sim || !this.renderer) return false;
    const result = this.sim.step();
    for (const ev of result.events) {
      handlePreviewEvent(ev, this.renderer.effects, () => this.sim!.state, this.registry, this.audio);
    }
    this.renderer.syncTick(this.sim.state);
    this.retargetFocus(this.sim.state);
    this.ticksSinceReset++;
    if (this.shouldReset(this.sim.state)) {
      this.bootstrapScene();
    }
    return !this.sim.state.ended;
  }

  private renderFrame(alpha: number): void {
    if (this.destroyed || !this.sim || !this.renderer) return;
    const nav = this.sim.services.nav;
    tickSanctuarySpireAudio(this.audio, this.sim.state, this.registry, PREVIEW_DEFENDER, nav, true);
    tickArcaneSentryAudio(this.audio, this.sim.state, this.registry, PREVIEW_DEFENDER, nav, true);
    this.renderer.render(this.sim.state, alpha, new Set(), undefined, TICK_MS, true);
  }

  close(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.audio.stopSanctuaryIdle();
    this.audio.stopSentryIdle();
    this.loop?.stop();
    this.loop = null;
    this.renderer?.app.renderer.off('resize', this.onResize);
    this.renderer?.app.destroy(true, { children: true });
    this.renderer = null;
    this.sim = null;
    this.overlay.remove();
    this.onClose();
  }
}
