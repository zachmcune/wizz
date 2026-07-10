// Live oblique combat vignette for a single defense — uses the real renderer + sim.
import { GameLoop } from '../core/game-loop';
import { TICK_MS } from '../core/constants';
import { setProjectionMode } from '../core/projection';
import type { Registry } from '../data/registry';
import type { BuildingEntity, UnitEntity } from '../sim/entity-types';
import { initMatch, recomputePower, spawnEntity, unlockTech } from '../sim/factory';
import { setGarrisonedIn, ensureGarrisonHost } from '../sim/capabilities';
import { Simulation } from '../sim/simulation';
import { visibilitySystem } from '../sim/systems/visibility';
import type { StepContext } from '../sim/context';
import type { EntityId, GameEvent, GameState, PlayerId } from '../sim/types';
import { spawnCelestialScorch, spawnCelestialSkyStrike } from '../render/celestial-cannon-vfx';
import { spawnStormSequence } from '../render/storm-conductor-vfx';
import { isUnitInSanctuaryAura, resetSanctuaryVfx, spawnSanctuaryAttackTrail } from '../render/sanctuary-spire-vfx';
import { resetArcaneSentryVfx } from '../render/arcane-sentry-vfx';
import { Renderer } from '../render/renderer';
import { el } from './dom';

// Open meadow tile — away from the center mana node at (2064, 1424).
const DEFENSE_X = 2384;
const DEFENSE_Y = 1184;
const DEFENDER: PlayerId = 'player0';
const ATTACKER: PlayerId = 'player1';
const RESET_TICKS = 360;
const PREVIEW_ZOOM = 2.4;

type ScenarioKind = 'combat' | 'heal' | 'garrison';

interface PreviewScenario {
  kind: ScenarioKind;
  caption: string;
  attackerUnit: string;
  attackerCount: number;
  attackerDx: number;
  attackerDy: number;
  attackerSpacing: number;
}

const SCENARIOS: Record<string, PreviewScenario> = {
  arcane_sentry: { kind: 'combat', caption: 'Arcane Sentry firing rapid arcane bolts at advancing heavy troops.', attackerUnit: 'stone_golem', attackerCount: 2, attackerDx: 170, attackerDy: 0, attackerSpacing: 48 },
  frost_spire: { kind: 'combat', caption: 'Frost Spire channeling a freezing energy stream.', attackerUnit: 'stone_golem', attackerCount: 2, attackerDx: 170, attackerDy: 0, attackerSpacing: 48 },
  inferno_beacon: { kind: 'combat', caption: 'Inferno Beacon sweeping a continuous flamethrower through a swarm.', attackerUnit: 'imp_swarmling', attackerCount: 4, attackerDx: 150, attackerDy: -20, attackerSpacing: 28 },
  storm_conductor: { kind: 'combat', caption: 'Storm Conductor chaining lightning through heavies.', attackerUnit: 'stone_golem', attackerCount: 3, attackerDx: 165, attackerDy: 0, attackerSpacing: 40 },
  celestial_cannon: { kind: 'combat', caption: 'Celestial Cannon channeling skyfire — rune warning, then devastating impact.', attackerUnit: 'stone_golem', attackerCount: 2, attackerDx: 340, attackerDy: 0, attackerSpacing: 56 },
  sanctuary_spire: { kind: 'heal', caption: 'Sanctuary Spire healing a wounded ally in its ward.', attackerUnit: 'stone_golem', attackerCount: 1, attackerDx: 220, attackerDy: 0, attackerSpacing: 0 },
  arcane_bunker: { kind: 'garrison', caption: 'Arcane Bunker with garrisoned archers firing at attackers.', attackerUnit: 'stone_golem', attackerCount: 2, attackerDx: 175, attackerDy: 0, attackerSpacing: 44 },
  stone_wall: { kind: 'combat', caption: 'Stone Wall holding the line while enemies break against it.', attackerUnit: 'imp_swarmling', attackerCount: 3, attackerDx: 90, attackerDy: 0, attackerSpacing: 24 },
  arcane_gate: { kind: 'combat', caption: 'Arcane Gate blocking the lane while enemies siege it.', attackerUnit: 'stone_golem', attackerCount: 2, attackerDx: 100, attackerDy: 0, attackerSpacing: 36 },
};

const DEFAULT_SCENARIO: PreviewScenario = {
  kind: 'combat',
  caption: 'Defense engaging enemy troops in oblique view.',
  attackerUnit: 'stone_golem',
  attackerCount: 2,
  attackerDx: 170,
  attackerDy: 0,
  attackerSpacing: 48,
};

function scenarioFor(defenseId: string): PreviewScenario {
  return SCENARIOS[defenseId] ?? DEFAULT_SCENARIO;
}

function spawnAttackers(
  state: GameState,
  services: StepContext['services'],
  scenario: PreviewScenario,
): EntityId[] {
  const ids: EntityId[] = [];
  const count = scenario.attackerCount;
  for (let i = 0; i < count; i++) {
    const row = i - (count - 1) / 2;
    const u = spawnEntity(
      state,
      services,
      null,
      scenario.attackerUnit,
      ATTACKER,
      DEFENSE_X + scenario.attackerDx,
      DEFENSE_Y + scenario.attackerDy + row * scenario.attackerSpacing,
    );
    ids.push(u.id);
  }
  return ids;
}

function garrisonArchers(state: GameState, services: StepContext['services'], bunker: BuildingEntity): void {
  const archerIds: EntityId[] = [];
  for (const ox of [-36, 36]) {
    const archer = spawnEntity(state, services, null, 'arcane_archer', DEFENDER, bunker.pos.x + ox, bunker.pos.y + 24) as UnitEntity;
    setGarrisonedIn(archer, bunker.id);
    archer.orders = [];
    archer.state = 'garrisoned';
    archerIds.push(archer.id);
  }
  ensureGarrisonHost(bunker).garrisonedIds = archerIds;
}

function setupScene(registry: Registry, defenseId: string, teamColor: string): {
  state: GameState;
  services: ReturnType<typeof initMatch>['services'];
  sim: Simulation;
  defenseEntityId: EntityId;
  attackerIds: EntityId[];
  scenario: PreviewScenario;
} {
  const { state, services } = initMatch(registry, registry.match('skirmish_1v1'));
  const scenario = scenarioFor(defenseId);
  const defender = state.players.find((p) => p.id === DEFENDER);
  if (defender) defender.color = teamColor;

  unlockTech(state, DEFENDER, 'sanctum');
  unlockTech(state, DEFENDER, 'ley_conduit');
  unlockTech(state, DEFENDER, 'arcane_nexus');
  unlockTech(state, DEFENDER, defenseId);

  spawnEntity(state, services, null, 'ley_conduit', DEFENDER, DEFENSE_X - 96, DEFENSE_Y + 72);
  spawnEntity(state, services, null, 'ley_conduit', DEFENDER, DEFENSE_X + 96, DEFENSE_Y + 72);

  const defense = spawnEntity(state, services, null, defenseId, DEFENDER, DEFENSE_X, DEFENSE_Y);
  if (scenario.kind === 'garrison' && defense.kind === 'building') {
    garrisonArchers(state, services, defense);
  }

  const attackerIds = spawnAttackers(state, services, scenario);

  if (scenario.kind === 'heal') {
    const ally = spawnEntity(state, services, null, 'stone_golem', DEFENDER, DEFENSE_X + 72, DEFENSE_Y) as UnitEntity;
    ally.hp = Math.max(1, Math.floor(ally.maxHp * 0.55));
  }

  recomputePower(state, services);
  const visCtx: StepContext = { services, events: [] };
  visibilitySystem(state, visCtx);

  const sim = new Simulation(state, services);
  sim.setAiEnabled(false);

  if (scenario.kind !== 'heal') {
    sim.enqueue(0, [{
      type: 'attack',
      playerId: ATTACKER,
      entityIds: attackerIds,
      targetId: defense.id,
    }]);
  }

  return { state, services, sim, defenseEntityId: defense.id, attackerIds, scenario };
}

let previewPendingStormChain = false;

function handlePreviewEvent(
  ev: GameEvent,
  effects: Renderer['effects'],
  getState: () => GameState,
  registry: Registry,
): void {
  const state = getState();
  switch (ev.type) {
    case 'attackFired': {
      const src = state.entities.get(ev.sourceId);
      if (src?.defId === 'storm_conductor') {
        previewPendingStormChain = true;
        break;
      }
      if (src?.kind === 'unit' && isUnitInSanctuaryAura(state, registry, src)) {
        spawnSanctuaryAttackTrail(ev.x, ev.y, src.facing);
        break;
      }
      effects.spawn('flash', ev.x, ev.y, 0xffe08a, 6);
      break;
    }
    case 'damageDealt':
      if (!previewPendingStormChain) {
        effects.spawn('flash', ev.x, ev.y, 0xffffff, 5);
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
      if (src?.defId === 'storm_conductor') break;
      effects.spawn('ring', ev.x, ev.y, 0xd9f3ff, 36);
      break;
    }
    case 'chainLightningFired':
      previewPendingStormChain = false;
      effects.spawn('flash', ev.hits[0]!.x, ev.hits[0]!.y, 0xffffff, 22);
      spawnStormSequence(ev.x, ev.y, ev.hits);
      break;
    case 'artilleryImpact':
      effects.spawn('flash', ev.x, ev.y, 0xffffff, ev.radius * 0.55);
      effects.spawn('shockwave', ev.x, ev.y, 0xd9f3ff, ev.radius);
      spawnCelestialScorch(ev.x, ev.y, ev.radius);
      spawnCelestialSkyStrike(ev.x, ev.y, ev.radius);
      break;
    case 'entityDied':
      effects.spawn('puff', ev.x, ev.y, 0x9a9a9a, 14);
      break;
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
  private defenseEntityId: EntityId = 0;
  private attackerIds: EntityId[] = [];
  private ticksSinceReset = 0;
  private destroyed = false;
  private panActive = false;
  private lastPanX = 0;
  private lastPanY = 0;
  private readonly onResize = (): void => this.applyViewport();

  constructor(
    private registry: Registry,
    private defenseId: string,
    defenseName: string,
    private teamColor: string,
    private onClose: () => void,
  ) {
    this.titleEl.textContent = `${defenseName} — 2.5D combat preview`;
    this.captionEl.textContent = scenarioFor(defenseId).caption;
    this.closeBtn.addEventListener('click', () => this.close());
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });
    this.panel.append(this.titleEl, this.captionEl, this.panHintEl, this.canvasHost, this.closeBtn);
    this.overlay.appendChild(this.panel);
  }

  async open(): Promise<void> {
    document.body.appendChild(this.overlay);
    this.bootstrapScene();

    const map = this.registry.map('duel_glade');
    this.renderer = new Renderer(this.registry, map);
    await this.renderer.init(this.canvasHost);
    setProjectionMode('oblique');
    this.renderer.setProjectionMode('oblique');
    this.renderer.setNav(this.sim!.services.nav);
    this.renderer.setOwnerColors(this.sim!.state, DEFENDER);
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
    const defense = this.sim.state.entities.get(this.defenseEntityId);
    const focusX = defense?.pos.x ?? DEFENSE_X;
    const focusY = defense?.pos.y ?? DEFENSE_Y;
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
    const built = setupScene(this.registry, this.defenseId, this.teamColor);
    this.sim = built.sim;
    this.defenseEntityId = built.defenseEntityId;
    this.attackerIds = built.attackerIds;
    this.ticksSinceReset = 0;
    this.captionEl.textContent = built.scenario.caption;
    this.renderer?.syncTick(built.state);
    this.renderer?.effects.reset();
    resetSanctuaryVfx();
    resetArcaneSentryVfx();
    this.renderer?.snapDisplay();
    this.frameCamera();
  }

  private shouldReset(state: GameState): boolean {
    if (this.ticksSinceReset >= RESET_TICKS) return true;
    const defense = state.entities.get(this.defenseEntityId);
    if (!defense || defense.hp <= 0) return true;
    const anyAttackers = this.attackerIds.some((id) => {
      const u = state.entities.get(id);
      return u && u.hp > 0;
    });
    const scenario = scenarioFor(this.defenseId);
    if (scenario.kind !== 'heal' && !anyAttackers) return true;
    return false;
  }

  private stepSim(): boolean {
    if (this.destroyed || !this.sim || !this.renderer) return false;
    const result = this.sim.step();
    for (const ev of result.events) {
      handlePreviewEvent(ev, this.renderer.effects, () => this.sim!.state, this.registry);
    }
    this.renderer.syncTick(this.sim.state);
    this.ticksSinceReset++;
    if (this.shouldReset(this.sim.state)) {
      this.bootstrapScene();
    }
    return !this.sim.state.ended;
  }

  private renderFrame(alpha: number): void {
    if (this.destroyed || !this.sim || !this.renderer) return;
    this.renderer.render(this.sim.state, alpha, new Set(), undefined, TICK_MS, true);
  }

  close(): void {
    if (this.destroyed) return;
    this.destroyed = true;
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

export function isDefenseBuilding(registry: Registry, buildingId: string): boolean {
  return registry.building(buildingId).menuCategory === 'defenses';
}
