// Minimap: a small 2D-canvas overview. Tap/drag to move the camera. Draws terrain, entities,
// and the current viewport rectangle. Independent of the Pixi renderer for simplicity.
import { TILE } from '../core/constants';
import type { GameState, PlayerId } from '../sim/types';
import type { MapData } from '../data/defs';
import type { Camera } from '../render/camera';
import { getPlayer } from '../sim/queries';
import { isVisibleTo } from '../sim/fog';
import type { NavGrid } from '../sim/nav-grid';

export class Minimap {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private worldW: number;
  private worldH: number;
  private scale: number;

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

    const jump = (ev: PointerEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      const cx = ((ev.clientX - rect.left) / rect.width) * this.canvas.width;
      const cy = ((ev.clientY - rect.top) / rect.height) * this.canvas.height;
      this.camera.centerOn(cx / this.scale, cy / this.scale);
    };
    this.canvas.addEventListener('pointerdown', (e) => {
      this.canvas.setPointerCapture(e.pointerId);
      jump(e);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (e.buttons) jump(e);
    });
  }

  render(state: GameState, viewerId: PlayerId, nav: NavGrid): void {
    const c = this.ctx;
    const s = this.scale;
    const viewer = getPlayer(state, viewerId);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.fillStyle = '#000000';
    c.fillRect(0, 0, this.worldW * s, this.worldH * s);

    if (!viewer) return;

    for (let ty = 0; ty < this.map.tileH; ty++) {
      for (let tx = 0; tx < this.map.tileW; tx++) {
        const i = ty * this.map.tileW + tx;
        if (!viewer.hasRadar && viewer.explored[i] === 0) continue;
        const blocked = this.map.tiles[i] === 1;
        c.fillStyle = blocked ? '#2a2540' : '#1a1826';
        c.fillRect(tx * TILE * s, ty * TILE * s, TILE * s + 1, TILE * s + 1);
        if (viewer.explored[i] === 1 && viewer.visible[i] === 0) {
          c.fillStyle = 'rgba(0, 0, 0, 0.55)';
          c.fillRect(tx * TILE * s, ty * TILE * s, TILE * s + 1, TILE * s + 1);
        }
      }
    }

    for (const e of state.entities.values()) {
      if (e.kind === 'projectile') continue;
      if (!isVisibleTo(state, viewerId, e, nav)) continue;
      if (e.kind === 'resource_node') {
        const max = e.amountMax ?? e.amount ?? 1;
        const frac = Math.max(0, (e.amount ?? 0) / max);
        const g = Math.round(160 + 57 * frac);
        c.fillStyle = frac <= 0 ? '#444455' : `rgb(57, ${g}, 192)`;
      } else c.fillStyle = this.colorByOwner.get(e.owner) ?? '#ffffff';
      const size = e.kind === 'building' ? 4 : e.kind === 'resource_node' ? 3 : 2;
      c.fillRect(e.pos.x * s - size / 2, e.pos.y * s - size / 2, size, size);
    }

    const v = this.camera.visibleWorldRect();
    c.strokeStyle = '#ffffff';
    c.lineWidth = 1;
    c.strokeRect(v.x * s, v.y * s, v.w * s, v.h * s);
  }
}
