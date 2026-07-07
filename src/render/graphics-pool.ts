// Reusable Graphics pool — one primitive per Graphics object avoids Android WebGL
// stitching unrelated subpaths with connector lines through (0,0).
import { Container, Graphics } from 'pixi.js';

export class GraphicsPool {
  private pool: Graphics[] = [];
  private active: Graphics[] = [];

  constructor(private container: Container) {}

  /** Return all active graphics to the pool at the start of each frame. */
  releaseAll(): void {
    for (const g of this.active) {
      g.clear();
      g.visible = false;
      this.container.removeChild(g);
      this.pool.push(g);
    }
    this.active = [];
  }

  acquire(): Graphics {
    const g = this.pool.pop() ?? new Graphics();
    g.clear();
    g.visible = true;
    this.container.addChild(g);
    this.active.push(g);
    return g;
  }
}
