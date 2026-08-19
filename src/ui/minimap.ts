// Minimap: a small canvas overview. Requires a powered Scrying Obelisk (radar) to use.
// Tap/drag to move the camera. Independent of the Pixi renderer for simplicity.
import { TILE } from '../core/constants';
import { FOG_FILL_ALPHA, FOG_FILL_COLOR } from '../render/fog-draw';
import type { GameState, Player, PlayerId } from '../sim/types';
import type { MapData } from '../data/defs';
import type { Camera } from '../render/camera';
import type { Registry } from '../data/registry';
import { getPlayer, radarActive, isMinimapTileFogged, isVisibleOnMinimap, isNodeIntelVisible, listBuildingGhosts } from '../sim/views';
import type { NavGrid } from '../sim/nav-grid';

export class Minimap {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private worldW: number;
  private worldH: number;
  private scale: number;
  private enabled = false;
  private terrainFog: HTMLCanvasElement;
  private terrainFogCtx: CanvasRenderingContext2D;
  private terrainKey = '';

  constructor(
    private map: MapData,
    private camera: Camera,
    private colorByOwner: Map<string, string>,
    size = 176,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = size;
    this.canvas.height = size;
    this.canvas.className = 'minimap-canvas';
    this.ctx = this.canvas.getContext('2d')!;
    this.worldW = map.tileW * TILE;
    this.worldH = map.tileH * TILE;
    this.scale = size / Math.max(this.worldW, this.worldH);
    this.terrainFog = document.createElement('canvas');
    this.terrainFog.width = size;
    this.terrainFog.height = size;
    this.terrainFogCtx = this.terrainFog.getContext('2d')!;

    const jump = (ev: PointerEvent) => {
      if (!this.enabled) return;
      const rect = this.canvas.getBoundingClientRect();
      const cx = ((ev.clientX - rect.left) / rect.width) * this.canvas.width;
      const cy = ((ev.clientY - rect.top) / rect.height) * this.canvas.height;
      this.camera.centerOn(cx / this.scale, cy / this.scale);
    };
    this.canvas.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      this.canvas.setPointerCapture(e.pointerId);
      jump(e);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.enabled || !e.buttons) return;
      jump(e);
    });
  }

  render(state: GameState, viewerId: PlayerId, nav: NavGrid, registry: Registry, revealAll = false): void {
    const c = this.ctx;
    const s = this.scale;
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const viewer = getPlayer(state, viewerId);
    if (!viewer) return;

    const radarOn = revealAll || radarActive(state, registry, viewerId);
    this.enabled = radarOn;
    this.canvas.classList.toggle('minimap-disabled', !radarOn);

    if (!radarOn) {
      c.fillStyle = '#12101c';
      c.fillRect(0, 0, this.canvas.width, this.canvas.height);
      return;
    }

    this.syncTerrainFog(viewer, radarOn, revealAll);
    c.drawImage(this.terrainFog, 0, 0);

    for (const e of state.entities.values()) {
      if (!revealAll && !isVisibleOnMinimap(state, registry, viewerId, e, nav)) continue;
      if (e.kind === 'resource_node') {
        const intel = revealAll || isNodeIntelVisible(state, viewerId, e, nav);
        if (!intel) {
          c.fillStyle = '#39d0c0';
        } else {
          const max = e.amountMax ?? e.amount ?? 1;
          const frac = Math.max(0, (e.amount ?? 0) / max);
          const g = Math.round(160 + 57 * frac);
          c.fillStyle = frac <= 0 ? '#444455' : `rgb(57, ${g}, 192)`;
        }
      } else c.fillStyle = this.colorByOwner.get(e.owner) ?? '#ffffff';
      const size = e.kind === 'building' ? 4 : e.kind === 'resource_node' ? 3 : 2;
      c.fillRect(e.pos.x * s - size / 2, e.pos.y * s - size / 2, size, size);
    }

    if (!revealAll) {
      for (const known of listBuildingGhosts(state, registry, viewerId, nav)) {
        c.fillStyle = 'rgba(140, 140, 155, 0.75)';
        c.fillRect(known.x * s - 2, known.y * s - 2, 4, 4);
      }
    }

    const v = this.camera.visibleWorldRect();
    c.strokeStyle = '#ffffff';
    c.lineWidth = 1;
    c.strokeRect(v.x * s, v.y * s, v.w * s, v.h * s);
  }

  private syncTerrainFog(viewer: Player, radarOn: boolean, revealAll: boolean): void {
    let hash = viewer.visible.length | 0;
    for (let i = 0; i < viewer.visible.length; i++) {
      hash = (Math.imul(hash, 33) + (viewer.visible[i] ?? 0)) | 0;
    }
    const key = `${hash}:${radarOn ? 1 : 0}:${revealAll ? 1 : 0}`;
    if (key === this.terrainKey) return;
    this.terrainKey = key;

    const c = this.terrainFogCtx;
    const s = this.scale;
    const fogR = (FOG_FILL_COLOR >> 16) & 0xff;
    const fogG = (FOG_FILL_COLOR >> 8) & 0xff;
    const fogB = FOG_FILL_COLOR & 0xff;
    const fogFill = `rgba(${fogR}, ${fogG}, ${fogB}, ${FOG_FILL_ALPHA})`;
    c.clearRect(0, 0, this.terrainFog.width, this.terrainFog.height);
    for (let ty = 0; ty < this.map.tileH; ty++) {
      for (let tx = 0; tx < this.map.tileW; tx++) {
        const i = ty * this.map.tileW + tx;
        const blocked = this.map.tiles[i] === 1;
        c.fillStyle = blocked ? '#2a2540' : '#1a1826';
        c.fillRect(tx * TILE * s, ty * TILE * s, TILE * s + 1, TILE * s + 1);
        if (isMinimapTileFogged(viewer, i, radarOn) && !revealAll) {
          c.fillStyle = fogFill;
          c.fillRect(tx * TILE * s, ty * TILE * s, TILE * s + 1, TILE * s + 1);
        }
      }
    }
  }
}
