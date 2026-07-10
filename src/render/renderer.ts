// PixiJS renderer. Reads interpolated sim state and draws it. NEVER mutates the sim.
import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { TILE } from '../core/constants';
import { projectGround, projectionSortKey } from '../core/coords';
import { facingToDirection, getProjectionMode, setProjectionMode as setGlobalProjectionMode, type ProjectionMode } from '../core/projection';
import { lerp } from '../sim/math';
import type { ResourceNodeEntity } from '../sim/entity-types';
import type { GameState, Entity, EntityId, PlayerId, KnownBuilding } from '../sim/types';
import type { Registry } from '../data/registry';
import type { MapData, ArtDef } from '../data/defs';
import { buildingHasPower, buildingPowerUse, isVisibleTo, isTileFogged, listBuildingGhosts, isBuildingInLiveSight, isNodeIntelVisible, getPlayer, hasBuff, pickEntity, pickResourceNode } from '../sim/views';
import { garrisonedInId, getHarvester, getFrostExposure, hasMorph, getMorph } from '../sim/capabilities';
import type { NavGrid } from '../sim/nav-grid';
import type { Player } from '../sim/types';
import { Camera } from './camera';
import { ShapeSpriteProvider, type SpriteProvider } from './shape-sprite';
import { EffectsLayer } from './effects';
import { frostExposureTint, renderTowerBeams } from './tower-beams';
import { renderCelestialCannons } from './celestial-cannon-vfx';
import { renderStormConductors } from './storm-conductor-vfx';
import { renderSanctuarySpires } from './sanctuary-spire-vfx';
import { renderArcaneSentries } from './arcane-sentry-vfx';
import { GraphicsPool } from './graphics-pool';
import { buildTerrainGraphics, drawFogTile } from './terrain-draw';
import { visualHeightAt } from './visual-height';
import { filterOccludedUnits, parseOwnerColor, type OcclusionBounds } from './unit-occlusion';

const NODE_ART: ArtDef = { shape: 'hexagon', size: 40, accent: '#39d0c0' };
const NEUTRAL_COLOR = '#39d0c0';
const NODE_DEPLETED_COLOR = '#4a4a5a';

export interface BuildPlacementGhost {
  x: number;
  y: number;
  valid: boolean;
  defId: string;
  color: string;
}

export interface RenderOverlay {
  ghost?: BuildPlacementGhost;
  wallGhosts?: BuildPlacementGhost[];
  spell?: { x: number; y: number; radius: number };
  confirm?: { x: number; y: number } | null;
  buildZones?: { x: number; y: number; r: number }[];
  rallyMarker?: { fromX: number; fromY: number; toX: number; toY: number };
  debugCircles?: { x: number; y: number; r: number; color: number; alpha?: number }[];
  debugLines?: { x1: number; y1: number; x2: number; y2: number; color: number }[];
  debugLabels?: { x: number; y: number; text: string; color?: number }[];
  statsText?: string;
}

interface RenderNode {
  sprite: Sprite;
  label?: Text;
  prevX: number;
  prevY: number;
  curX: number;
  curY: number;
  dispX: number;
  dispY: number;
  facing: number;
}

/** Exponential smoothing for unit/projectile display positions (per second). */
const DISPLAY_SMOOTH_HZ = 18;

/**
 * Screen-space occlusion tuning (oblique 2.5D only). Radii/lift are fractions of the
 * entity's visual `art.size`, matching the oblique voxel-box geometry in shape-sprite.ts.
 */
const OCCLUSION_BUILDING_RADIUS_FACTOR = 0.5;
const OCCLUSION_BUILDING_LIFT_FACTOR = 0.28;
const OCCLUSION_UNIT_RADIUS_FACTOR = 0.38;

/** Minimal marker drawn over a building where a hidden own-unit stands. */
const OCCLUSION_MARKER_RADIUS = 5;
const OCCLUSION_MARKER_WIDTH = 2;
const OCCLUSION_MARKER_ALPHA = 0.95;
const OCCLUSION_MARKER_FILL_ALPHA = 0.35;

interface OwnUnitBounds extends OcclusionBounds {
  color: string;
}

export class Renderer {
  app: Application;
  camera!: Camera;
  private provider!: SpriteProvider;
  private world = new Container();
  private terrainLayer = new Container();
  private fogLayer = new Graphics();
  private shadowLayer = new Graphics();
  private entityLayer = new Container();
  private selectionRingLayer = new Container();
  private labelLayer = new Container();
  private overlayLayer = new Container();
  effects = new EffectsLayer();
  private nodes = new Map<EntityId, RenderNode>();
  private ghostNodes = new Map<EntityId, RenderNode>();
  private placementGhosts: Sprite[] = [];
  private overlayFillPool!: GraphicsPool;
  private overlayStrokePool!: GraphicsPool;
  private selectionRingPool!: GraphicsPool;
  private colorByOwner = new Map<PlayerId, string>();
  private viewerId: PlayerId = '';
  private nav: NavGrid | null = null;
  private projectionMode: ProjectionMode = getProjectionMode();
  private showBuildingNames = false;
  private debugLabelPool: Text[] = [];
  private debugStatsLabel: Text | null = null;

  constructor(
    private registry: Registry,
    private map: MapData,
  ) {
    this.app = new Application();
  }

  private isOblique(): boolean {
    return this.projectionMode === 'oblique';
  }

  /** Screen draw position: world coords in Classic 2D, projected coords in oblique. */
  private drawPos(worldX: number, worldY: number): { x: number; y: number } {
    if (!this.isOblique()) return { x: worldX, y: worldY };
    return this.groundPos(worldX, worldY);
  }

  private updateLayerSort(): void {
    this.entityLayer.sortableChildren = true;
    this.selectionRingLayer.sortableChildren = true;
    this.labelLayer.sortableChildren = this.isOblique();
  }

  private updateEffectsPositionFn(): void {
    this.effects.setPositionFn((wx, wy) => this.drawPos(wx, wy));
  }

  async init(canvasParent: HTMLElement): Promise<void> {
    await this.app.init({
      background: '#12101c',
      resizeTo: canvasParent,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });
    canvasParent.appendChild(this.app.canvas);
    this.provider = new ShapeSpriteProvider(this.app.renderer);

    this.overlayFillPool = new GraphicsPool(this.overlayLayer);
    this.overlayStrokePool = new GraphicsPool(this.overlayLayer);
    this.selectionRingPool = new GraphicsPool(this.selectionRingLayer);
    this.world.addChild(
      this.terrainLayer,
      this.fogLayer,
      this.shadowLayer,
      this.entityLayer,
      this.selectionRingLayer,
      this.labelLayer,
      this.effects.container,
      this.overlayLayer,
    );
    this.app.stage.addChild(this.world);

    const worldW = this.map.tileW * TILE;
    const worldH = this.map.tileH * TILE;
    this.camera = new Camera(this.app.screen.width, this.app.screen.height, worldW, worldH);
    this.updateEffectsPositionFn();
    this.updateLayerSort();
    this.buildTerrain();

    this.app.renderer.on('resize', () => this.camera.setViewport(this.app.screen.width, this.app.screen.height));
  }

  setProjectionMode(mode: ProjectionMode): void {
    if (this.projectionMode === mode) return;
    setGlobalProjectionMode(mode);
    this.projectionMode = mode;
    this.provider.clearCache();
    this.buildTerrain();
    this.updateLayerSort();
    this.updateEffectsPositionFn();
    this.applySpriteAnchors();
    this.camera.setViewport(this.app.screen.width, this.app.screen.height);
  }

  getProjectionMode(): ProjectionMode {
    return this.projectionMode;
  }

  setShowBuildingNames(show: boolean): void {
    this.showBuildingNames = show;
  }

  refreshBuildingLabels(state: GameState): void {
    for (const [id, n] of this.nodes) {
      const e = state.entities.get(id);
      if (e) this.ensureBuildingLabel(n, e);
    }
    for (const [id, n] of this.ghostNodes) {
      if (n.label) {
        n.label.destroy();
        n.label = undefined;
      }
      this.ghostNodes.delete(id);
    }
  }

  private buildingLabelText(defId: string): string {
    return this.registry.building(defId).name;
  }

  private applySpriteAnchors(): void {
    const oblique = this.isOblique();
    for (const n of this.nodes.values()) {
      n.sprite.anchor.set(0.5, 0.5);
      if (oblique) n.sprite.rotation = 0;
    }
    for (const n of this.ghostNodes.values()) {
      n.sprite.anchor.set(0.5, 0.5);
      if (oblique) n.sprite.rotation = 0;
    }
  }

  /** Re-sync canvas size and clear stale vector paths after app background/resume. */
  handleResume(): void {
    const parent = this.app.canvas.parentElement;
    if (parent) {
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      if (w > 0 && h > 0) this.app.renderer.resize(w, h);
    }
    this.camera.setViewport(this.app.screen.width, this.app.screen.height);
    this.overlayFillPool.releaseAll();
    this.overlayStrokePool.releaseAll();
    this.selectionRingPool.releaseAll();
    this.fogLayer.clear();
    this.shadowLayer.clear();
    this.effects.reset();
  }

  setNav(nav: NavGrid): void {
    this.nav = nav;
  }

  setOwnerColors(state: GameState, viewerId: PlayerId): void {
    for (const p of state.players) this.colorByOwner.set(p.id, p.color);
    this.viewerId = viewerId;
  }

  private buildTerrain(): void {
    this.terrainLayer.removeChildren();
    this.terrainLayer.addChild(buildTerrainGraphics(this.map));
  }

  /** Render-layer position for a world ground point (includes visual height). */
  groundPos(worldX: number, worldY: number, visualHeight?: number): { x: number; y: number } {
    const h = visualHeight ?? visualHeightAt(this.map, worldX, worldY);
    return projectGround({ x: worldX, y: worldY }, h);
  }

  private applyCameraTransform(): void {
    const cam = this.camera.view();
    this.camera.tickShake();
    this.world.scale.set(cam.zoom);
    const shakeX = this.camera.shakeX;
    const shakeY = this.camera.shakeY;
    if (this.isOblique()) {
      const camProj = projectGround({ x: cam.x, y: cam.y });
      this.world.position.set(-camProj.x * cam.zoom + shakeX, -camProj.y * cam.zoom + shakeY);
    } else {
      this.world.position.set(-cam.x * cam.zoom + shakeX, -cam.y * cam.zoom + shakeY);
    }
  }

  private sortKeyAt(worldX: number, worldY: number): number {
    const h = visualHeightAt(this.map, worldX, worldY);
    return projectionSortKey({ x: worldX, y: worldY }, this.camera.view(), h);
  }

  private artOf(e: Entity): { art: ArtDef; color: string } {
    if (e.kind === 'unit') return { art: this.registry.unit(e.defId).art, color: this.colorByOwner.get(e.owner) ?? '#ffffff' };
    if (e.kind === 'building') {
      const b = this.registry.building(e.defId);
      return { art: b.art, color: this.colorByOwner.get(e.owner) ?? '#ffffff' };
    }
    if (e.kind === 'projectile') {
      const a = this.registry.projectile(e.defId).art;
      return { art: a, color: a.accent };
    }
    const max = e.amountMax ?? e.amount ?? 1;
    const frac = Math.max(0, (e.amount ?? 0) / max);
    return { art: NODE_ART, color: frac <= 0 ? NODE_DEPLETED_COLOR : NEUTRAL_COLOR };
  }

  private textureFor(e: Entity, art: ArtDef, color: string): Texture {
    if (this.projectionMode === 'oblique' && (e.kind === 'unit' || e.kind === 'projectile')) {
      return this.provider.texture(art, color, facingToDirection(e.facing));
    }
    return this.provider.texture(art, color);
  }

  private ensureBuildingLabel(n: RenderNode, e: Entity): void {
    if (e.kind !== 'building' && e.kind !== 'resource_node') {
      if (n.label) {
        n.label.destroy();
        n.label = undefined;
      }
      return;
    }
    if (e.kind === 'building') {
      if (!this.showBuildingNames) {
        if (n.label) {
          n.label.destroy();
          n.label = undefined;
        }
        return;
      }
      const labelText = this.buildingLabelText(e.defId);
      if (!n.label) {
        n.label = new Text({
          text: labelText,
          style: { fontFamily: 'system-ui, sans-serif', fontSize: 9, fontWeight: '700', fill: '#ffffff' },
        });
        n.label.anchor.set(0.5, 0);
        this.labelLayer.addChild(n.label);
      } else if (n.label.text !== labelText) {
        n.label.text = labelText;
      }
      return;
    }
    const max = e.amountMax ?? e.amount ?? 1;
    const frac = Math.max(0, (e.amount ?? 0) / max);
    const pct = Math.round(frac * 100);
    const text = frac <= 0 ? 'Empty' : `${pct}%`;
    if (!n.label) {
      n.label = new Text({
        text,
        style: { fontFamily: 'system-ui, sans-serif', fontSize: 9, fontWeight: '700', fill: frac <= 0 ? '#888899' : '#7fe3ff' },
      });
      n.label.anchor.set(0.5, 0);
      this.labelLayer.addChild(n.label);
    } else {
      n.label.text = text;
      n.label.style.fill = frac <= 0 ? '#888899' : '#7fe3ff';
    }
  }

  syncTick(state: GameState): void {
    for (const [id, e] of state.entities) {
      let n = this.nodes.get(id);
      if (!n) {
        const { art, color } = this.artOf(e);
        const sprite = new Sprite(this.textureFor(e, art, color));
        sprite.anchor.set(0.5, 0.5);
        this.entityLayer.addChild(sprite);
        n = { sprite, prevX: e.pos.x, prevY: e.pos.y, curX: e.pos.x, curY: e.pos.y, dispX: e.pos.x, dispY: e.pos.y, facing: e.facing };
        this.nodes.set(id, n);
      } else {
        n.prevX = n.curX;
        n.prevY = n.curY;
        n.curX = e.pos.x;
        n.curY = e.pos.y;
        n.facing = e.facing;
        const { art, color } = this.artOf(e);
        n.sprite.texture = this.textureFor(e, art, color);
      }
      this.ensureBuildingLabel(n, e);
    }
    for (const [id, n] of this.nodes) {
      if (!state.entities.has(id)) {
        n.sprite.destroy();
        n.label?.destroy();
        this.nodes.delete(id);
      }
    }
  }

  snapDisplay(): void {
    for (const n of this.nodes.values()) {
      n.dispX = n.curX;
      n.dispY = n.curY;
    }
  }

  private drawShadow(worldX: number, worldY: number, radius: number): void {
    if (this.projectionMode !== 'oblique') return;
    const p = this.groundPos(worldX, worldY);
    this.shadowLayer.ellipse(p.x, p.y + 2, radius * 0.55, radius * 0.28).fill({ color: 0x000000, alpha: 0.28 });
  }

  private positionOverlayAt(worldX: number, worldY: number, offsetY: number): { x: number; y: number } {
    if (!this.isOblique()) return { x: worldX, y: worldY + offsetY };
    const p = this.groundPos(worldX, worldY);
    return { x: p.x, y: p.y + offsetY * 0.5 };
  }

  render(state: GameState, alpha: number, selected: Set<EntityId>, overlay?: RenderOverlay, dtMs = 16, revealAllOverride = false): void {
    this.applyCameraTransform();

    const viewer = getPlayer(state, this.viewerId);
    const nav = this.nav;
    const revealAll = revealAllOverride || state.ended;

    this.overlayFillPool.releaseAll();
    this.overlayStrokePool.releaseAll();
    this.selectionRingPool.releaseAll();
    this.fogLayer.clear();
    this.shadowLayer.clear();
    if (viewer && nav && !revealAll) this.drawFog(state, viewer, nav);

    const oblique = this.isOblique();
    const buildingBounds: OcclusionBounds[] = [];
    const ownUnits: OwnUnitBounds[] = [];

    for (const [id, n] of this.nodes) {
      const e = state.entities.get(id);
      if (!e) continue;
      if (e.kind === 'unit' && garrisonedInId(e) !== undefined) {
        n.sprite.visible = false;
        if (n.label) n.label.visible = false;
        continue;
      }

      const liveVisible = revealAll || !nav || isVisibleTo(state, this.viewerId, e, nav);
      const showAsGhost =
        e.kind === 'building' &&
        nav &&
        !liveVisible &&
        !isBuildingInLiveSight(state, this.registry, this.viewerId, e, nav) &&
        getPlayer(state, this.viewerId)?.knownBuildings[e.id] !== undefined;

      n.sprite.visible = liveVisible && !showAsGhost;
      if (n.label) n.label.visible = liveVisible && !showAsGhost;
      if (e.kind === 'projectile' && e.defId === 'arcane_bolt') {
        n.sprite.visible = false;
      }
      if (!liveVisible && !showAsGhost) continue;
      if (showAsGhost) continue;

      const targetX = lerp(n.prevX, n.curX, alpha);
      const targetY = lerp(n.prevY, n.curY, alpha);
      let x = targetX;
      let y = targetY;
      if (e.kind === 'unit' || e.kind === 'projectile') {
        const k = 1 - Math.exp(-DISPLAY_SMOOTH_HZ * (dtMs / 1000));
        n.dispX += (targetX - n.dispX) * k;
        n.dispY += (targetY - n.dispY) * k;
        x = n.dispX;
        y = n.dispY;
      } else {
        n.dispX = targetX;
        n.dispY = targetY;
      }

      const pos = this.drawPos(x, y);
      const depth = this.sortKeyAt(x, y);
      n.sprite.position.set(pos.x, pos.y);
      n.sprite.zIndex = depth;

      if (oblique) {
        if (e.kind === 'building') {
          const size = this.artOf(e).art.size;
          buildingBounds.push({
            x: pos.x,
            y: pos.y - size * OCCLUSION_BUILDING_LIFT_FACTOR,
            radius: size * OCCLUSION_BUILDING_RADIUS_FACTOR,
            depth,
          });
        } else if (e.kind === 'unit' && e.owner === this.viewerId) {
          const size = this.artOf(e).art.size;
          ownUnits.push({
            x: pos.x,
            y: pos.y,
            radius: size * OCCLUSION_UNIT_RADIUS_FACTOR,
            depth,
            color: this.colorByOwner.get(e.owner) ?? '#ffffff',
          });
        }
      }

      if (!this.isOblique() && (e.kind === 'unit' || e.kind === 'projectile')) {
        n.sprite.rotation = n.facing + Math.PI / 2;
      } else if (this.isOblique()) {
        n.sprite.rotation = 0;
      }

      if (e.kind === 'unit' || e.kind === 'building') this.drawShadow(x, y, e.radius);

      const labelOff = e.radius + 4;
      if (n.label) {
        if (this.isOblique()) {
          const lp = this.positionOverlayAt(x, y, labelOff);
          n.label.position.set(lp.x, lp.y);
          n.label.zIndex = n.sprite.zIndex + 0.01;
        } else {
          n.label.position.set(x, y + labelOff);
        }
        if (e.kind === 'resource_node') {
          const intel = revealAll || (viewer && nav && isNodeIntelVisible(state, this.viewerId, e, nav));
          n.label.visible = !!intel;
        } else {
          n.label.alpha = e.kind === 'building' && e.owner !== this.viewerId ? 0.75 : 1;
        }
      }

      if (e.kind === 'resource_node') {
        const intel = revealAll || (viewer && nav && isNodeIntelVisible(state, this.viewerId, e, nav));
        if (intel) {
          const { art, color } = this.artOf(e);
          n.sprite.texture = this.provider.texture(art, color);
          this.drawNodeReserve(pos.x, pos.y, e);
          n.sprite.alpha = (e.amount ?? 0) <= 0 ? 0.35 : 1;
        } else {
          n.sprite.texture = this.provider.texture(NODE_ART, NEUTRAL_COLOR);
          n.sprite.alpha = 1;
        }
      } else if (e.kind === 'building' && buildingPowerUse(this.registry, e.defId) > 0 && !buildingHasPower(state, this.registry, e)) {
        n.sprite.alpha = 0.42;
        n.sprite.tint = 0xffffff;
        this.drawPowerOffline(pos.x, pos.y, e.radius);
      } else {
        n.sprite.alpha = 1;
        if (e.kind === 'unit' || e.kind === 'building') {
          n.sprite.tint = frostExposureTint(getFrostExposure(e));
        } else {
          n.sprite.tint = 0xffffff;
        }
      }

      if (selected.has(id)) this.strokeSelectionRing(x, y, e.radius + 6, 2, 0xffffff, 0.9, depth);

      if ((e.kind === 'unit' || e.kind === 'building') && (e.hp < e.maxHp || selected.has(id))) {
        const hp = this.positionOverlayAt(x, y, -e.radius - 8);
        this.drawHpBar(hp.x, hp.y, e);
      }
      if (e.kind === 'building' && e.buildProgress !== undefined) {
        const bar = this.positionOverlayAt(x, y, e.radius + 3);
        this.fillRect(bar.x - e.radius, bar.y, e.radius * 2 * e.buildProgress, 3, 0x7fe3ff);
      }
      if ((e.kind === 'building' || e.kind === 'unit') && hasMorph(e)) {
        const bar = this.positionOverlayAt(x, y, e.radius + 6);
        this.fillRect(bar.x - e.radius, bar.y, e.radius * 2 * (getMorph(e)?.progress ?? 0), 3, 0x8b6cff);
      }
      const harvester = getHarvester(e);
      if (e.kind === 'unit' && harvester && harvester.carry > 0) {
        const dot = this.positionOverlayAt(x, y, -e.radius - 4);
        this.fillDot(dot.x, dot.y, 3, 0x7fe3ff);
      }
      if (e.kind === 'unit' && hasBuff(e, 'slow', state.tick)) {
        const icon = this.positionOverlayAt(x, y, -e.radius - 16);
        this.drawSlowIcon(icon.x, icon.y);
      }
    }

    if (oblique) {
      for (const u of filterOccludedUnits(ownUnits, buildingBounds)) {
        this.drawOccludedUnitMarker(u.x, u.y, u.color);
      }
    }

    if (viewer && nav && !revealAll) this.renderBuildingGhosts(state, viewer, nav);

    if (overlay?.buildZones?.length) {
      for (const z of overlay.buildZones) {
        const p = this.drawPos(z.x, z.y);
        this.strokeSquare(p.x, p.y, z.r, 1.5, 0x5dff8f, 0.22);
      }
    }
    const placementGhosts: BuildPlacementGhost[] = [];
    if (overlay?.ghost) placementGhosts.push(overlay.ghost);
    if (overlay?.wallGhosts?.length) placementGhosts.push(...overlay.wallGhosts);
    this.renderPlacementGhosts(placementGhosts);
    if (overlay?.spell) {
      const p = this.drawPos(overlay.spell.x, overlay.spell.y);
      this.strokeRing(p.x, p.y, overlay.spell.radius, 2, 0xffd166, 0.9);
    }
    if (overlay?.confirm) {
      const p = this.drawPos(overlay.confirm.x, overlay.confirm.y);
      this.strokeRing(p.x, p.y, 12, 3, 0xffd166, 1);
    }
    if (overlay?.rallyMarker) {
      const from = this.drawPos(overlay.rallyMarker.fromX, overlay.rallyMarker.fromY);
      const to = this.drawPos(overlay.rallyMarker.toX, overlay.rallyMarker.toY);
      this.overlayStrokePool.acquire().moveTo(from.x, from.y).lineTo(to.x, to.y).stroke({ width: 2, color: 0x7fe3ff, alpha: 0.85 });
      this.fillDot(to.x, to.y, 5, 0x7fe3ff, 0.9);
      this.strokeRing(to.x, to.y, 10, 2, 0x7fe3ff, 0.7);
    }
    for (const b of state.beams) {
      const p = this.drawPos(b.pos.x, b.pos.y);
      if (b.state === 'charging') {
        this.strokeRing(p.x, p.y, b.radius, 2, 0xff5d5d, 0.9);
        this.strokeRing(p.x, p.y, b.radius * 0.55, 2, 0xff5d5d, 0.6);
      } else {
        this.fillDot(p.x, p.y, b.radius, 0x9fdcff, 0.35);
        this.strokeRing(p.x, p.y, b.radius, 3, 0x8b6cff, 0.95);
        this.overlayStrokePool
          .acquire()
          .moveTo(p.x, p.y)
          .lineTo(p.x, p.y - 500)
          .stroke({ width: 6, color: 0x9fdcff, alpha: 0.7 });
      }
    }
    renderTowerBeams(
      state,
      this.registry,
      this.viewerId,
      this.nav,
      revealAll,
      (wx, wy) => this.drawPos(wx, wy),
      this.overlayFillPool,
      this.overlayStrokePool,
      state.tick + alpha,
    );
    renderCelestialCannons(
      state,
      this.registry,
      this.viewerId,
      this.nav,
      revealAll,
      (wx, wy) => this.drawPos(wx, wy),
      this.overlayFillPool,
      this.overlayStrokePool,
      state.tick + alpha,
    );
    renderStormConductors(
      state,
      this.registry,
      this.viewerId,
      this.nav,
      revealAll,
      (wx, wy) => this.drawPos(wx, wy),
      this.overlayFillPool,
      this.overlayStrokePool,
      state.tick + alpha,
    );
    renderSanctuarySpires(
      state,
      this.registry,
      this.viewerId,
      this.nav,
      revealAll,
      (wx, wy) => this.drawPos(wx, wy),
      this.overlayFillPool,
      this.overlayStrokePool,
      state.tick + alpha,
      dtMs / 1000,
    );
    renderArcaneSentries(
      state,
      this.registry,
      this.viewerId,
      this.nav,
      revealAll,
      (wx, wy) => this.drawPos(wx, wy),
      this.overlayFillPool,
      this.overlayStrokePool,
      state.tick + alpha,
      dtMs / 1000,
    );
    if (overlay?.debugCircles?.length) {
      for (const c of overlay.debugCircles) {
        const p = this.drawPos(c.x, c.y);
        this.strokeRing(p.x, p.y, c.r, 1.5, c.color, c.alpha ?? 0.25);
      }
    }
    if (overlay?.debugLines?.length) {
      for (const l of overlay.debugLines) {
        const a = this.drawPos(l.x1, l.y1);
        const b = this.drawPos(l.x2, l.y2);
        this.overlayStrokePool.acquire().moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 1, color: l.color, alpha: 0.8 });
      }
    }
    if (overlay?.debugLabels?.length) {
      this.syncDebugLabels(overlay.debugLabels);
    } else {
      this.clearDebugLabels();
    }
    if (overlay?.statsText) {
      if (!this.debugStatsLabel) {
        this.debugStatsLabel = new Text({
          text: overlay.statsText,
          style: { fontFamily: 'system-ui, sans-serif', fontSize: 11, fontWeight: '600', fill: '#d8e6ff' },
        });
        this.debugStatsLabel.anchor.set(0, 0);
        this.debugStatsLabel.position.set(8, 8);
        this.app.stage.addChild(this.debugStatsLabel);
      } else {
        this.debugStatsLabel.text = overlay.statsText;
        this.debugStatsLabel.visible = true;
      }
    } else if (this.debugStatsLabel) {
      this.debugStatsLabel.visible = false;
    }
    this.effects.update();
  }

  private drawPowerOffline(x: number, y: number, radius: number): void {
    this.strokeRing(x, y, radius + 4, 2, 0xff5d5d, 0.85);
    const s = radius * 0.35;
    this.overlayStrokePool.acquire()
      .moveTo(x - s, y - s)
      .lineTo(x + s, y + s)
      .stroke({ width: 2, color: 0xff5d5d, alpha: 0.9 });
    this.overlayStrokePool.acquire()
      .moveTo(x + s, y - s)
      .lineTo(x - s, y + s)
      .stroke({ width: 2, color: 0xff5d5d, alpha: 0.9 });
  }

  private syncDebugLabels(labels: NonNullable<RenderOverlay['debugLabels']>): void {
    while (this.debugLabelPool.length < labels.length) {
      const t = new Text({
        text: '',
        style: { fontFamily: 'system-ui, sans-serif', fontSize: 10, fontWeight: '600', fill: '#ffffff' },
      });
      t.anchor.set(0.5, 1);
      this.labelLayer.addChild(t);
      this.debugLabelPool.push(t);
    }
    for (let i = 0; i < this.debugLabelPool.length; i++) {
      const label = this.debugLabelPool[i]!;
      const src = labels[i];
      if (!src) {
        label.visible = false;
        continue;
      }
      const p = this.drawPos(src.x, src.y);
      label.visible = true;
      label.text = src.text;
      label.style.fill = src.color !== undefined ? `#${src.color.toString(16).padStart(6, '0')}` : '#ffffff';
      label.position.set(p.x, p.y);
    }
  }

  private clearDebugLabels(): void {
    for (const label of this.debugLabelPool) label.visible = false;
  }

  private drawSlowIcon(x: number, y: number): void {
    this.fillDot(x, y, 4, 0x9fdcff, 0.9);
    this.overlayStrokePool.acquire().moveTo(x - 5, y).lineTo(x + 5, y).stroke({ width: 1.5, color: 0xd9f3ff, alpha: 0.95 });
    this.overlayStrokePool.acquire().moveTo(x, y - 5).lineTo(x, y + 5).stroke({ width: 1.5, color: 0xd9f3ff, alpha: 0.95 });
  }

  /**
   * Minimal on-top hint for an own unit hidden behind a building (oblique only).
   * Drawn via the overlay pools, which sit above the entity layer, so it reads over the
   * occluding building without any zIndex juggling.
   */
  private drawOccludedUnitMarker(x: number, y: number, colorHex: string): void {
    const color = parseOwnerColor(colorHex);
    this.fillDot(x, y, OCCLUSION_MARKER_RADIUS - 1, color, OCCLUSION_MARKER_FILL_ALPHA);
    this.overlayStrokePool
      .acquire()
      .circle(x, y, OCCLUSION_MARKER_RADIUS)
      .stroke({ width: OCCLUSION_MARKER_WIDTH, color, alpha: OCCLUSION_MARKER_ALPHA });
  }

  private drawNodeReserve(x: number, y: number, e: ResourceNodeEntity): void {
    const max = e.amountMax;
    const frac = Math.max(0, Math.min(1, e.amount / max));
    const ringR = e.radius + 6;
    const track = 0x1a1826;
    const fill = frac <= 0 ? 0x555566 : 0x39d0c0;

    this.strokeRing(x, y, ringR, 4, track, 0.9);
    if (frac > 0) {
      const start = -Math.PI / 2;
      const end = start + Math.PI * 2 * frac;
      this.strokeRing(x, y, ringR, 4, fill, 0.95, start, end);
    }
    const barW = Math.max(12, e.radius * 1.2);
    const barH = 5;
    const barY = y + e.radius * 0.55;
    const barX = x - barW / 2;
    this.fillRect(barX, barY, barW, barH, 0x000000, 0.55);
    if (frac > 0) this.fillRect(barX, barY, barW * frac, barH, fill, 0.9);
  }

  private renderBuildingGhosts(state: GameState, viewer: Player, nav: NavGrid): void {
    const ghosts = listBuildingGhosts(state, this.registry, viewer.id, nav);
    const active = new Set<EntityId>();

    for (const known of ghosts) {
      active.add(known.id);
      let n = this.ghostNodes.get(known.id);
      const b = this.registry.building(known.defId);
      const color = this.colorByOwner.get(known.owner) ?? '#888888';
      if (!n) {
        const sprite = new Sprite(this.provider.texture(b.art, color));
        sprite.anchor.set(0.5, 0.5);
        sprite.tint = 0xaaaaaa;
        this.entityLayer.addChild(sprite);
        let label: Text | undefined;
        if (this.showBuildingNames) {
          label = new Text({
            text: this.buildingLabelText(known.defId),
            style: { fontFamily: 'system-ui, sans-serif', fontSize: 9, fontWeight: '700', fill: '#aaaaaa' },
          });
          label.anchor.set(0.5, 0);
          this.labelLayer.addChild(label);
        }
        n = { sprite, label, prevX: known.x, prevY: known.y, curX: known.x, curY: known.y, dispX: known.x, dispY: known.y, facing: 0 };
        this.ghostNodes.set(known.id, n);
      } else {
        n.sprite.texture = this.provider.texture(b.art, color);
        if (this.showBuildingNames) {
          const labelText = this.buildingLabelText(known.defId);
          if (!n.label) {
            n.label = new Text({
              text: labelText,
              style: { fontFamily: 'system-ui, sans-serif', fontSize: 9, fontWeight: '700', fill: '#aaaaaa' },
            });
            n.label.anchor.set(0.5, 0);
            this.labelLayer.addChild(n.label);
          } else if (n.label.text !== labelText) {
            n.label.text = labelText;
          }
        } else if (n.label) {
          n.label.destroy();
          n.label = undefined;
        }
      }

      const pos = this.drawPos(known.x, known.y);
      n.sprite.position.set(pos.x, pos.y);
      if (this.isOblique()) n.sprite.zIndex = this.sortKeyAt(known.x, known.y);
      n.sprite.alpha = 0.48;
      n.sprite.visible = true;
      if (n.label) {
        if (this.isOblique()) {
          const lp = this.positionOverlayAt(known.x, known.y, known.radius + 4);
          n.label.position.set(lp.x, lp.y);
          n.label.zIndex = n.sprite.zIndex + 0.01;
        } else {
          n.label.position.set(known.x, known.y + known.radius + 4);
        }
        n.label.alpha = 0.55;
        n.label.visible = true;
      }

      if (known.hp < known.maxHp) {
        if (this.isOblique()) {
          const hp = this.positionOverlayAt(known.x, known.y, -known.radius - 8);
          this.drawHpBar(hp.x, hp.y, known);
        } else {
          this.drawHpBar(known.x, known.y - known.radius - 8, known);
        }
      }
      if (known.buildProgress !== undefined) {
        if (this.isOblique()) {
          const bar = this.positionOverlayAt(known.x, known.y, known.radius + 3);
          this.fillRect(bar.x - known.radius, bar.y, known.radius * 2 * known.buildProgress, 3, 0x7fe3ff, 0.45);
        } else {
          this.fillRect(
            known.x - known.radius,
            known.y + known.radius + 3,
            known.radius * 2 * known.buildProgress,
            3,
            0x7fe3ff,
            0.45,
          );
        }
      }
    }

    for (const [id, n] of this.ghostNodes) {
      if (active.has(id)) continue;
      n.sprite.destroy();
      n.label?.destroy();
      this.ghostNodes.delete(id);
    }
  }

  private renderPlacementGhosts(ghosts: BuildPlacementGhost[]): void {
    while (this.placementGhosts.length < ghosts.length) {
      const sprite = new Sprite();
      sprite.anchor.set(0.5, 0.5);
      this.entityLayer.addChild(sprite);
      this.placementGhosts.push(sprite);
    }
    for (let i = 0; i < this.placementGhosts.length; i++) {
      const sprite = this.placementGhosts[i]!;
      const ghost = ghosts[i];
      if (!ghost) {
        sprite.visible = false;
        continue;
      }
      const def = this.registry.building(ghost.defId);
      sprite.texture = this.provider.texture(def.art, ghost.color);
      const pos = this.drawPos(ghost.x, ghost.y);
      sprite.position.set(pos.x, pos.y);
      sprite.rotation = 0;
      sprite.alpha = ghost.valid ? 0.72 : 0.48;
      sprite.tint = ghost.valid ? 0xafffbf : 0xffa0a0;
      sprite.visible = true;
      if (this.isOblique()) sprite.zIndex = this.sortKeyAt(ghost.x, ghost.y) + 0.5;
    }
  }

  private drawHpBar(x: number, y: number, e: Entity | KnownBuilding): void {
    const w = Math.max(16, e.radius * 2);
    const frac = Math.max(0, e.hp / e.maxHp);
    const col = frac > 0.5 ? 0x5dff8f : frac > 0.25 ? 0xffd166 : 0xff5d5d;
    this.fillRect(x - w / 2, y, w, 4, 0x000000, 0.6);
    if (frac > 0) this.fillRect(x - w / 2, y, w * frac, 4, col);
  }

  private strokeSelectionRing(
    worldX: number,
    worldY: number,
    radius: number,
    width: number,
    color: number,
    alpha: number,
    depth: number,
  ): void {
    const pos = this.drawPos(worldX, worldY);
    const g = this.selectionRingPool.acquire();
    // Slightly above the entity so the ring isn't clipped by its own sprite, but still
    // behind anything drawn in front (higher depth).
    g.zIndex = depth + 0.001;
    g.circle(pos.x, pos.y, radius).stroke({ width, color, alpha });
  }

  private strokeSquare(cx: number, cy: number, half: number, width: number, color: number, alpha: number): void {
    const g = this.overlayStrokePool.acquire();
    g.rect(cx - half, cy - half, half * 2, half * 2).stroke({ width, color, alpha });
  }

  private strokeRing(cx: number, cy: number, r: number, width: number, color: number, alpha: number, start = 0, end = Math.PI * 2): void {
    const g = this.overlayStrokePool.acquire();
    const full = start === 0 && end >= Math.PI * 2 - 0.001;
    if (full) {
      g.circle(cx, cy, r).stroke({ width, color, alpha });
      return;
    }
    const sx = cx + Math.cos(start) * r;
    const sy = cy + Math.sin(start) * r;
    g.moveTo(sx, sy).arc(cx, cy, r, start, end).stroke({ width, color, alpha });
  }

  private drawFog(_state: GameState, player: Player, nav: NavGrid): void {
    let hasFog = false;
    for (let ty = 0; ty < nav.h; ty++) {
      for (let tx = 0; tx < nav.w; tx++) {
        const i = ty * nav.w + tx;
        if (!isTileFogged(player, i)) continue;
        hasFog = true;
        drawFogTile(this.fogLayer, this.map, tx, ty);
      }
    }
    if (hasFog) this.fogLayer.fill({ color: 0xb8b8c8, alpha: 0.42 });
  }

  private fillRect(x: number, y: number, w: number, h: number, color: number, alpha = 1): void {
    this.overlayFillPool.acquire().rect(x, y, w, h).fill({ color, alpha });
  }

  private fillDot(cx: number, cy: number, r: number, color: number, alpha = 1): void {
    this.overlayFillPool.acquire().circle(cx, cy, r).fill({ color, alpha });
  }

  pickResourceNode(state: GameState, wx: number, wy: number): Entity | null {
    return pickResourceNode(state, this.viewerId, wx, wy, this.nav);
  }

  pickEntity(state: GameState, wx: number, wy: number): Entity | null {
    return pickEntity(state, this.viewerId, wx, wy, this.nav);
  }

  destroy(): void {
    for (const sprite of this.placementGhosts) sprite.destroy();
    this.placementGhosts = [];
    for (const n of this.ghostNodes.values()) {
      n.sprite.destroy();
      n.label?.destroy();
    }
    this.ghostNodes.clear();
    this.app.destroy(true, { children: true });
  }

  makeTexture(art: ArtDef, color: string): Texture {
    return this.provider.texture(art, color);
  }

  iconCanvas(art: ArtDef, color: string): HTMLCanvasElement {
    // Build/train menu previews mirror the match's projection: the flat shape in Classic 2D,
    // the voxel box in oblique 2.5D. Using the in-world texture keeps the preview identical to
    // how the unit/building will actually look once placed.
    const tex = this.provider.texture(art, color);
    return this.app.renderer.extract.canvas(tex) as unknown as HTMLCanvasElement;
  }
}
