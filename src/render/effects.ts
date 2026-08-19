// View-only transient effects (hit flashes, death puffs, spell rings, mana sparkles).
// Pooled Graphics to avoid GC churn. Driven by GameEvents; never affects the sim.
import { Container, Graphics } from 'pixi.js';
import { OBLIQUE_SCALE_X, OBLIQUE_SCALE_Y } from '../core/projection';

export type EffectKind = 'flash' | 'puff' | 'ring' | 'spark' | 'shockwave' | 'strike';

export interface EffectSpawnOpts {
  /** World-space facing in radians (0 = east). Used by strike / directional sparks. */
  angle?: number;
}

interface Effect {
  g: Graphics;
  age: number;
  life: number;
  x: number;
  y: number;
  kind: EffectKind;
  color: number;
  radius: number;
  angle: number;
}

export type EffectPositionFn = (worldX: number, worldY: number) => { x: number; y: number };

/** Dimetric screen vector for a world-facing angle (matches projectGround of a unit vector). */
export function worldFacingToScreen(angle: number): { x: number; y: number } {
  const wx = Math.cos(angle);
  const wy = Math.sin(angle);
  const x = (wx - wy) * OBLIQUE_SCALE_X;
  const y = (wx + wy) * OBLIQUE_SCALE_Y;
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len };
}

export class EffectsLayer {
  readonly container = new Container();
  private active: Effect[] = [];
  private pool: Graphics[] = [];
  private positionFn: EffectPositionFn = (x, y) => ({ x, y });
  private maxActive = 400;

  setPositionFn(fn: EffectPositionFn): void {
    this.positionFn = fn;
  }

  setMaxActive(n: number): void {
    this.maxActive = Math.max(8, n);
  }

  get activeCount(): number {
    return this.active.length;
  }

  private take(): Graphics {
    const g = this.pool.pop() ?? new Graphics();
    this.container.addChild(g);
    g.visible = true;
    return g;
  }

  private release(g: Graphics): void {
    g.clear();
    g.visible = false;
    this.container.removeChild(g);
    this.pool.push(g);
  }

  reset(): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      this.release(this.active[i]!.g);
    }
    this.active = [];
  }

  spawn(kind: EffectKind, x: number, y: number, color: number, radius: number, opts?: EffectSpawnOpts): void {
    if (this.active.length > this.maxActive) return;
    const life =
      kind === 'ring' ? 30
        : kind === 'shockwave' ? 24
          : kind === 'strike' ? 12
            : kind === 'puff' ? 18
              : 10;
    this.active.push({
      g: this.take(),
      age: 0,
      life,
      x,
      y,
      kind,
      color,
      radius,
      angle: opts?.angle ?? 0,
    });
  }

  update(): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const e = this.active[i]!;
      e.age++;
      const t = e.age / e.life;
      const g = e.g;
      g.clear();
      const alpha = 1 - t;
      const pos = this.positionFn(e.x, e.y);
      if (e.kind === 'flash') {
        g.circle(pos.x, pos.y, e.radius * (0.6 + t)).fill({ color: e.color, alpha });
      } else if (e.kind === 'puff') {
        g.circle(pos.x, pos.y, e.radius * (0.5 + t * 1.2)).stroke({ width: 2, color: e.color, alpha });
      } else if (e.kind === 'ring') {
        g.circle(pos.x, pos.y, e.radius * (0.3 + t)).stroke({ width: 3, color: e.color, alpha });
      } else if (e.kind === 'shockwave') {
        // Ground-hugging ellipse so slams sit on the dimetric plane, not as floating circles.
        const r = e.radius * (0.2 + t * 0.95);
        g.ellipse(pos.x, pos.y, r, r * 0.45).stroke({ width: 4 - t * 2, color: e.color, alpha: alpha * 0.85 });
      } else if (e.kind === 'strike') {
        const dir = worldFacingToScreen(e.angle);
        const len = e.radius * (0.85 + t * 0.35);
        const nx = -dir.y;
        const ny = dir.x;
        g.moveTo(pos.x - dir.x * len, pos.y - dir.y * len)
          .lineTo(pos.x + dir.x * len * 0.25, pos.y + dir.y * len * 0.25)
          .stroke({ width: 3.2 - t * 1.6, color: e.color, alpha: alpha * 0.95 });
        g.moveTo(pos.x - nx * e.radius * 0.22, pos.y - ny * e.radius * 0.22)
          .lineTo(pos.x + nx * e.radius * 0.22, pos.y + ny * e.radius * 0.22)
          .stroke({ width: 1.6, color: 0xffffff, alpha: alpha * 0.7 });
        g.circle(pos.x, pos.y, e.radius * (0.18 + t * 0.12)).fill({ color: 0xffffff, alpha: alpha * 0.55 });
      } else {
        g.circle(pos.x, pos.y - t * 20, e.radius * (1 - t)).fill({ color: e.color, alpha });
      }
      if (e.age >= e.life) {
        this.release(g);
        this.active.splice(i, 1);
      }
    }
  }
}
