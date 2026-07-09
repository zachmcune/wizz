// View-only transient effects (hit flashes, death puffs, spell rings, mana sparkles).
// Pooled Graphics to avoid GC churn. Driven by GameEvents; never affects the sim.
import { Container, Graphics } from 'pixi.js';

interface Effect {
  g: Graphics;
  age: number;
  life: number;
  x: number;
  y: number;
  kind: 'flash' | 'puff' | 'ring' | 'spark' | 'shockwave' | 'strike';
  color: number;
  radius: number;
}

export type EffectPositionFn = (worldX: number, worldY: number) => { x: number; y: number };

export class EffectsLayer {
  readonly container = new Container();
  private active: Effect[] = [];
  private pool: Graphics[] = [];
  private positionFn: EffectPositionFn = (x, y) => ({ x, y });

  setPositionFn(fn: EffectPositionFn): void {
    this.positionFn = fn;
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

  spawn(kind: Effect['kind'], x: number, y: number, color: number, radius: number): void {
    if (this.active.length > 400) return;
    const life =
      kind === 'ring' ? 30
        : kind === 'shockwave' ? 24
          : kind === 'strike' ? 16
            : kind === 'puff' ? 18
              : 10;
    this.active.push({ g: this.take(), age: 0, life, x, y, kind, color, radius });
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
        g.circle(pos.x, pos.y, e.radius * (0.2 + t * 0.95)).stroke({ width: 4 - t * 2, color: e.color, alpha: alpha * 0.85 });
      } else if (e.kind === 'strike') {
        g.rect(pos.x - e.radius * 0.08, pos.y - e.radius * (0.5 + t * 0.3), e.radius * 0.16, e.radius * (1 - t * 0.4))
          .fill({ color: e.color, alpha: alpha * 0.7 });
        g.circle(pos.x, pos.y, e.radius * (0.25 + t * 0.15)).fill({ color: 0xffffff, alpha: alpha * 0.5 });
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
