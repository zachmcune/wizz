// Placeholder art drawn from data `art.shape`. Cached as textures for batched Sprite draws.
// The SpriteProvider seam lets a real AtlasSpriteProvider replace this later with zero
// gameplay-code changes.
import { Graphics, Texture, type Renderer } from 'pixi.js';
import type { ArtDef, ShapeKind } from '../data/defs';

export interface SpriteProvider {
  texture(art: ArtDef, teamColor: string, direction?: number): Texture;
}

function drawShape(
  g: Graphics,
  shape: ShapeKind,
  size: number,
  fill: string,
  accent: string,
  direction = 0,
): void {
  const rot = (direction / 8) * Math.PI * 2;
  if (rot !== 0) g.rotation = rot;

  const r = size / 2;
  const outline = 0x0a0a12;
  if (shape === 'circle') {
    g.circle(0, 0, r).fill(fill).stroke({ width: 2, color: outline });
    g.circle(0, 0, r * 0.45).fill(accent);
    // facing notch
    g.moveTo(r * 0.3, 0).lineTo(r * 0.85, 0).stroke({ width: 2, color: outline });
  } else if (shape === 'square' || shape === 'building') {
    const rad = shape === 'building' ? size * 0.12 : size * 0.18;
    g.roundRect(-r, -r, size, size, rad).fill(fill).stroke({ width: 2, color: outline });
    g.roundRect(-r * 0.5, -r * 0.5, size * 0.5, size * 0.5, rad * 0.6).fill(accent);
    if (shape !== 'building') {
      g.moveTo(0, -r * 0.85).lineTo(0, -r * 0.35).stroke({ width: 2, color: outline });
    }
  } else {
    const sides = shape === 'triangle' ? 3 : shape === 'diamond' ? 4 : shape === 'pentagon' ? 5 : 6;
    const baseRot = shape === 'triangle' ? -Math.PI / 2 : -Math.PI / 2;
    const pts: number[] = [];
    for (let i = 0; i < sides; i++) {
      const a = baseRot + (i / sides) * Math.PI * 2;
      pts.push(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.poly(pts).fill(fill).stroke({ width: 2, color: outline });
    const inner: number[] = [];
    for (let i = 0; i < sides; i++) {
      const a = baseRot + (i / sides) * Math.PI * 2;
      inner.push(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45);
    }
    g.poly(inner).fill(accent);
    g.moveTo(r * 0.35, 0).lineTo(r * 0.85, 0).stroke({ width: 2, color: outline });
  }
}

export class ShapeSpriteProvider implements SpriteProvider {
  private cache = new Map<string, Texture>();

  constructor(private renderer: Renderer) {}

  texture(art: ArtDef, teamColor: string, direction = 0): Texture {
    const dir = art.shape === 'building' ? 0 : direction % 8;
    const key = `${art.shape}:${art.size}:${teamColor}:${art.accent}:${dir}`;
    let tex = this.cache.get(key);
    if (!tex) {
      const g = new Graphics();
      drawShape(g, art.shape, art.size, teamColor, art.accent, dir);
      tex = this.renderer.generateTexture({ target: g, resolution: 2 });
      g.destroy();
      this.cache.set(key, tex);
    }
    return tex;
  }
}

/** Future: AtlasSpriteProvider loads pre-rendered sprite sheets from art.atlas. */
export class AtlasSpriteProvider implements SpriteProvider {
  texture(_art: ArtDef, _teamColor: string, _direction = 0): Texture {
    throw new Error('AtlasSpriteProvider not implemented — use ShapeSpriteProvider until art assets exist');
  }
}
