// Lobby map preview: numbered spawn markers on a simplified terrain canvas.
import { TILE } from '../core/constants';
import type { MapData } from '../data/defs';
import type { LobbySlot } from '../lobby/types';

export interface SpawnAssignment {
  index: number;
  color: string;
  label: string;
}

export class LobbyMapPreview {
  readonly root = document.createElement('div');
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private scale = 1;
  private worldW = 0;
  private worldH = 0;
  private onPick: ((index: number) => void) | null = null;
  private spawnCount = 0;
  private assignments: SpawnAssignment[] = [];

  constructor(private map: MapData, size = 280) {
    this.root.className = 'lobby-map-preview';
    const title = document.createElement('p');
    title.className = 'lobby-map-title';
    title.textContent = map.name;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'lobby-map-canvas';
    this.canvas.width = size;
    this.canvas.height = size;
    this.ctx = this.canvas.getContext('2d')!;
    this.worldW = map.tileW * TILE;
    this.worldH = map.tileH * TILE;
    this.scale = size / Math.max(this.worldW, this.worldH);
    this.spawnCount = map.startLocations.length;
    this.root.append(title, this.canvas);
    this.canvas.addEventListener('pointerdown', (e) => this.handlePick(e));
  }

  setMap(map: MapData): void {
    this.map = map;
    this.worldW = map.tileW * TILE;
    this.worldH = map.tileH * TILE;
    this.scale = this.canvas.width / Math.max(this.worldW, this.worldH);
    this.spawnCount = map.startLocations.length;
    const title = this.root.querySelector('.lobby-map-title');
    if (title) title.textContent = map.name;
    this.render();
  }

  setAssignments(slots: LobbySlot[]): void {
    this.assignments = [];
    for (const slot of slots) {
      if (slot.kind === 'closed' || slot.startIndex === null) continue;
      this.assignments.push({
        index: slot.startIndex,
        color: slot.color,
        label: slot.id.replace('player', 'P'),
      });
    }
    this.render();
  }

  onPositionPick(cb: (index: number) => void): void {
    this.onPick = cb;
  }

  private handlePick(ev: PointerEvent): void {
    if (!this.onPick) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * this.canvas.width;
    const y = ((ev.clientY - rect.top) / rect.height) * this.canvas.height;
    const worldX = x / this.scale;
    const worldY = y / this.scale;

    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < this.spawnCount; i++) {
      const loc = this.map.startLocations[i]!;
      const dx = loc.x - worldX;
      const dy = loc.y - worldY;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    if (best >= 0 && bestDist < (TILE * 4) ** 2) this.onPick(best);
  }

  render(): void {
    const c = this.ctx;
    const s = this.scale;
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (let ty = 0; ty < this.map.tileH; ty++) {
      for (let tx = 0; tx < this.map.tileW; tx++) {
        const i = ty * this.map.tileW + tx;
        const blocked = this.map.tiles[i] === 1;
        c.fillStyle = blocked ? '#1a1528' : '#243018';
        c.fillRect(tx * TILE * s, ty * TILE * s, TILE * s + 0.5, TILE * s + 0.5);
      }
    }

    for (let i = 0; i < this.spawnCount; i++) {
      const loc = this.map.startLocations[i]!;
      const x = loc.x * s;
      const y = loc.y * s;
      const assigned = this.assignments.find((a) => a.index === i);

      c.beginPath();
      c.arc(x, y, 14, 0, Math.PI * 2);
      c.fillStyle = assigned ? assigned.color : 'rgba(139, 108, 255, 0.35)';
      c.fill();
      c.strokeStyle = assigned ? '#fff' : 'rgba(200, 190, 255, 0.8)';
      c.lineWidth = 2;
      c.stroke();

      c.fillStyle = '#fff';
      c.font = 'bold 13px system-ui, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(String(i + 1), x, y);
    }

    c.fillStyle = 'rgba(232, 228, 246, 0.55)';
    c.font = '10px system-ui, sans-serif';
    c.textAlign = 'left';
    c.textBaseline = 'bottom';
    c.fillText(`${this.spawnCount} starting positions`, 6, this.canvas.height - 6);
  }
}
