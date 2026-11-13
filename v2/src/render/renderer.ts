// Main renderer. Reads GameState and draws it. NEVER mutates the sim.
//
// Layering (bottom to top):
//   terrain (pre-rendered chunks) → ground decals (build zone, placement) → shadows
//   → entities (depth-sorted sprites) → selection rings → projectiles/VFX → fog → overlays
//
// Depth sorting: entities are sorted by their projected ground Y each frame into a flat array and
// assigned `zIndex` in one pass. That is O(n log n) on a small array of indices — far cheaper than
// v1's per-sprite container sort, and it keeps sprite batching intact because the sprites themselves
// never move between containers.

import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { TILE } from '../core/constants';
import {
  facingToDirection,
  FLYER_HOVER_LEVELS,
  projectGround,
  screenToWorld,
  VISUAL_HEIGHT_STEP,
} from '../core/projection';
import type { Vec2 } from '../core/math';
import type { GameState } from '../sim/types';
import { KIND_BUILDING, KIND_PROJECTILE, KIND_RESOURCE_NODE, KIND_UNIT, STATE_GARRISONED } from '../sim/entity-store';
import type { Registry } from '../data/registry';
import type { MapData } from '../data/defs';
import type { LoadedAtlas } from './atlas';
import { buildingFrameKey, unitFrameKey } from './atlas';
import { Camera } from './camera';
import { buildTerrain, type TerrainRender } from './terrain2';

/** Team colour ids in the same order as TEAM_RAMP in art/palette.ts. */
export const TEAM_IDS = ['blue', 'red', 'green', 'gold'] as const;
export type TeamId = (typeof TEAM_IDS)[number];

/** Map a hex colour from the sim to a baked team variant. Unknown colours fall back to blue. */
export function teamIdForColor(hex: string): TeamId {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  let best: TeamId = 'blue';
  let bestD = Infinity;
  for (const id of TEAM_IDS) {
    const c = TEAM_HEX[id];
    const d = (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2;
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
}

const TEAM_HEX: Record<TeamId, [number, number, number]> = {
  blue: [79, 157, 255],
  red: [255, 93, 93],
  green: [92, 255, 138],
  gold: [255, 209, 102],
};

interface RenderNode {
  sprite: Sprite;
  defId: string;
  kind: number;
  /** Display position, smoothed toward the sim position for 60 fps motion. */
  dispX: number;
  dispY: number;
  lastX: number;
  lastY: number;
  facing: number;
  team: TeamId;
  /** Frame key currently applied, so we only swap textures when it changes. */
  frameKey: string;
}

export interface RenderStats {
  /** CPU milliseconds to build the frame's display list and issue draw calls (pre-GPU-submit). */
  cpuMs: number;
  /** Sprites actually submitted (after culling). */
  drawn: number;
  total: number;
  /** Fog quads emitted this frame (a proxy for overlay geometry cost). */
  fogQuads: number;
}

export class Renderer {
  readonly app: Application;
  camera!: Camera;
  private terrain: TerrainRender | null = null;
  private world = new Container();
  private groundLayer = new Container();
  private shadowLayer = new Graphics();
  private entityLayer = new Container();
  private ringLayer = new Container();
  private overlayLayer = new Container();
  private fogLayer = new Graphics();
  private nodes = new Map<number, RenderNode>();
  private ringPool: Graphics[] = [];
  private atlas: LoadedAtlas | null = null;
  private viewerTeam: TeamId = 'blue';
  private stats: RenderStats = { cpuMs: 0, drawn: 0, total: 0, fogQuads: 0 };

  constructor(
    private registry: Registry,
    private map: MapData,
  ) {
    this.app = new Application();
  }

  async init(host: HTMLElement, atlas: LoadedAtlas): Promise<void> {
    await this.app.init({
      background: '#0d0b16',
      resizeTo: host,
      antialias: true,
      resolution: Math.min(2, window.devicePixelRatio || 1),
      autoDensity: true,
      preference: 'webgl',
    });
    host.appendChild(this.app.canvas);
    this.atlas = atlas;

    const worldW = this.map.tileW * TILE;
    const worldH = this.map.tileH * TILE;
    this.camera = new Camera(this.app.screen.width, this.app.screen.height, worldW, worldH);

    this.terrain = buildTerrain(this.map);
    this.groundLayer.addChild(this.terrain.container);
    this.groundLayer.addChild(this.shadowLayer);

    this.world.addChild(this.groundLayer, this.entityLayer, this.ringLayer, this.overlayLayer, this.fogLayer);
    // Depth: entities sort among themselves; layers are fixed.
    this.entityLayer.sortableChildren = true;
    this.ringLayer.sortableChildren = true;
    this.app.stage.addChild(this.world);

    this.app.renderer.on('resize', () => {
      this.camera.setViewport(this.app.screen.width, this.app.screen.height);
    });
  }

  get statsView(): RenderStats {
    return this.stats;
  }

  setViewer(team: TeamId): void {
    this.viewerTeam = team;
  }

  /** Called whenever the sim advances a tick: swap textures and record target positions. */
  sync(state: GameState): void {
    if (!this.atlas) return;
    const store = state.entities;
    const seen = new Set<number>();

    for (let slot = 0; slot < store.count; slot++) {
      if (store.dead[slot]) continue;
      const kind = store.kind[slot]!;
      const id = store.id[slot]!;
      seen.add(id);
      const ex = store.extras[slot]!;
      const defId = ex.defId;

      let node = this.nodes.get(id);
      const team = teamIdForColor(this.ownerColorOf(state, store.ownerIndex[slot]!));

      if (!node) {
        const { texture, key } = this.textureFor(defId, kind, team, store.facing[slot]!);
        if (!texture) continue;
        const sprite = new Sprite(texture);
        this.applyAnchor(sprite, key, this.spriteScale(defId, kind, key));
        this.entityLayer.addChild(sprite);
        node = {
          sprite,
          defId,
          kind,
          dispX: store.posX[slot]!,
          dispY: store.posY[slot]!,
          lastX: store.posX[slot]!,
          lastY: store.posY[slot]!,
          facing: store.facing[slot]!,
          team,
          frameKey: key,
        };
        this.nodes.set(id, node);
      } else {
        node.lastX = node.dispX;
        node.lastY = node.dispY;
        node.facing = store.facing[slot]!;
        node.defId = defId;
      }
      node.dispX = store.posX[slot]!;
      node.dispY = store.posY[slot]!;

      // Swap the texture only when the facing or team actually changed.
      const { texture, key } = this.textureFor(defId, kind, team, node.facing);
      if (key !== node.frameKey && texture) {
        node.sprite.texture = texture;
        this.applyAnchor(node.sprite, key, this.spriteScale(defId, kind, key));
        node.frameKey = key;
        node.team = team;
      }
    }

    for (const [id, node] of this.nodes) {
      if (seen.has(id)) continue;
      node.sprite.destroy();
      this.nodes.delete(id);
    }
  }

  private ownerColorOf(state: GameState, ownerIndex: number): string {
    const store = state.entities;
    const pid = store.ownerId(ownerIndex);
    const p = state.players.find((pl) => pl.id === pid);
    return p?.color ?? '#4f9dff';
  }

  /** Pick the frame texture for an entity, using the atlas. */
  private textureFor(
    defId: string,
    kind: number,
    team: TeamId,
    facing: number,
  ): { texture: Texture | undefined; key: string } {
    const atlas = this.atlas;
    if (!atlas) return { texture: undefined, key: '' };
    if (kind === KIND_UNIT || kind === KIND_PROJECTILE) {
      const dir = facingToDirection(facing);
      const key = unitFrameKey(defId, team, dir);
      return { texture: atlas.textures.get(key), key };
    }
    if (kind === KIND_BUILDING) {
      const key = buildingFrameKey(defId, team);
      return { texture: atlas.textures.get(key), key };
    }
    if (kind === KIND_RESOURCE_NODE) {
      const key = 'neutral/mana_node/blue/0';
      return { texture: atlas.textures.get(key), key };
    }
    return { texture: undefined, key: '' };
  }

  private applyAnchor(sprite: Sprite, key: string, scale = 1): void {
    const pivot = this.atlas?.pivots.get(key);
    if (pivot) sprite.anchor.set(pivot.x, pivot.y);
    else sprite.anchor.set(0.5, 0.75);
    sprite.scale.set(scale);
  }

  /**
   * Scale factor that makes a baked frame draw at the entity's real world size.
   *
   * The atlas authors every sprite into a fixed pixel frame (`art.size` in world units is NOT the
   * frame size), so drawing at native resolution produced buildings ~2.7x too large — the Sanctum
   * sprite overlapped the Wisps standing next to it. The projection is 1 world unit ≈ 1 projected
   * pixel at zoom 1, so the correct factor is `art.size / framePx`, where `framePx` is the pixel
   * width the sprite occupies in its frame.
   */
  private spriteScale(defId: string, kind: number, frameKey: string): number {
    const frame = this.atlas?.frames.get(frameKey);
    if (!frame) return 1;
    if (kind === KIND_BUILDING) {
      const def = this.registry.buildings.get(defId);
      if (!def) return 1;
      const worldW = def.footprint * 32 * 0.5 + def.footprint * 32 * 0.5;
      return worldW / frame.w;
    }
    const def = this.registry.units.get(defId);
    if (!def) return 1;
    /**
     * UNIT VISUAL SCALE — the readability lever.
     *
     * Collision radius is tuned for gameplay (an Imp is 8 units so 90 fit in a fight) and is far too
     * small to draw. At default zoom on a 667x375 phone a unit drawn at its collision size is ~13
     * screen pixels, which is unreadable. Drawing at 2.6x the collision diameter gives ~34 world
     * units -> ~28 screen px, which is identifiable. Hit boxes are unchanged, so gameplay is
     * identical; only the sprite is larger. This is the standard RTS "visual size != collision size"
     * trick.
     */
    const visualWorld = def.radius * 2 * 2.6;
    return visualWorld / frame.w;
  }

  /** Render one frame with interpolation factor `alpha` (0..1 between ticks). */
  render(state: GameState, alpha: number, selected: Set<number>): void {
    if (!this.camera || !this.atlas) return;
    const t0 = performance.now();

    // Camera transform. `CameraView.x/y` is the world coordinate that maps to the viewport's
    // TOP-LEFT, so the projected camera point must land at screen (0,0).
    const cam = this.camera.view();
    const camProj = projectGround({ x: cam.x, y: cam.y });
    this.world.scale.set(cam.zoom);
    this.world.position.set(-camProj.x * cam.zoom, -camProj.y * cam.zoom);

    const view = this.camera.visibleWorldRect();

    // ---- entities
    let drawn = 0;
    let total = 0;
    const order: { node: RenderNode; depth: number }[] = [];
    for (const [id, node] of this.nodes) {
      total++;
      // Interpolate between the previous and current tick positions so motion is smooth at 60 fps
      // even though the sim runs at 20 Hz.
      const x = node.lastX + (node.dispX - node.lastX) * alpha;
      const y = node.lastY + (node.dispY - node.lastY) * alpha;
      // Cull to the visible rect with a generous margin for tall sprites.
      if (x < view.minX - 200 || x > view.maxX + 200 || y < view.minY - 400 || y > view.maxY + 200) {
        node.sprite.visible = false;
        continue;
      }
      drawn++;
      node.sprite.visible = true;

      const level = heightLevelAt(this.map, x, y);
      const isFlying = node.kind === KIND_UNIT && isFlyer(this.registry, node.defId);
      const hover = isFlying ? FLYER_HOVER_LEVELS : 0;
      const bob = isFlying ? Math.sin((state.tick + id * 7) * 0.08) * 1.2 : 0;

      const p = projectGround({ x, y }, level + hover);
      node.sprite.position.set(p.x, p.y + bob);
      const depth = p.y + (isFlying ? 1000 : 0);
      order.push({ node, depth });

      if (selected.has(id)) {
        this.ensureRing(id, p.x, p.y, cam.zoom);
      } else {
        this.hideRing(id);
      }
    }
    order.sort((a, b) => a.depth - b.depth);
    for (let i = 0; i < order.length; i++) order[i]!.node.sprite.zIndex = i;

    // ---- shadows are a single Graphics redrawn each frame (cheap: one ellipse per visible unit)
    // All unit shadows go into a single fill call: one Graphics rebuild plus one draw, instead of a
    // fill per unit.
    this.shadowLayer.clear();
    let anyShadow = false;
    for (const { node } of order) {
      if (node.kind !== KIND_UNIT) continue;
      const level = heightLevelAt(this.map, node.dispX, node.dispY);
      const p = projectGround({ x: node.dispX, y: node.dispY }, level);
      this.shadowLayer.ellipse(p.x, p.y, 7, 3.2);
      anyShadow = true;
    }
    if (anyShadow) this.shadowLayer.fill({ color: 0x05040a, alpha: 0.34 });

    // ---- fog
    this.drawFog(state);

    this.stats = { cpuMs: performance.now() - t0, drawn, total, fogQuads: this.lastFogQuads };
  }

  private lastFogQuads = 0;

  /** Reusable selection rings, one per selected entity. */
  private ensureRing(id: number, x: number, y: number, zoom: number): void {
    let ring: Graphics | undefined = this.ringPool.find(
      (r) => (r as unknown as { _id?: number })._id === id,
    );
    if (!ring) {
      ring = this.ringPool.find((r) => (r as unknown as { _id?: number })._id === undefined);
      if (!ring) {
        ring = new Graphics();
        this.ringLayer.addChild(ring);
        this.ringPool.push(ring);
      }
      (ring as unknown as { _id?: number })._id = id;
      ring.clear();
      ring.ellipse(0, 0, 11 / zoom, 5.5 / zoom).stroke({ width: 1.6 / zoom, color: 0x8ef7c6, alpha: 0.95 });
    }
    ring.position.set(x, y);
    ring.visible = true;
  }

  private hideRing(id: number): void {
    for (const ring of this.ringPool) {
      if ((ring as unknown as { _id?: number })._id === id) {
        (ring as unknown as { _id?: number })._id = undefined;
        ring.visible = false;
      }
    }
  }

  /**
   * Fog of war: darken tiles the viewer cannot see. Drawn as a single Graphics with one quad per
   * fogged visible tile, which is cheap because most of the map is off-screen anyway.
   */
  private drawFog(state: GameState): void {
    this.fogLayer.clear();
    this.lastFogQuads = 0;
    const viewer = state.players.find((p) => teamIdForColor(p.color) === this.viewerTeam);
    if (!viewer || state.ended) return;
    const view = this.camera.visibleWorldRect();
    const minTx = Math.max(0, Math.floor(view.minX / TILE) - 1);
    const maxTx = Math.min(this.map.tileW - 1, Math.ceil(view.maxX / TILE) + 1);
    const minTy = Math.max(0, Math.floor(view.minY / TILE) - 1);
    const maxTy = Math.min(this.map.tileH - 1, Math.ceil(view.maxY / TILE) + 1);

    // Coarse fog: one quad per 2x2-tile block, only where ALL four tiles are dark. That is half the
    // geometry of per-tile fog and reads identically at play zoom; isolated lit tiles keep their
    // precise edge because they are skipped rather than merged.
    const BLOCK = 2;
    for (let ty = minTy; ty <= maxTy; ty += BLOCK) {
      for (let tx = minTx; tx <= maxTx; tx += BLOCK) {
        let allDark = true;
        let level = 0;
        for (let dy = 0; dy < BLOCK && allDark; dy++) {
          for (let dx = 0; dx < BLOCK; dx++) {
            const x = tx + dx;
            const y = ty + dy;
            if (x >= this.map.tileW || y >= this.map.tileH) continue;
            const i = y * this.map.tileW + x;
            if (viewer.visible[i] === 1) {
              allDark = false;
              break;
            }
            level = Math.max(level, this.map.heights[i] ?? 0);
          }
        }
        if (!allDark) continue;
        const g = this.tileQuad(tx, ty, level, BLOCK);
        this.fogLayer.poly(g.flatMap((p) => [p.x, p.y]));
        this.fogLayer.fill({ color: 0x08060f, alpha: 0.52 });
        this.lastFogQuads++;
      }
    }
  }

  private tileQuad(tx: number, ty: number, level: number, size = 1): { x: number; y: number }[] {
    const p = (wx: number, wy: number) => {
      const q = projectGround({ x: wx, y: wy });
      return { x: q.x, y: q.y - level * VISUAL_HEIGHT_STEP };
    };
    return [
      p(tx * TILE, ty * TILE),
      p((tx + size) * TILE, ty * TILE),
      p((tx + size) * TILE, (ty + size) * TILE),
      p(tx * TILE, (ty + size) * TILE),
    ];
  }

  /** World position of a screen point (for picking and HUD anchoring). */
  screenToWorld(screen: Vec2): Vec2 {
    return screenToWorld(screen, this.camera.view());
  }

  destroy(): void {
    this.terrain?.destroy();
    for (const node of this.nodes.values()) node.sprite.destroy();
    this.nodes.clear();
    this.app.destroy(true, { children: true });
  }
}

function heightLevelAt(map: MapData, x: number, y: number): number {
  const tx = Math.floor(x / TILE);
  const ty = Math.floor(y / TILE);
  if (tx < 0 || ty < 0 || tx >= map.tileW || ty >= map.tileH) return 0;
  return map.heights[ty * map.tileW + tx] ?? 0;
}

function isFlyer(registry: Registry, defId: string): boolean {
  return registry.units.get(defId)?.mobility === 'air';
}

export { STATE_GARRISONED };
