// Placeholder art drawn from data `art.shape`. Cached as textures for batched Sprite draws.
// The SpriteProvider seam lets a real AtlasSpriteProvider replace this later with zero
// gameplay-code changes.
import { Graphics, Texture, type Renderer } from 'pixi.js';
import type { ArtDef, ShapeKind } from '../data/defs';

export interface SpriteProvider {
  texture(art: ArtDef, teamColor: string): Texture;
}

function drawShape(g: Graphics, shape: ShapeKind, size: number, fill: string, accent: string): void {
  const r = size / 2;
  const outline = 0x0a0a12;
  if (shape === 'circle') {
    g.circle(0, 0, r).fill(fill).stroke({ width: 2, color: outline });
    g.circle(0, 0, r * 0.45).fill(accent);
  } else if (shape === 'square' || shape === 'building') {
    const rad = shape === 'building' ? size * 0.12 : size * 0.18;
    g.roundRect(-r, -r, size, size, rad).fill(fill).stroke({ width: 2, color: outline });
    g.roundRect(-r * 0.5, -r * 0.5, size * 0.5, size * 0.5, rad * 0.6).fill(accent);
  } else {
    // regular polygon: triangle(3), diamond(4 rotated), pentagon(5), hexagon(6)
    const sides = shape === 'triangle' ? 3 : shape === 'diamond' ? 4 : shape === 'pentagon' ? 5 : 6;
    const rot = shape === 'triangle' ? -Math.PI / 2 : shape === 'diamond' ? -Math.PI / 2 : -Math.PI / 2;
    const pts: number[] = [];
    for (let i = 0; i < sides; i++) {
      const a = rot + (i / sides) * Math.PI * 2;
      pts.push(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.poly(pts).fill(fill).stroke({ width: 2, color: outline });
    const inner: number[] = [];
    for (let i = 0; i < sides; i++) {
      const a = rot + (i / sides) * Math.PI * 2;
      inner.push(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45);
    }
    g.poly(inner).fill(accent);
  }
}

export class ShapeSpriteProvider implements SpriteProvider {
  private cache = new Map<string, Texture>();

  constructor(private renderer: Renderer) {}

  texture(art: ArtDef, teamColor: string): Texture {
    const key = `${art.shape}:${art.size}:${teamColor}:${art.accent}`;
    let tex = this.cache.get(key);
    if (!tex) {
      const g = new Graphics();
      drawShape(g, art.shape, art.size, teamColor, art.accent);
      tex = this.renderer.generateTexture({ target: g, resolution: 2 });
      g.destroy();
      this.cache.set(key, tex);
    }
    return tex;
  }
}
