// Uniform-grid spatial hash for O(1) neighbor queries (avoidance + target acquisition).
// Rebuilt each tick from entity positions. Not serialized.
import type { Entity, EntityId } from './types';

const CELL = 48; // world units per bucket

export class SpatialHash {
  private cells = new Map<number, EntityId[]>();

  private key(cx: number, cy: number): number {
    // pack two 16-bit signed-ish cell coords into one number
    return (cx + 32768) * 65536 + (cy + 32768);
  }

  clear(): void {
    this.cells.clear();
  }

  insert(e: Entity): void {
    const cx = Math.floor(e.pos.x / CELL);
    const cy = Math.floor(e.pos.y / CELL);
    const k = this.key(cx, cy);
    let arr = this.cells.get(k);
    if (!arr) {
      arr = [];
      this.cells.set(k, arr);
    }
    arr.push(e.id);
  }

  rebuild(entities: Map<EntityId, Entity>): void {
    this.clear();
    // deterministic insertion order (ascending id)
    const ids = [...entities.keys()].sort((a, b) => a - b);
    for (const id of ids) {
      const e = entities.get(id)!;
      if (e.kind === 'projectile') continue;
      if (e.kind === 'unit' && e.garrisonedIn !== undefined) continue;
      this.insert(e);
    }
  }

  /** Collect entity ids within `radius` world units of (x,y). */
  queryRadius(x: number, y: number, radius: number, out: EntityId[]): EntityId[] {
    out.length = 0;
    const minCx = Math.floor((x - radius) / CELL);
    const maxCx = Math.floor((x + radius) / CELL);
    const minCy = Math.floor((y - radius) / CELL);
    const maxCy = Math.floor((y + radius) / CELL);
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const arr = this.cells.get(this.key(cx, cy));
        if (arr) out.push(...arr);
      }
    }
    return out;
  }
}
