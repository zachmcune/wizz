// PixiJS renderer. Reads interpolated sim state and draws it. NEVER mutates the sim.
import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { TILE } from '../core/constants';
import { lerp } from '../sim/math';
import type { GameState, Entity, EntityId, PlayerId } from '../sim/types';
import type { Registry } from '../data/registry';
import type { MapData, ArtDef } from '../data/defs';
import { Camera } from './camera';
import { ShapeSpriteProvider, type SpriteProvider } from './shape-sprite';
import { EffectsLayer } from './effects';

const NODE_ART: ArtDef = { shape: 'hexagon', size: 40, accent: '#0b3b3b' };
const NEUTRAL_COLOR = '#39d0c0';

export interface RenderOverlay {
  ghost?: { x: number; y: number; size: number; valid: boolean };
  spell?: { x: number; y: number; radius: number };
  confirm?: { x: number; y: number } | null;
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
  private entityLayer = new Container();
  private labelLayer = new Container();
  private overlayLayer = new Container();
  effects = new EffectsLayer();
  private nodes = new Map<EntityId, RenderNode>();
  private overlay = new Graphics();
  private colorByOwner = new Map<PlayerId, string>();
  private humanOwner: PlayerId = '';

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

    this.world.addChild(this.terrainLayer, this.entityLayer, this.labelLayer, this.effects.container, this.overlayLayer);
    this.overlayLayer.addChild(this.overlay);
    this.app.stage.addChild(this.world);

    const worldW = this.map.tileW * TILE;
    const worldH = this.map.tileH * TILE;
    this.camera = new Camera(this.app.screen.width, this.app.screen.height, worldW, worldH);
    this.buildTerrain();

    this.app.renderer.on('resize', () => this.camera.setViewport(this.app.screen.width, this.app.screen.height));
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
      return { art: b.art, color: b.art.accent };
    }
    if (e.kind === 'projectile') {
      const a = this.registry.projectile(e.defId).art;
      return { art: a, color: a.accent };
    }
    return { art: NODE_ART, color: NEUTRAL_COLOR };
  }

  private ensureBuildingLabel(n: RenderNode, e: Entity): void {
    if (e.kind !== 'building') {
      if (n.label) {
        n.label.destroy();
        n.label = undefined;
      }
      return;
    }
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

    this.overlay.clear();
    for (const [id, n] of this.nodes) {
      const e = state.entities.get(id);
      if (!e) continue;
      const x = lerp(n.prevX, n.curX, alpha);
      const y = lerp(n.prevY, n.curY, alpha);
      n.sprite.position.set(x, y);
      if (e.kind === 'unit' || e.kind === 'projectile') n.sprite.rotation = n.facing + Math.PI / 2;

      if (n.label) {
        n.label.position.set(x, y + e.radius + 4);
        n.label.alpha = e.owner === this.humanOwner ? 1 : 0.75;
      }

      // colored ring for buildings
      if (e.kind === 'building') {
        const accent = this.registry.building(e.defId).art.accent;
        const ring = Number.parseInt(accent.slice(1), 16);
        this.overlay.circle(x, y, e.radius + 3).stroke({ width: 2, color: ring, alpha: 0.85 });
      }

      // selection ring
      if (selected.has(id)) {
        this.overlay.circle(x, y, e.radius + 6).stroke({ width: 2, color: 0xffffff, alpha: 0.9 });
      }
      // hp bar for damaged combatants + selected
      if ((e.kind === 'unit' || e.kind === 'building') && (e.hp < e.maxHp || selected.has(id))) {
        this.drawHpBar(x, y - e.radius - 8, e);
      }
      // construction shimmer
      if (e.buildProgress !== undefined) {
        this.overlay.rect(x - e.radius, y + e.radius + 3, e.radius * 2 * e.buildProgress, 3).fill(0x7fe3ff);
      }
      // carry indicator for wisps
      if (e.carry !== undefined && e.carry > 0) {
        this.overlay.circle(x, y - e.radius - 4, 3).fill(0x7fe3ff);
      }
    }

    if (overlay?.ghost) {
      const gh = overlay.ghost;
      const col = gh.valid ? 0x5dff8f : 0xff5d5d;
      this.overlay.rect(gh.x - gh.size / 2, gh.y - gh.size / 2, gh.size, gh.size).fill({ color: col, alpha: 0.28 }).stroke({ width: 2, color: col });
    }
    if (overlay?.spell) {
      this.overlay.circle(overlay.spell.x, overlay.spell.y, overlay.spell.radius).stroke({ width: 2, color: 0xffd166, alpha: 0.9 });
    }
    if (overlay?.confirm) {
      this.overlay.circle(overlay.confirm.x, overlay.confirm.y, 12).stroke({ width: 3, color: 0xffd166 });
    }
    this.effects.update();
  }

  private drawHpBar(x: number, y: number, e: Entity): void {
    const w = Math.max(16, e.radius * 2);
    const frac = Math.max(0, e.hp / e.maxHp);
    const col = frac > 0.5 ? 0x5dff8f : frac > 0.25 ? 0xffd166 : 0xff5d5d;
    this.overlay.rect(x - w / 2, y, w, 4).fill({ color: 0x000000, alpha: 0.6 });
    this.overlay.rect(x - w / 2, y, w * frac, 4).fill(col);
  }

  /** Pick the topmost entity at a world position (units preferred over buildings). */
  pickEntity(state: GameState, wx: number, wy: number): Entity | null {
    let best: Entity | null = null;
    let bestScore = -Infinity;
    for (const e of state.entities.values()) {
      if (e.kind === 'projectile') continue;
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
    this.app.destroy(true, { children: true });
  }

  // expose for texture generation reuse
  makeTexture(art: ArtDef, color: string): Texture {
    return this.provider.texture(art, color);
  }
}
