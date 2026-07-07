// Placeholder art drawn from data `art.shape`. Cached as textures for batched Sprite draws.
// The SpriteProvider seam lets a real AtlasSpriteProvider replace this later with zero
// gameplay-code changes.
import { Graphics, Texture, type Renderer } from 'pixi.js';
import type { ArtDef, ShapeKind } from '../data/defs';
import { getProjectionMode } from '../core/projection';

export interface SpriteProvider {
  texture(art: ArtDef, teamColor: string, direction?: number): Texture;
  clearCache(): void;
}

function parseHex(hex: string): number {
  return Number.parseInt(hex.replace('#', ''), 16) || 0xffffff;
}

function shade(color: number, factor: number): number {
  const r = Math.min(255, Math.floor(((color >> 16) & 255) * factor));
  const g = Math.min(255, Math.floor(((color >> 8) & 255) * factor));
  const b = Math.min(255, Math.floor((color & 255) * factor));
  return (r << 16) | (g << 8) | b;
}

const OUTLINE = 0x0a0a12;

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
  if (shape === 'circle') {
    g.circle(0, 0, r).fill(fill).stroke({ width: 2, color: OUTLINE });
    g.circle(0, 0, r * 0.45).fill(accent);
    g.moveTo(r * 0.3, 0).lineTo(r * 0.85, 0).stroke({ width: 2, color: OUTLINE });
  } else if (shape === 'square' || shape === 'building') {
    const rad = shape === 'building' ? size * 0.12 : size * 0.18;
    g.roundRect(-r, -r, size, size, rad).fill(fill).stroke({ width: 2, color: OUTLINE });
    g.roundRect(-r * 0.5, -r * 0.5, size * 0.5, size * 0.5, rad * 0.6).fill(accent);
    if (shape !== 'building') {
      g.moveTo(0, -r * 0.85).lineTo(0, -r * 0.35).stroke({ width: 2, color: OUTLINE });
    }
  } else {
    const sides = shape === 'triangle' ? 3 : shape === 'diamond' ? 4 : shape === 'pentagon' ? 5 : 6;
    const baseRot = -Math.PI / 2;
    const pts: number[] = [];
    for (let i = 0; i < sides; i++) {
      const a = baseRot + (i / sides) * Math.PI * 2;
      pts.push(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.poly(pts).fill(fill).stroke({ width: 2, color: OUTLINE });
    const inner: number[] = [];
    for (let i = 0; i < sides; i++) {
      const a = baseRot + (i / sides) * Math.PI * 2;
      inner.push(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45);
    }
    g.poly(inner).fill(accent);
    g.moveTo(r * 0.35, 0).lineTo(r * 0.85, 0).stroke({ width: 2, color: OUTLINE });
  }
}

/** Oblique-view voxel-style box: top diamond + two visible walls, anchor at ground center (y=0). */
function drawObliqueBox(
  g: Graphics,
  shape: ShapeKind,
  size: number,
  fill: string,
  accent: string,
  direction: number,
): void {
  const isBuilding = shape === 'building';
  const isWide = isBuilding || shape === 'hexagon';
  const w = size * (isWide ? 1.05 : 0.82);
  const boxH = size * (isBuilding ? 0.62 : shape === 'hexagon' ? 0.38 : 0.48);
  const hw = w * 0.46;
  const hh = w * 0.22;
  const fillN = parseHex(fill);
  const accentN = parseHex(accent);
  const wallDark = shade(fillN, 0.42);
  const wallMid = shade(fillN, 0.62);
  const topLift = -boxH;

  const top = { x: 0, y: topLift - hh };
  const right = { x: hw, y: topLift };
  const bottom = { x: 0, y: topLift + hh };
  const left = { x: -hw, y: topLift };

  const footR = { x: hw * 0.72, y: hh * 0.35 };
  const foot = { x: 0, y: hh * 0.55 };
  const footL = { x: -hw * 0.72, y: hh * 0.35 };

  g.poly([right.x, right.y, bottom.x, bottom.y, foot.x, foot.y, footR.x, footR.y])
    .fill(wallMid)
    .stroke({ width: 1.5, color: OUTLINE });
  g.poly([bottom.x, bottom.y, left.x, left.y, footL.x, footL.y, foot.x, foot.y])
    .fill(wallDark)
    .stroke({ width: 1.5, color: OUTLINE });
  g.poly([top.x, top.y, right.x, right.y, bottom.x, bottom.y, left.x, left.y])
    .fill(fillN)
    .stroke({ width: 2, color: OUTLINE });

  const ah = hh * 0.42;
  const aw = hw * 0.42;
  g.poly([0, topLift - ah, aw, topLift, 0, topLift + ah, -aw, topLift])
    .fill(accentN)
    .stroke({ width: 1, color: OUTLINE, alpha: 0.85 });

  if (!isBuilding) {
    const ang = (direction / 8) * Math.PI * 2 - Math.PI / 2;
    const cx = Math.cos(ang) * hw * 0.35;
    const cy = topLift + Math.sin(ang) * ah * 0.35;
    const tx = cx + Math.cos(ang) * hw * 0.28;
    const ty = cy + Math.sin(ang) * ah * 0.28;
    g.moveTo(cx, cy).lineTo(tx, ty).stroke({ width: 2.5, color: OUTLINE, alpha: 0.95 });
  }
}

export class ShapeSpriteProvider implements SpriteProvider {
  private cache = new Map<string, Texture>();

  constructor(private renderer: Renderer) {}

  clearCache(): void {
    for (const tex of this.cache.values()) tex.destroy(true);
    this.cache.clear();
  }

  texture(art: ArtDef, teamColor: string, direction = 0): Texture {
    const mode = getProjectionMode();
    const dir = art.shape === 'building' ? 0 : direction % 8;
    const key = `${mode}:${art.shape}:${art.size}:${teamColor}:${art.accent}:${dir}`;
    let tex = this.cache.get(key);
    if (!tex) {
      const g = new Graphics();
      if (mode === 'oblique') {
        drawObliqueBox(g, art.shape, art.size, teamColor, art.accent, dir);
      } else {
        drawShape(g, art.shape, art.size, teamColor, art.accent, dir);
      }
      tex = this.renderer.generateTexture({ target: g, resolution: 2 });
      g.destroy();
      this.cache.set(key, tex);
    }
    return tex;
  }
}

/** Future: AtlasSpriteProvider loads pre-rendered sprite sheets from art.atlas. */
export class AtlasSpriteProvider implements SpriteProvider {
  clearCache(): void {}

  texture(_art: ArtDef, _teamColor: string, _direction = 0): Texture {
    throw new Error('AtlasSpriteProvider not implemented — use ShapeSpriteProvider until art assets exist');
  }
}
