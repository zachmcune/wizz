// PixiJS renderer. Reads interpolated sim state and draws it. NEVER mutates the sim.
import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { TILE } from '../core/constants';
import { lerp } from '../sim/math';
import type { GameState, Entity, EntityId, PlayerId, KnownBuilding } from '../sim/types';
import type { Registry } from '../data/registry';
import type { MapData, ArtDef } from '../data/defs';
import { buildingHasPower, buildingPowerUse } from '../sim/power';
import { isVisibleTo, radarActive, isTileFogged, listBuildingGhosts, isBuildingInLiveSight } from '../sim/fog';
import { getPlayer } from '../sim/queries';
import type { NavGrid } from '../sim/nav-grid';
import type { Player } from '../sim/types';
import { Camera } from './camera';
import { ShapeSpriteProvider, type SpriteProvider } from './shape-sprite';
import { EffectsLayer } from './effects';

const NODE_ART: ArtDef = { shape: 'hexagon', size: 40, accent: '#39d0c0' };
const NEUTRAL_COLOR = '#39d0c0';
const NODE_DEPLETED_COLOR = '#4a4a5a';

function hexToNumber(hex: string): number {
  return Number.parseInt(hex.replace('#', ''), 16);
}

export interface RenderOverlay {
  ghost?: { x: number; y: number; size: number; valid: boolean };
  spell?: { x: number; y: number; radius: number };
  confirm?: { x: number; y: number } | null;
  buildZones?: { x: number; y: number; r: number }[];
  rallyMarker?: { fromX: number; fromY: number; toX: number; toY: number };
}

interface RenderNode {
  sprite: Sprite;
  label?: Text;
  prevX: number;
  prevY: number;
  curX: number;
  curY: number;
  facing: number;
}

export class Renderer {
  app: Application;
  camera!: Camera;
  private provider!: SpriteProvider;
  private world = new Container();
  private terrainLayer = new Container();
  private fogLayer = new Graphics();
  private entityLayer = new Container();
  private labelLayer = new Container();
  private overlayLayer = new Container();
  effects = new EffectsLayer();
  private nodes = new Map<EntityId, RenderNode>();
  private ghostNodes = new Map<EntityId, RenderNode>();
  /** Separate fill/stroke graphics — mixing both on one object causes stray connector lines on Android WebGL. */
  private overlayFill = new Graphics();
  private overlayStroke = new Graphics();
  private colorByOwner = new Map<PlayerId, string>();
  private humanOwner: PlayerId = '';
  private nav: NavGrid | null = null;

  constructor(
    private registry: Registry,
    private map: MapData,
  ) {
    this.app = new Application();
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

    this.world.addChild(this.terrainLayer, this.fogLayer, this.entityLayer, this.labelLayer, this.effects.container, this.overlayLayer);
    this.overlayLayer.addChild(this.overlayFill, this.overlayStroke);
    this.app.stage.addChild(this.world);

    const worldW = this.map.tileW * TILE;
    const worldH = this.map.tileH * TILE;
    this.camera = new Camera(this.app.screen.width, this.app.screen.height, worldW, worldH);
    this.buildTerrain();

    this.app.renderer.on('resize', () => this.camera.setViewport(this.app.screen.width, this.app.screen.height));
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
    this.overlayFill.clear();
    this.overlayStroke.clear();
    this.fogLayer.clear();
    this.effects.reset();
  }

  setNav(nav: NavGrid): void {
    this.nav = nav;
  }

  setOwnerColors(state: GameState): void {
    for (const p of state.players) this.colorByOwner.set(p.id, p.color);
    const human = state.players.find((p) => p.controller === 'human');
    if (human) this.humanOwner = human.id;
  }

  private buildTerrain(): void {
    const g = new Graphics();
    for (let ty = 0; ty < this.map.tileH; ty++) {
      for (let tx = 0; tx < this.map.tileW; tx++) {
        const blocked = this.map.tiles[ty * this.map.tileW + tx] === 1;
        const base = blocked ? 0x24202f : (tx + ty) % 2 === 0 ? 0x1a1826 : 0x1d1b2a;
        g.rect(tx * TILE, ty * TILE, TILE, TILE).fill(base);
        if (blocked) g.rect(tx * TILE + 3, ty * TILE + 3, TILE - 6, TILE - 6).fill(0x342e44);
      }
    }
    this.terrainLayer.addChild(g);
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

  private ensureBuildingLabel(n: RenderNode, e: Entity): void {
    if (e.kind !== 'building' && e.kind !== 'resource_node') {
      if (n.label) {
        n.label.destroy();
        n.label = undefined;
      }
      return;
    }
    if (e.kind === 'building') {
      const b = this.registry.building(e.defId);
      if (!n.label) {
        n.label = new Text({
          text: b.shortLabel,
          style: { fontFamily: 'system-ui, sans-serif', fontSize: 10, fontWeight: '700', fill: '#ffffff' },
        });
        n.label.anchor.set(0.5, 0);
        this.labelLayer.addChild(n.label);
      } else if (n.label.text !== b.shortLabel) {
        n.label.text = b.shortLabel;
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

  /** Called once per sim tick: add/remove sprites and shift interpolation targets. */
  syncTick(state: GameState): void {
    for (const [id, e] of state.entities) {
      let n = this.nodes.get(id);
      if (!n) {
        const { art, color } = this.artOf(e);
        const sprite = new Sprite(this.provider.texture(art, color));
        sprite.anchor.set(0.5);
        this.entityLayer.addChild(sprite);
        n = { sprite, prevX: e.pos.x, prevY: e.pos.y, curX: e.pos.x, curY: e.pos.y, facing: e.facing };
        this.nodes.set(id, n);
      } else {
        n.prevX = n.curX;
        n.prevY = n.curY;
        n.curX = e.pos.x;
        n.curY = e.pos.y;
        n.facing = e.facing;
        const { art, color } = this.artOf(e);
        n.sprite.texture = this.provider.texture(art, color);
      }
      this.ensureBuildingLabel(n, e);
    }
    // remove sprites whose entity is gone
    for (const [id, n] of this.nodes) {
      if (!state.entities.has(id)) {
        n.sprite.destroy();
        n.label?.destroy();
        this.nodes.delete(id);
      }
    }
  }

  render(state: GameState, alpha: number, selected: Set<EntityId>, overlay?: RenderOverlay): void {
    this.world.scale.set(this.camera.zoom);
    this.world.position.set(-this.camera.x * this.camera.zoom, -this.camera.y * this.camera.zoom);

    const viewer = getPlayer(state, this.humanOwner);
    const nav = this.nav;

    this.overlayFill.clear();
    this.overlayStroke.clear();
    this.fogLayer.clear();
    if (viewer && nav) this.drawFog(state, viewer, nav);

    for (const [id, n] of this.nodes) {
      const e = state.entities.get(id);
      if (!e) continue;

      const liveVisible = !nav || isVisibleTo(state, this.humanOwner, e, nav);
      const showAsGhost =
        e.kind === 'building' &&
        nav &&
        !liveVisible &&
        !isBuildingInLiveSight(state, this.registry, this.humanOwner, e, nav) &&
        getPlayer(state, this.humanOwner)?.knownBuildings[e.id] !== undefined;

      n.sprite.visible = liveVisible && !showAsGhost;
      if (n.label) n.label.visible = liveVisible && !showAsGhost;
      if (!liveVisible && !showAsGhost) continue;
      if (showAsGhost) continue;
      const x = lerp(n.prevX, n.curX, alpha);
      const y = lerp(n.prevY, n.curY, alpha);
      n.sprite.position.set(x, y);
      if (e.kind === 'unit' || e.kind === 'projectile') n.sprite.rotation = n.facing + Math.PI / 2;

      if (n.label) {
        n.label.position.set(x, y + e.radius + 4);
        n.label.alpha = e.kind === 'building' && e.owner !== this.humanOwner ? 0.75 : 1;
      }

      if (e.kind === 'resource_node') {
        this.drawNodeReserve(x, y, e);
        n.sprite.alpha = (e.amount ?? 0) <= 0 ? 0.35 : 1;
      } else if (e.kind === 'building' && buildingPowerUse(this.registry, e.defId) > 0 && !buildingHasPower(state, this.registry, e)) {
        n.sprite.alpha = 0.42;
        this.drawPowerOffline(x, y, e.radius);
      } else {
        n.sprite.alpha = 1;
      }

      // owner-colored ring for buildings
      if (e.kind === 'building') {
        const ownerCol = this.colorByOwner.get(e.owner);
        if (ownerCol) {
          this.strokeRing(x, y, e.radius + 3, 2, hexToNumber(ownerCol), 0.9);
        }
      }

      // selection ring
      if (selected.has(id)) {
        this.strokeRing(x, y, e.radius + 6, 2, 0xffffff, 0.9);
      }
      // hp bar for damaged combatants + selected
      if ((e.kind === 'unit' || e.kind === 'building') && (e.hp < e.maxHp || selected.has(id))) {
        this.drawHpBar(x, y - e.radius - 8, e);
      }
      // construction shimmer
      if (e.buildProgress !== undefined) {
        this.fillRect(x - e.radius, y + e.radius + 3, e.radius * 2 * e.buildProgress, 3, 0x7fe3ff);
      }
      if (e.morphProgress !== undefined) {
        const w = e.kind === 'building' ? e.radius * 2 : e.radius * 2;
        this.fillRect(x - e.radius, y + e.radius + 6, w * e.morphProgress, 3, 0x8b6cff);
      }
      // carry indicator for wisps
      if (e.carry !== undefined && e.carry > 0) {
        this.fillDot(x, y - e.radius - 4, 3, 0x7fe3ff);
      }
    }

    if (viewer && nav) this.renderBuildingGhosts(state, viewer, nav);

    if (overlay?.buildZones?.length) {
      for (const z of overlay.buildZones) {
        this.strokeRing(z.x, z.y, z.r, 1.5, 0x5dff8f, 0.22);
      }
    }
    if (overlay?.ghost) {
      const gh = overlay.ghost;
      const col = gh.valid ? 0x5dff8f : 0xff5d5d;
      const gx = gh.x - gh.size / 2;
      const gy = gh.y - gh.size / 2;
      this.fillRect(gx, gy, gh.size, gh.size, col, 0.28);
      this.overlayStroke.rect(gx, gy, gh.size, gh.size).stroke({ width: 2, color: col });
    }
    if (overlay?.spell) {
      this.strokeRing(overlay.spell.x, overlay.spell.y, overlay.spell.radius, 2, 0xffd166, 0.9);
    }
    if (overlay?.confirm) {
      this.strokeRing(overlay.confirm.x, overlay.confirm.y, 12, 3, 0xffd166, 1);
    }
    if (overlay?.rallyMarker) {
      const { fromX, fromY, toX, toY } = overlay.rallyMarker;
      this.overlayStroke.moveTo(fromX, fromY).lineTo(toX, toY).stroke({ width: 2, color: 0x7fe3ff, alpha: 0.85 });
      this.fillDot(toX, toY, 5, 0x7fe3ff, 0.9);
      this.strokeRing(toX, toY, 10, 2, 0x7fe3ff, 0.7);
    }
    this.effects.update();
  }

  private drawPowerOffline(x: number, y: number, radius: number): void {
    this.strokeRing(x, y, radius + 4, 2, 0xff5d5d, 0.85);
    const s = radius * 0.35;
    this.overlayStroke
      .moveTo(x - s, y - s)
      .lineTo(x + s, y + s)
      .moveTo(x + s, y - s)
      .lineTo(x - s, y + s)
      .stroke({ width: 2, color: 0xff5d5d, alpha: 0.9 });
  }

  private drawNodeReserve(x: number, y: number, e: Entity): void {
    const max = e.amountMax ?? e.amount ?? 1;
    const frac = Math.max(0, Math.min(1, (e.amount ?? 0) / max));
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
        sprite.anchor.set(0.5);
        sprite.tint = 0xaaaaaa;
        this.entityLayer.addChild(sprite);
        const label = new Text({
          text: b.shortLabel,
          style: { fontFamily: 'system-ui, sans-serif', fontSize: 10, fontWeight: '700', fill: '#aaaaaa' },
        });
        label.anchor.set(0.5, 0);
        this.labelLayer.addChild(label);
        n = { sprite, label, prevX: known.x, prevY: known.y, curX: known.x, curY: known.y, facing: 0 };
        this.ghostNodes.set(known.id, n);
      } else {
        n.sprite.texture = this.provider.texture(b.art, color);
        if (n.label && n.label.text !== b.shortLabel) n.label.text = b.shortLabel;
      }

      const label = n.label!;
      n.sprite.position.set(known.x, known.y);
      n.sprite.alpha = 0.48;
      n.sprite.visible = true;
      label.position.set(known.x, known.y + known.radius + 4);
      label.alpha = 0.55;
      label.visible = true;

      const ownerCol = this.colorByOwner.get(known.owner);
      if (ownerCol) this.strokeRing(known.x, known.y, known.radius + 3, 2, hexToNumber(ownerCol), 0.35);
      if (known.hp < known.maxHp) this.drawHpBar(known.x, known.y - known.radius - 8, known);
      if (known.buildProgress !== undefined) {
        this.fillRect(known.x - known.radius, known.y + known.radius + 3, known.radius * 2 * known.buildProgress, 3, 0x7fe3ff, 0.45);
      }
    }

    for (const [id, n] of this.ghostNodes) {
      if (active.has(id)) continue;
      n.sprite.destroy();
      n.label?.destroy();
      this.ghostNodes.delete(id);
    }
  }

  private drawHpBar(x: number, y: number, e: Entity | KnownBuilding): void {
    const w = Math.max(16, e.radius * 2);
    const frac = Math.max(0, e.hp / e.maxHp);
    const col = frac > 0.5 ? 0x5dff8f : frac > 0.25 ? 0xffd166 : 0xff5d5d;
    this.fillRect(x - w / 2, y, w, 4, 0x000000, 0.6);
    if (frac > 0) this.fillRect(x - w / 2, y, w * frac, 4, col);
  }

  /** Isolated ring stroke — each ring is its own path to avoid connector lines on mobile GPUs. */
  private strokeRing(cx: number, cy: number, r: number, width: number, color: number, alpha: number, start = 0, end = Math.PI * 2): void {
    const full = start === 0 && end >= Math.PI * 2 - 0.001;
    if (full) {
      this.overlayStroke.circle(cx, cy, r).stroke({ width, color, alpha });
      return;
    }
    const sx = cx + Math.cos(start) * r;
    const sy = cy + Math.sin(start) * r;
    this.overlayStroke.moveTo(sx, sy).arc(cx, cy, r, start, end).stroke({ width, color, alpha });
  }

  private drawFog(state: GameState, player: Player, nav: NavGrid): void {
    const radarOn = radarActive(state, this.registry, player.id);
    for (let ty = 0; ty < nav.h; ty++) {
      for (let tx = 0; tx < nav.w; tx++) {
        const i = ty * nav.w + tx;
        if (!isTileFogged(player, i, radarOn)) continue;
        const x = tx * TILE;
        const y = ty * TILE;
        this.fogLayer.rect(x, y, TILE, TILE).fill({ color: 0xb8b8c8, alpha: 0.42 });
      }
    }
  }

  private fillRect(x: number, y: number, w: number, h: number, color: number, alpha = 1): void {
    this.overlayFill.rect(x, y, w, h).fill({ color, alpha });
  }

  private fillDot(cx: number, cy: number, r: number, color: number, alpha = 1): void {
    this.overlayFill.circle(cx, cy, r).fill({ color, alpha });
  }

  /** Pick a mana node at a world position (generous hit area for touch). */
  pickResourceNode(state: GameState, wx: number, wy: number): Entity | null {
    const nav = this.nav;
    let best: Entity | null = null;
    let bestD = Infinity;
    for (const e of state.entities.values()) {
      if (e.kind !== 'resource_node' || (e.amount ?? 0) <= 0) continue;
      if (nav && !isVisibleTo(state, this.humanOwner, e, nav)) continue;
      const dx = wx - e.pos.x;
      const dy = wy - e.pos.y;
      const r = e.radius + 14;
      const d2 = dx * dx + dy * dy;
      if (d2 <= r * r && d2 < bestD) {
        bestD = d2;
        best = e;
      }
    }
    return best;
  }

  /** Pick the topmost entity at a world position (units preferred over buildings). */
  pickEntity(state: GameState, wx: number, wy: number): Entity | null {
    const nav = this.nav;
    let best: Entity | null = null;
    let bestScore = -Infinity;
    for (const e of state.entities.values()) {
      if (e.kind === 'projectile') continue;
      if (nav && !isVisibleTo(state, this.humanOwner, e, nav)) continue;
      const dx = wx - e.pos.x;
      const dy = wy - e.pos.y;
      const r = e.radius + 6;
      if (dx * dx + dy * dy <= r * r) {
        const score = (e.kind === 'unit' ? 100 : e.kind === 'building' ? 50 : 10) - (dx * dx + dy * dy) / 1000;
        if (score > bestScore) {
          bestScore = score;
          best = e;
        }
      }
    }
    return best;
  }

  destroy(): void {
    for (const n of this.ghostNodes.values()) {
      n.sprite.destroy();
      n.label?.destroy();
    }
    this.ghostNodes.clear();
    this.app.destroy(true, { children: true });
  }

  // expose for texture generation reuse
  makeTexture(art: ArtDef, color: string): Texture {
    return this.provider.texture(art, color);
  }
}
