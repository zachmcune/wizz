// Placeholder art drawn from data `art.shape` / `art.sprite`. Cached as textures for batched Sprite draws.
// The SpriteProvider seam lets a real AtlasSpriteProvider replace this later with zero
// gameplay-code changes.
import { Graphics, Texture, type Renderer } from 'pixi.js';
import type { ArtDef, ShapeKind } from '../data/defs';
import { getProjectionMode } from '../core/projection';

export interface SpriteProvider {
  texture(art: ArtDef, teamColor: string, direction?: number): Texture;
  iconTexture(art: ArtDef, teamColor: string): Texture;
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

type DesignFn = (g: Graphics, size: number, fill: string, accent: string, dir: number) => void;
type ObliqueDesignFn = (g: Graphics, size: number, fill: string, accent: string, dir: number) => void;
/** Distinctive accent glyph centered at origin with radius r. */
type GlyphFn = (g: Graphics, r: number, accent: string, dir?: number) => void;

function facingAngle(dir: number): number {
  return (dir / 8) * Math.PI * 2;
}

function drawFacingLine(g: Graphics, r: number, dir: number, inner = 0.35, outer = 0.85): void {
  const ang = facingAngle(dir);
  g.moveTo(Math.cos(ang) * r * inner, Math.sin(ang) * r * inner)
    .lineTo(Math.cos(ang) * r * outer, Math.sin(ang) * r * outer)
    .stroke({ width: 2, color: OUTLINE });
}

// --- Glyphs (accent signatures, reused on oblique rooftops) ---

const GLYPHS: Record<string, GlyphFn> = {
  wisp: (g, r, accent) => {
    g.circle(0, 0, r * 0.45).fill(accent);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      g.circle(Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72, r * 0.12).fill(accent);
    }
  },
  mana_weaver: (g, r, accent) => {
    g.poly([0, -r * 0.55, r * 0.35, 0, 0, r * 0.55, -r * 0.35, 0]).fill(accent);
    g.moveTo(-r * 0.15, -r * 0.2).lineTo(r * 0.15, r * 0.2).stroke({ width: 1.5, color: OUTLINE, alpha: 0.7 });
  },
  imp_swarmling: (g, r, accent) => {
    g.poly([0, -r * 0.7, r * 0.25, -r * 0.15, -r * 0.25, -r * 0.15]).fill(accent);
    g.poly([-r * 0.55, r * 0.1, -r * 0.35, r * 0.45, -r * 0.7, r * 0.35]).fill(accent);
    g.poly([r * 0.55, r * 0.1, r * 0.35, r * 0.45, r * 0.7, r * 0.35]).fill(accent);
  },
  arcane_archer: (g, r, accent, dir = 0) => {
    const ang = facingAngle(dir) - Math.PI / 2;
    g.arc(0, 0, r * 0.55, ang - 0.9, ang + 0.9).stroke({ width: 2, color: accent });
    const tx = Math.cos(facingAngle(dir)) * r * 0.75;
    const ty = Math.sin(facingAngle(dir)) * r * 0.75;
    g.moveTo(0, 0).lineTo(tx, ty).stroke({ width: 2, color: accent });
  },
  rift_familiar: (g, r, accent) => {
    g.poly([-r * 0.8, r * 0.1, 0, -r * 0.5, r * 0.8, r * 0.1, 0, r * 0.35]).fill(accent);
  },
  stone_golem: (g, r, accent) => {
    g.moveTo(-r * 0.4, -r * 0.2).lineTo(r * 0.1, r * 0.35).stroke({ width: 2, color: accent });
    g.moveTo(r * 0.35, -r * 0.35).lineTo(-r * 0.15, r * 0.15).stroke({ width: 2, color: accent });
    g.circle(-r * 0.55, -r * 0.45, r * 0.18).fill(accent);
    g.circle(r * 0.55, -r * 0.45, r * 0.18).fill(accent);
  },
  siege_behemoth: (g, r, accent, dir = 0) => {
    const ang = facingAngle(dir);
    const bx = Math.cos(ang) * r * 0.55;
    const by = Math.sin(ang) * r * 0.55;
    g.roundRect(bx - r * 0.35, by - r * 0.12, r * 0.7, r * 0.24, 2).fill(accent).stroke({ width: 1, color: OUTLINE });
    g.circle(bx + Math.cos(ang) * r * 0.42, by + Math.sin(ang) * r * 0.42, r * 0.1).fill(accent);
  },
  waystone_wagon: (g, r, accent) => {
    g.circle(-r * 0.45, r * 0.35, r * 0.18).fill(accent).stroke({ width: 1, color: OUTLINE });
    g.circle(r * 0.45, r * 0.35, r * 0.18).fill(accent).stroke({ width: 1, color: OUTLINE });
    g.moveTo(-r * 0.35, -r * 0.15).lineTo(r * 0.35, -r * 0.15).stroke({ width: 2, color: accent });
  },
  storm_caster: (g, r, accent) => {
    g.moveTo(-r * 0.15, -r * 0.5).lineTo(r * 0.1, 0).lineTo(-r * 0.05, 0).lineTo(r * 0.2, r * 0.5).stroke({ width: 2.5, color: accent });
    g.circle(r * 0.35, -r * 0.35, r * 0.08).fill(accent);
  },
  sanctum: (g, r, accent) => {
    g.poly([0, -r * 0.75, r * 0.12, -r * 0.45, -r * 0.12, -r * 0.45]).fill(accent);
    g.rect(-r * 0.08, -r * 0.5, r * 0.16, r * 0.35).fill(accent);
  },
  waystone_camp: (g, r, accent) => {
    g.poly([-r * 0.5, -r * 0.1, r * 0.5, -r * 0.1, 0, -r * 0.65]).fill(accent).stroke({ width: 1, color: OUTLINE });
    g.moveTo(r * 0.35, -r * 0.55).lineTo(r * 0.35, -r * 0.85).stroke({ width: 2, color: accent });
    g.poly([r * 0.35, -r * 0.85, r * 0.55, -r * 0.75, r * 0.35, -r * 0.65]).fill(accent);
  },
  attunement_spire: (g, r, accent) => {
    g.poly([0, -r * 0.8, r * 0.22, 0, 0, r * 0.22, -r * 0.22, 0]).fill(accent).stroke({ width: 1, color: OUTLINE });
  },
  ley_conduit: (g, r, accent) => {
    g.moveTo(-r * 0.5, -r * 0.3).quadraticCurveTo(0, -r * 0.7, r * 0.5, -r * 0.3).stroke({ width: 2, color: accent });
    g.moveTo(-r * 0.35, r * 0.1).quadraticCurveTo(0, r * 0.5, r * 0.35, r * 0.1).stroke({ width: 2, color: accent });
  },
  summoning_circle: (g, r, accent) => {
    const pts: number[] = [];
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i / 5) * Math.PI * 2;
      pts.push(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55);
    }
    g.poly(pts).stroke({ width: 2, color: accent });
  },
  golem_forge: (g, r, accent) => {
    g.poly([-r * 0.35, r * 0.15, 0, r * 0.45, r * 0.35, r * 0.15, 0, -r * 0.05]).fill(accent).stroke({ width: 1, color: OUTLINE });
    g.circle(-r * 0.45, -r * 0.35, r * 0.07).fill(accent);
    g.circle(r * 0.2, -r * 0.45, r * 0.06).fill(accent);
  },
  stone_wall: (g, r, accent) => {
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 3; col++) {
        const ox = (col - 1) * r * 0.32 + (row % 2) * r * 0.16;
        const oy = (row - 0.5) * r * 0.28;
        g.rect(ox - r * 0.14, oy - r * 0.1, r * 0.28, r * 0.2).stroke({ width: 1, color: accent, alpha: 0.8 });
      }
    }
  },
  ward_turret: (g, r, accent, dir = 0) => {
    const ang = facingAngle(dir);
    g.moveTo(0, 0).lineTo(Math.cos(ang) * r * 0.75, Math.sin(ang) * r * 0.75).stroke({ width: 3, color: accent });
  },
  arcane_gate: (g, r, accent) => {
    g.arc(0, r * 0.15, r * 0.45, Math.PI, 0).stroke({ width: 2.5, color: accent });
  },
  scrying_obelisk: (g, r, accent) => {
    g.circle(0, -r * 0.35, r * 0.18).fill(accent).stroke({ width: 1, color: OUTLINE });
    g.arc(0, -r * 0.35, r * 0.32, -Math.PI * 0.75, -Math.PI * 0.25).stroke({ width: 1.5, color: accent, alpha: 0.8 });
    g.arc(0, -r * 0.35, r * 0.45, Math.PI * 0.25, Math.PI * 0.75).stroke({ width: 1.5, color: accent, alpha: 0.8 });
  },
  arcane_nexus: (g, r, accent) => {
    g.circle(0, 0, r * 0.28).fill(accent);
    g.circle(0, 0, r * 0.5).stroke({ width: 1.5, color: accent, alpha: 0.7 });
    g.circle(0, 0, r * 0.68).stroke({ width: 1, color: accent, alpha: 0.45 });
  },
  arcane_bunker: (g, r, accent) => {
    g.roundRect(-r * 0.55, -r * 0.25, r * 1.1, r * 0.5, r * 0.08).stroke({ width: 2, color: accent });
    for (let i = -1; i <= 1; i++) {
      g.rect(i * r * 0.32 - r * 0.06, -r * 0.08, r * 0.12, r * 0.16).fill(accent);
    }
  },
  frost_spire: (g, r, accent) => {
    g.poly([0, -r * 0.75, r * 0.1, -r * 0.25, -r * 0.1, -r * 0.25]).fill(accent);
    g.poly([-r * 0.35, -r * 0.5, -r * 0.48, -r * 0.15, -r * 0.22, -r * 0.15]).fill(accent);
    g.poly([r * 0.35, -r * 0.45, r * 0.48, -r * 0.12, r * 0.22, -r * 0.12]).fill(accent);
    g.moveTo(-r * 0.45, 0).lineTo(r * 0.45, 0).stroke({ width: 1.5, color: accent, alpha: 0.75 });
  },
  inferno_beacon: (g, r, accent) => {
    g.circle(0, 0, r * 0.28).fill(accent);
    g.arc(0, 0, r * 0.55, -Math.PI * 0.8, Math.PI * 0.15).stroke({ width: 2, color: accent });
    g.arc(0, 0, r * 0.72, Math.PI * 0.2, Math.PI * 0.95).stroke({ width: 1.5, color: accent });
  },
  storm_conductor: (g, r, accent) => {
    g.moveTo(-r * 0.15, -r * 0.65).lineTo(r * 0.2, -r * 0.1).lineTo(-r * 0.05, -r * 0.1).lineTo(r * 0.25, r * 0.55).stroke({ width: 2.5, color: accent });
    g.circle(-r * 0.45, r * 0.35, r * 0.08).fill(accent);
    g.circle(r * 0.48, -r * 0.35, r * 0.08).fill(accent);
  },
  celestial_cannon: (g, r, accent) => {
    g.poly([0, -r * 0.15, r * 0.42, r * 0.55, -r * 0.42, r * 0.55]).stroke({ width: 1.5, color: accent, alpha: 0.7 });
    g.poly([0, -r * 0.55, r * 0.22, r * 0.05, -r * 0.22, r * 0.05]).stroke({ width: 1.5, color: accent, alpha: 0.85 });
    g.poly([0, -r * 0.88, r * 0.12, -r * 0.35, -r * 0.12, -r * 0.35]).stroke({ width: 2, color: accent });
    g.circle(0, -r * 1.05, r * 0.14).fill(accent);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      g.circle(Math.cos(a) * r * 0.38, r * 0.35 + Math.sin(a) * r * 0.12, r * 0.04).fill(accent);
    }
  },
  sanctuary_spire: (g, r, accent) => {
    g.moveTo(0, -r * 0.72).lineTo(0, r * 0.55).stroke({ width: 2.5, color: accent });
    g.moveTo(-r * 0.45, -r * 0.1).lineTo(r * 0.45, -r * 0.1).stroke({ width: 2.5, color: accent });
    g.circle(0, -r * 0.1, r * 0.58).stroke({ width: 1.5, color: accent, alpha: 0.8 });
  },
  frost_bolt: (g, r, accent) => {
    g.poly([0, -r * 0.8, r * 0.22, 0, 0, r * 0.8, -r * 0.22, 0]).fill(accent);
  },
  inferno_orb: (g, r, accent) => {
    g.circle(0, 0, r * 0.45).fill(accent);
    g.arc(0, 0, r * 0.72, -0.6, 2.2).stroke({ width: 1.5, color: accent });
  },
  celestial_shot: (g, r, accent) => {
    g.poly([0, -r * 0.95, r * 0.35, -r * 0.15, r * 0.55, r * 0.2, 0, r * 0.85, -r * 0.55, r * 0.2, -r * 0.35, -r * 0.15])
      .fill(accent)
      .stroke({ width: 1, color: accent, alpha: 0.9 });
    g.circle(0, -r * 0.05, r * 0.18).fill({ color: 0xffffff, alpha: 0.85 });
  },
};

// --- Ortho full silhouettes ---

const ORTHO_DESIGNS: Record<string, DesignFn> = {
  wisp: (g, size, fill, accent, dir) => {
    const r = size / 2;
    g.circle(0, 0, r).fill(fill).stroke({ width: 2, color: OUTLINE });
    GLYPHS.wisp!(g, r, accent);
    drawFacingLine(g, r, dir, 0.3, 0.85);
  },
  mana_weaver: (g, size, fill, accent, dir) => {
    const r = size / 2;
    g.poly([0, -r, r * 0.55, 0, 0, r, -r * 0.55, 0]).fill(fill).stroke({ width: 2, color: OUTLINE });
    GLYPHS.mana_weaver!(g, r, accent);
    drawFacingLine(g, r, dir);
  },
  imp_swarmling: (g, size, fill, accent, dir) => {
    const r = size / 2;
    g.poly([0, -r, r * 0.75, r * 0.65, -r * 0.75, r * 0.65]).fill(fill).stroke({ width: 2, color: OUTLINE });
    GLYPHS.imp_swarmling!(g, r, accent);
    drawFacingLine(g, r, dir);
  },
  arcane_archer: (g, size, fill, accent, dir) => {
    const r = size / 2;
    g.poly([0, -r, r * 0.45, 0, 0, r, -r * 0.45, 0]).fill(fill).stroke({ width: 2, color: OUTLINE });
    GLYPHS.arcane_archer!(g, r, accent, dir);
  },
  rift_familiar: (g, size, fill, accent, dir) => {
    const r = size / 2;
    g.poly([-r, r * 0.2, 0, -r * 0.7, r, r * 0.2, 0, r * 0.55]).fill(fill).stroke({ width: 2, color: OUTLINE });
    GLYPHS.rift_familiar!(g, r, accent);
    drawFacingLine(g, r, dir);
  },
  stone_golem: (g, size, fill, accent, dir) => {
    const r = size / 2;
    g.roundRect(-r * 0.85, -r * 0.75, r * 1.7, r * 1.5, r * 0.2).fill(fill).stroke({ width: 2, color: OUTLINE });
    g.roundRect(-r * 0.65, -r * 0.95, r * 0.45, r * 0.35, r * 0.1).fill(fill).stroke({ width: 1.5, color: OUTLINE });
    g.roundRect(r * 0.2, -r * 0.95, r * 0.45, r * 0.35, r * 0.1).fill(fill).stroke({ width: 1.5, color: OUTLINE });
    GLYPHS.stone_golem!(g, r, accent);
    drawFacingLine(g, r, dir);
  },
  siege_behemoth: (g, size, fill, accent, dir) => {
    const r = size / 2;
    const pts: number[] = [];
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i / 6) * Math.PI * 2;
      pts.push(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.poly(pts).fill(fill).stroke({ width: 2, color: OUTLINE });
    GLYPHS.siege_behemoth!(g, r, accent, dir);
  },
  waystone_wagon: (g, size, fill, accent, dir) => {
    const r = size / 2;
    g.roundRect(-r * 0.85, -r * 0.45, r * 1.7, r * 0.9, r * 0.12).fill(fill).stroke({ width: 2, color: OUTLINE });
    g.roundRect(-r * 0.55, -r * 0.75, r * 1.1, r * 0.35, r * 0.08).fill(fill).stroke({ width: 1.5, color: OUTLINE });
    GLYPHS.waystone_wagon!(g, r, accent);
    drawFacingLine(g, r, dir);
  },
  storm_caster: (g, size, fill, accent, dir) => {
    const r = size / 2;
    g.poly([0, -r, r * 0.35, 0, r, 0, r * 0.35, r, 0, r, -r * 0.35, r, -r, 0, -r * 0.35, -r]).fill(fill).stroke({ width: 2, color: OUTLINE });
    GLYPHS.storm_caster!(g, r, accent);
    drawFacingLine(g, r, dir);
  },
  sanctum: (g, size, fill, accent) => {
    const r = size / 2;
    g.roundRect(-r * 0.9, -r * 0.35, r * 1.8, r * 1.1, r * 0.15).fill(fill).stroke({ width: 2, color: OUTLINE });
    g.roundRect(-r * 0.18, -r * 0.95, r * 0.36, r * 0.75, r * 0.06).fill(fill).stroke({ width: 2, color: OUTLINE });
    GLYPHS.sanctum!(g, r, accent);
  },
  waystone_camp: (g, size, fill, accent) => {
    const r = size / 2;
    g.roundRect(-r * 0.75, -r * 0.2, r * 1.5, r * 0.85, r * 0.12).fill(fill).stroke({ width: 2, color: OUTLINE });
    GLYPHS.waystone_camp!(g, r, accent);
  },
  attunement_spire: (g, size, fill, accent) => {
    const r = size / 2;
    g.poly([-r * 0.35, r * 0.55, r * 0.35, r * 0.55, r * 0.15, -r * 0.85, -r * 0.15, -r * 0.85]).fill(fill).stroke({ width: 2, color: OUTLINE });
    GLYPHS.attunement_spire!(g, r, accent);
  },
  ley_conduit: (g, size, fill, accent) => {
    const r = size / 2;
    g.roundRect(-r * 0.55, r * 0.15, r * 1.1, r * 0.45, r * 0.08).fill(fill).stroke({ width: 2, color: OUTLINE });
    g.rect(-r * 0.12, -r * 0.75, r * 0.24, r * 0.95).fill(fill).stroke({ width: 1.5, color: OUTLINE });
    g.rect(r * 0.35, -r * 0.65, r * 0.24, r * 0.85).fill(fill).stroke({ width: 1.5, color: OUTLINE });
    g.moveTo(-r * 0.35, -r * 0.35).lineTo(r * 0.47, -r * 0.35).stroke({ width: 2, color: OUTLINE });
    GLYPHS.ley_conduit!(g, r, accent);
  },
  summoning_circle: (g, size, fill, accent) => {
    const r = size / 2;
    g.circle(0, 0, r * 0.85).fill(fill).stroke({ width: 2, color: OUTLINE });
    g.circle(0, 0, r * 0.65).stroke({ width: 2, color: OUTLINE });
    GLYPHS.summoning_circle!(g, r, accent);
  },
  golem_forge: (g, size, fill, accent) => {
    const r = size / 2;
    g.roundRect(-r * 0.9, -r * 0.25, r * 1.8, r * 1.0, r * 0.12).fill(fill).stroke({ width: 2, color: OUTLINE });
    g.rect(r * 0.35, -r * 0.85, r * 0.3, r * 0.65).fill(fill).stroke({ width: 2, color: OUTLINE });
    GLYPHS.golem_forge!(g, r, accent);
  },
  stone_wall: (g, size, fill, accent) => {
    const r = size / 2;
    g.roundRect(-r * 0.95, -r * 0.35, r * 1.9, r * 0.7, r * 0.06).fill(fill).stroke({ width: 2, color: OUTLINE });
    GLYPHS.stone_wall!(g, r, accent);
  },
  ward_turret: (g, size, fill, accent, dir) => {
    const r = size / 2;
    g.roundRect(-r * 0.75, -r * 0.15, r * 1.5, r * 0.85, r * 0.08).fill(fill).stroke({ width: 2, color: OUTLINE });
    g.circle(0, -r * 0.35, r * 0.4).fill(fill).stroke({ width: 2, color: OUTLINE });
    GLYPHS.ward_turret!(g, r, accent, dir);
  },
  arcane_gate: (g, size, fill, accent) => {
    const r = size / 2;
    g.rect(-r * 0.85, -r * 0.55, r * 0.28, r * 1.1).fill(fill).stroke({ width: 2, color: OUTLINE });
    g.rect(r * 0.57, -r * 0.55, r * 0.28, r * 1.1).fill(fill).stroke({ width: 2, color: OUTLINE });
    g.rect(-r * 0.85, -r * 0.65, r * 1.7, r * 0.18).fill(fill).stroke({ width: 2, color: OUTLINE });
    GLYPHS.arcane_gate!(g, r, accent);
  },
  scrying_obelisk: (g, size, fill, accent) => {
    const r = size / 2;
    g.poly([-r * 0.28, r * 0.55, r * 0.28, r * 0.55, r * 0.12, -r * 0.85, -r * 0.12, -r * 0.85]).fill(fill).stroke({ width: 2, color: OUTLINE });
    GLYPHS.scrying_obelisk!(g, r, accent);
  },
  arcane_nexus: (g, size, fill, accent) => {
    const r = size / 2;
    const pts: number[] = [];
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i / 6) * Math.PI * 2;
      pts.push(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85);
    }
    g.poly(pts).fill(fill).stroke({ width: 2, color: OUTLINE });
    GLYPHS.arcane_nexus!(g, r, accent);
  },
  arcane_bunker: (g, size, fill, accent) => {
    const r = size / 2;
    const fillN = parseHex(fill);
    g.roundRect(-r * 0.95, -r * 0.22, r * 1.9, r * 0.44, r * 0.06).fill(fill).stroke({ width: 2, color: OUTLINE });
    g.roundRect(-r * 0.95, -r * 0.35, r * 0.24, r * 0.14, 2).fill(shade(fillN, 0.72)).stroke({ width: 1.5, color: OUTLINE });
    g.roundRect(r * 0.71, -r * 0.35, r * 0.24, r * 0.14, 2).fill(shade(fillN, 0.72)).stroke({ width: 1.5, color: OUTLINE });
    for (let i = -1; i <= 1; i++) {
      g.rect(i * r * 0.32 - r * 0.06, -r * 0.06, r * 0.12, r * 0.14).fill(accent);
    }
  },
  frost_spire: (g, size, fill, accent) => {
    const r = size / 2;
    const fillN = parseHex(fill);
    const hexPts: number[] = [];
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i / 6) * Math.PI * 2;
      hexPts.push(Math.cos(a) * r * 0.52, Math.sin(a) * r * 0.52 + r * 0.18);
    }
    g.poly(hexPts).fill(fill).stroke({ width: 2, color: OUTLINE });
    g.poly([0, -r * 0.92, r * 0.18, -r * 0.38, r * 0.06, r * 0.02, -r * 0.06, r * 0.02, -r * 0.18, -r * 0.38])
      .fill(fill)
      .stroke({ width: 2, color: OUTLINE });
    g.poly([-r * 0.44, -r * 0.68, -r * 0.6, -r * 0.28, -r * 0.28, r * 0.05])
      .fill(shade(fillN, 0.82))
      .stroke({ width: 1.5, color: OUTLINE });
    g.poly([r * 0.44, -r * 0.6, r * 0.6, -r * 0.22, r * 0.28, r * 0.08])
      .fill(shade(fillN, 0.9))
      .stroke({ width: 1.5, color: OUTLINE });
    GLYPHS.frost_spire!(g, r, accent);
  },
  inferno_beacon: (g, size, fill, accent) => {
    const r = size / 2;
    g.roundRect(-r * 0.58, r * 0.18, r * 1.16, r * 0.42, r * 0.08).fill(fill).stroke({ width: 2, color: OUTLINE });
    g.rect(-r * 0.14, -r * 0.52, r * 0.28, r * 0.72).fill(fill).stroke({ width: 1.5, color: OUTLINE });
    g.circle(0, -r * 0.72, r * 0.26).fill(fill).stroke({ width: 2, color: OUTLINE });
    g.circle(0, -r * 0.72, r * 0.14).fill(accent);
    g.arc(0, -r * 0.72, r * 0.42, -Math.PI * 0.85, Math.PI * 0.12).stroke({ width: 2, color: accent });
    g.arc(0, -r * 0.72, r * 0.55, Math.PI * 0.18, Math.PI * 0.92).stroke({ width: 1.5, color: accent, alpha: 0.75 });
  },
  storm_conductor: (g, size, fill, accent) => {
    const r = size / 2;
    g.roundRect(-r * 0.68, r * 0.22, r * 1.36, r * 0.38, r * 0.08).fill(fill).stroke({ width: 2, color: OUTLINE });
    g.rect(-r * 0.3, -r * 0.62, r * 0.16, r * 0.88).fill(fill).stroke({ width: 1.5, color: OUTLINE });
    g.rect(r * 0.14, -r * 0.72, r * 0.16, r * 0.98).fill(fill).stroke({ width: 1.5, color: OUTLINE });
    g.moveTo(-r * 0.48, -r * 0.32).lineTo(r * 0.36, -r * 0.32).stroke({ width: 2, color: OUTLINE });
    GLYPHS.storm_conductor!(g, r, accent);
  },
  celestial_cannon: (g, size, fill, accent) => {
    const r = size / 2;
    g.poly([0, r * 0.55, r * 0.72, r * 0.42, r * 0.48, -r * 0.05, -r * 0.48, -r * 0.05, -r * 0.72, r * 0.42])
      .fill(fill)
      .stroke({ width: 2, color: OUTLINE });
    g.poly([0, -r * 0.12, r * 0.28, -r * 0.42, -r * 0.28, -r * 0.42])
      .fill(fill)
      .stroke({ width: 2, color: OUTLINE });
    g.poly([0, -r * 0.48, r * 0.14, -r * 0.82, -r * 0.14, -r * 0.82])
      .fill(fill)
      .stroke({ width: 2, color: OUTLINE });
    g.circle(0, -r * 0.98, r * 0.12).fill(accent).stroke({ width: 1.5, color: OUTLINE });
    for (let i = 0; i < 4; i++) {
      const y = r * 0.35 - i * r * 0.22;
      g.moveTo(-r * 0.35, y).lineTo(r * 0.35, y).stroke({ width: 1, color: accent, alpha: 0.55 });
    }
  },
  sanctuary_spire: (g, size, fill, accent) => {
    const r = size / 2;
    g.roundRect(-r * 0.38, r * 0.38, r * 0.76, r * 0.32, r * 0.08).fill(fill).stroke({ width: 2, color: OUTLINE });
    g.poly([0, -r * 0.92, r * 0.2, r * 0.18, -r * 0.2, r * 0.18]).fill(fill).stroke({ width: 2, color: OUTLINE });
    GLYPHS.sanctuary_spire!(g, r, accent);
  },
};

/** Per-entity oblique box proportions for extra silhouette variety. */
const OBLIQUE_PROPS: Record<string, { wMul: number; hMul: number }> = {
  sanctum: { wMul: 1.15, hMul: 0.75 },
  waystone_camp: { wMul: 1.05, hMul: 0.55 },
  attunement_spire: { wMul: 0.75, hMul: 0.85 },
  ley_conduit: { wMul: 0.9, hMul: 0.55 },
  summoning_circle: { wMul: 1.0, hMul: 0.35 },
  golem_forge: { wMul: 1.15, hMul: 0.7 },
  stone_wall: { wMul: 1.2, hMul: 0.28 },
  ward_turret: { wMul: 0.85, hMul: 0.55 },
  arcane_gate: { wMul: 1.1, hMul: 0.4 },
  scrying_obelisk: { wMul: 0.7, hMul: 0.8 },
  arcane_nexus: { wMul: 1.0, hMul: 0.5 },
  arcane_bunker: { wMul: 1.15, hMul: 0.28 },
  frost_spire: { wMul: 0.88, hMul: 0.68 },
  inferno_beacon: { wMul: 0.88, hMul: 0.62 },
  storm_conductor: { wMul: 0.85, hMul: 0.78 },
  celestial_cannon: { wMul: 0.92, hMul: 0.92 },
  sanctuary_spire: { wMul: 0.82, hMul: 0.82 },
  stone_golem: { wMul: 0.95, hMul: 0.55 },
  siege_behemoth: { wMul: 1.1, hMul: 0.5 },
  waystone_wagon: { wMul: 1.15, hMul: 0.42 },
};

const UNIT_SPRITES = new Set([
  'wisp',
  'mana_weaver',
  'imp_swarmling',
  'arcane_archer',
  'rift_familiar',
  'stone_golem',
  'siege_behemoth',
  'waystone_wagon',
  'storm_caster',
]);

function isUnitSprite(sprite: string): boolean {
  return UNIT_SPRITES.has(sprite);
}

function drawIsoPrism(
  g: Graphics,
  cx: number,
  cy: number,
  hw: number,
  hh: number,
  h: number,
  fillN: number,
): void {
  const wallDark = shade(fillN, 0.42);
  const wallMid = shade(fillN, 0.62);
  const top = shade(fillN, 1.05);
  const gr = { x: cx + hw, y: cy };
  const gb = { x: cx, y: cy + hh };
  const gl = { x: cx - hw, y: cy };
  const tr = { x: cx + hw, y: cy - h };
  const tb = { x: cx, y: cy + hh - h };
  const tl = { x: cx - hw, y: cy - h };
  const tt = { x: cx, y: cy - hh - h };

  g.poly([gr.x, gr.y, gb.x, gb.y, tb.x, tb.y, tr.x, tr.y])
    .fill(wallMid)
    .stroke({ width: 1.5, color: OUTLINE });
  g.poly([gb.x, gb.y, gl.x, gl.y, tl.x, tl.y, tb.x, tb.y])
    .fill(wallDark)
    .stroke({ width: 1.5, color: OUTLINE });
  g.poly([tt.x, tt.y, tr.x, tr.y, tb.x, tb.y, tl.x, tl.y])
    .fill(top)
    .stroke({ width: 2, color: OUTLINE });
}

function drawIsoPyramid(
  g: Graphics,
  cx: number,
  cy: number,
  hw: number,
  hh: number,
  h: number,
  fillN: number,
): void {
  const mid = shade(fillN, 0.74);
  const dark = shade(fillN, 0.52);
  const top = { x: cx, y: cy - h };
  const right = { x: cx + hw, y: cy };
  const bottom = { x: cx, y: cy + hh };
  const left = { x: cx - hw, y: cy };
  const far = { x: cx, y: cy - hh };

  g.poly([top.x, top.y, right.x, right.y, bottom.x, bottom.y]).fill(mid).stroke({ width: 1.5, color: OUTLINE });
  g.poly([top.x, top.y, bottom.x, bottom.y, left.x, left.y]).fill(dark).stroke({ width: 1.5, color: OUTLINE });
  g.poly([top.x, top.y, left.x, left.y, far.x, far.y, right.x, right.y]).fill(shade(fillN, 0.92)).stroke({ width: 1.5, color: OUTLINE });
}

function drawIsoPlate(g: Graphics, cx: number, cy: number, hw: number, hh: number, color: number): void {
  g.poly([cx, cy - hh, cx + hw, cy, cx, cy + hh, cx - hw, cy])
    .fill(color)
    .stroke({ width: 1.5, color: OUTLINE });
}

function drawAccentGlyph(g: Graphics, sprite: string, cx: number, cy: number, r: number, accent: string, dir: number): void {
  const glyph = GLYPHS[sprite];
  if (!glyph) return;
  const child = new Graphics();
  glyph(child, r, accent, dir);
  child.position.set(cx, cy);
  g.addChild(child);
}

function drawObliqueFacing(g: Graphics, cx: number, cy: number, length: number, dir: number): void {
  const ang = (dir / 8) * Math.PI * 2 - Math.PI / 2;
  g.moveTo(cx, cy)
    .lineTo(cx + Math.cos(ang) * length, cy + Math.sin(ang) * length * 0.6)
    .stroke({ width: 2.5, color: OUTLINE, alpha: 0.95 });
}

// Entity-specific oblique art. These are intentionally composed from different
// volumes and silhouettes instead of sharing the generic cube/box body.
const OBLIQUE_DESIGNS: Record<string, ObliqueDesignFn> = {
  wisp: (g, size, fill, accent, dir) => {
    const r = size / 2;
    drawIsoPlate(g, 0, r * 0.2, r * 0.75, r * 0.28, shade(parseHex(fill), 0.35));
    g.circle(0, -r * 0.85, r * 0.58).fill(fill).stroke({ width: 2, color: OUTLINE });
    drawAccentGlyph(g, 'wisp', 0, -r * 0.85, r * 0.65, accent, dir);
  },
  mana_weaver: (g, size, fill, accent, dir) => {
    const r = size / 2;
    const fillN = parseHex(fill);
    drawIsoPlate(g, 0, r * 0.35, r * 0.58, r * 0.2, shade(fillN, 0.36));
    drawIsoPyramid(g, 0, -r * 0.1, r * 0.45, r * 0.18, r * 1.15, fillN);
    drawAccentGlyph(g, 'mana_weaver', 0, -r * 0.55, r * 0.55, accent, dir);
  },
  imp_swarmling: (g, size, fill, accent, dir) => {
    const r = size / 2;
    const fillN = parseHex(fill);
    g.poly([0, -r * 0.85, r * 0.72, r * 0.2, 0, r * 0.55, -r * 0.72, r * 0.2])
      .fill(shade(fillN, 0.78))
      .stroke({ width: 2, color: OUTLINE });
    g.poly([-r * 0.62, -r * 0.2, -r * 0.25, -r * 0.65, -r * 0.05, -r * 0.12]).fill(accent).stroke({ width: 1, color: OUTLINE });
    g.poly([r * 0.62, -r * 0.2, r * 0.25, -r * 0.65, r * 0.05, -r * 0.12]).fill(accent).stroke({ width: 1, color: OUTLINE });
    drawObliqueFacing(g, 0, -r * 0.05, r * 0.55, dir);
  },
  arcane_archer: (g, size, fill, accent, dir) => {
    const r = size / 2;
    drawIsoPrism(g, 0, r * 0.22, r * 0.28, r * 0.16, r * 0.8, parseHex(fill));
    g.arc(0, -r * 0.45, r * 0.62, -2.35, -0.8).stroke({ width: 2.5, color: accent });
    g.moveTo(-r * 0.42, -r * 0.18).lineTo(r * 0.52, -r * 0.52).stroke({ width: 2, color: accent });
    drawObliqueFacing(g, 0, -r * 0.3, r * 0.5, dir);
  },
  rift_familiar: (g, size, fill, accent, dir) => {
    const r = size / 2;
    const fillN = parseHex(fill);
    g.poly([-r * 1.05, -r * 0.15, -r * 0.1, -r * 0.65, -r * 0.2, r * 0.25])
      .fill(shade(fillN, 0.68))
      .stroke({ width: 1.5, color: OUTLINE });
    g.poly([r * 1.05, -r * 0.15, r * 0.1, -r * 0.65, r * 0.2, r * 0.25])
      .fill(shade(fillN, 0.82))
      .stroke({ width: 1.5, color: OUTLINE });
    drawIsoPyramid(g, 0, r * 0.1, r * 0.32, r * 0.14, r * 0.7, fillN);
    drawAccentGlyph(g, 'rift_familiar', 0, -r * 0.35, r * 0.45, accent, dir);
  },
  stone_golem: (g, size, fill, accent, dir) => {
    const r = size / 2;
    const fillN = parseHex(fill);
    drawIsoPrism(g, 0, r * 0.35, r * 0.6, r * 0.26, r * 0.75, fillN);
    drawIsoPrism(g, -r * 0.5, r * 0.1, r * 0.28, r * 0.14, r * 0.55, fillN);
    drawIsoPrism(g, r * 0.5, r * 0.1, r * 0.28, r * 0.14, r * 0.55, fillN);
    drawIsoPrism(g, 0, -r * 0.42, r * 0.28, r * 0.14, r * 0.35, fillN);
    drawAccentGlyph(g, 'stone_golem', 0, -r * 0.35, r * 0.52, accent, dir);
  },
  siege_behemoth: (g, size, fill, accent, dir) => {
    const r = size / 2;
    const fillN = parseHex(fill);
    drawIsoPrism(g, 0, r * 0.25, r * 0.82, r * 0.34, r * 0.45, fillN);
    drawIsoPrism(g, r * 0.52, -r * 0.18, r * 0.48, r * 0.12, r * 0.18, fillN);
    g.circle(r * 0.98, -r * 0.3, r * 0.16).fill(accent).stroke({ width: 1.5, color: OUTLINE });
    drawAccentGlyph(g, 'siege_behemoth', -r * 0.1, -r * 0.3, r * 0.45, accent, dir);
  },
  waystone_wagon: (g, size, fill, accent, dir) => {
    const r = size / 2;
    const fillN = parseHex(fill);
    drawIsoPrism(g, 0, r * 0.25, r * 0.85, r * 0.28, r * 0.38, fillN);
    drawIsoPrism(g, 0, -r * 0.18, r * 0.52, r * 0.18, r * 0.32, fillN);
    g.circle(-r * 0.55, r * 0.45, r * 0.2).fill(accent).stroke({ width: 1.5, color: OUTLINE });
    g.circle(r * 0.55, r * 0.45, r * 0.2).fill(accent).stroke({ width: 1.5, color: OUTLINE });
    drawObliqueFacing(g, 0, -r * 0.2, r * 0.45, dir);
  },
  storm_caster: (g, size, fill, accent, dir) => {
    const r = size / 2;
    drawIsoPlate(g, 0, r * 0.32, r * 0.55, r * 0.22, shade(parseHex(fill), 0.4));
    drawIsoPyramid(g, 0, -r * 0.05, r * 0.42, r * 0.18, r * 0.85, parseHex(fill));
    drawAccentGlyph(g, 'storm_caster', 0, -r * 0.45, r * 0.58, accent, dir);
  },
  sanctum: (g, size, fill, accent, dir) => {
    const r = size / 2;
    const fillN = parseHex(fill);
    drawIsoPrism(g, 0, r * 0.38, r * 0.95, r * 0.42, r * 0.5, fillN);
    drawIsoPrism(g, 0, -r * 0.15, r * 0.35, r * 0.2, r * 0.9, fillN);
    drawIsoPyramid(g, 0, -r * 1.05, r * 0.28, r * 0.14, r * 0.45, fillN);
    drawAccentGlyph(g, 'sanctum', 0, -r * 0.78, r * 0.45, accent, dir);
  },
  waystone_camp: (g, size, fill, accent, dir) => {
    const r = size / 2;
    const fillN = parseHex(fill);
    drawIsoPrism(g, 0, r * 0.42, r * 0.82, r * 0.3, r * 0.32, fillN);
    drawIsoPyramid(g, 0, r * 0.05, r * 0.78, r * 0.26, r * 0.75, fillN);
    drawAccentGlyph(g, 'waystone_camp', r * 0.1, -r * 0.6, r * 0.42, accent, dir);
  },
  attunement_spire: (g, size, fill, accent) => {
    const r = size / 2;
    const fillN = parseHex(fill);
    drawIsoPrism(g, 0, r * 0.45, r * 0.45, r * 0.2, r * 0.35, fillN);
    drawIsoPyramid(g, 0, r * 0.12, r * 0.35, r * 0.16, r * 1.25, fillN);
    drawIsoPyramid(g, 0, -r * 0.95, r * 0.22, r * 0.1, r * 0.45, parseHex(accent));
  },
  ley_conduit: (g, size, fill, accent, dir) => {
    const r = size / 2;
    const fillN = parseHex(fill);
    drawIsoPrism(g, 0, r * 0.45, r * 0.78, r * 0.28, r * 0.28, fillN);
    drawIsoPrism(g, -r * 0.28, r * 0.05, r * 0.14, r * 0.1, r * 0.85, fillN);
    drawIsoPrism(g, r * 0.28, -r * 0.02, r * 0.14, r * 0.1, r * 0.75, fillN);
    g.moveTo(-r * 0.35, -r * 0.72).quadraticCurveTo(0, -r * 1.05, r * 0.35, -r * 0.78).stroke({ width: 2.5, color: accent });
    drawAccentGlyph(g, 'ley_conduit', 0, -r * 0.55, r * 0.45, accent, dir);
  },
  summoning_circle: (g, size, fill, accent, dir) => {
    const r = size / 2;
    drawIsoPlate(g, 0, r * 0.22, r * 0.85, r * 0.34, parseHex(fill));
    drawIsoPlate(g, 0, r * 0.1, r * 0.58, r * 0.22, shade(parseHex(fill), 0.42));
    drawAccentGlyph(g, 'summoning_circle', 0, -r * 0.02, r * 0.78, accent, dir);
  },
  golem_forge: (g, size, fill, accent, dir) => {
    const r = size / 2;
    const fillN = parseHex(fill);
    drawIsoPrism(g, -r * 0.12, r * 0.42, r * 0.92, r * 0.36, r * 0.55, fillN);
    drawIsoPrism(g, r * 0.52, -r * 0.22, r * 0.25, r * 0.14, r * 0.88, fillN);
    drawIsoPyramid(g, -r * 0.4, -r * 0.15, r * 0.34, r * 0.16, r * 0.45, fillN);
    drawAccentGlyph(g, 'golem_forge', -r * 0.15, -r * 0.2, r * 0.55, accent, dir);
  },
  stone_wall: (g, size, fill, accent, dir) => {
    const r = size / 2;
    const fillN = parseHex(fill);
    for (let i = 0; i < 3; i++) {
      drawIsoPrism(g, (i - 1) * r * 0.55, r * 0.22 - (i % 2) * r * 0.08, r * 0.34, r * 0.16, r * 0.28, fillN);
    }
    drawAccentGlyph(g, 'stone_wall', 0, -r * 0.05, r * 0.7, accent, dir);
  },
  ward_turret: (g, size, fill, accent, dir) => {
    const r = size / 2;
    const fillN = parseHex(fill);
    drawIsoPrism(g, 0, r * 0.42, r * 0.62, r * 0.3, r * 0.35, fillN);
    drawIsoPrism(g, 0, -r * 0.02, r * 0.36, r * 0.18, r * 0.52, fillN);
    drawIsoPrism(g, r * 0.42, -r * 0.55, r * 0.5, r * 0.1, r * 0.12, fillN);
    g.circle(r * 0.92, -r * 0.62, r * 0.11).fill(accent).stroke({ width: 1, color: OUTLINE });
    drawAccentGlyph(g, 'ward_turret', 0, -r * 0.48, r * 0.4, accent, dir);
  },
  arcane_gate: (g, size, fill, accent, dir) => {
    const r = size / 2;
    const fillN = parseHex(fill);
    drawIsoPrism(g, -r * 0.48, r * 0.26, r * 0.2, r * 0.16, r * 0.85, fillN);
    drawIsoPrism(g, r * 0.48, r * 0.26, r * 0.2, r * 0.16, r * 0.85, fillN);
    drawIsoPrism(g, 0, -r * 0.55, r * 0.72, r * 0.12, r * 0.2, fillN);
    drawAccentGlyph(g, 'arcane_gate', 0, -r * 0.45, r * 0.72, accent, dir);
  },
  scrying_obelisk: (g, size, fill, accent, dir) => {
    const r = size / 2;
    const fillN = parseHex(fill);
    drawIsoPrism(g, 0, r * 0.45, r * 0.42, r * 0.18, r * 0.28, fillN);
    drawIsoPyramid(g, 0, r * 0.2, r * 0.26, r * 0.12, r * 1.35, fillN);
    drawAccentGlyph(g, 'scrying_obelisk', 0, -r * 0.6, r * 0.55, accent, dir);
  },
  arcane_nexus: (g, size, fill, accent, dir) => {
    const r = size / 2;
    const fillN = parseHex(fill);
    drawIsoPlate(g, 0, r * 0.36, r * 0.9, r * 0.36, fillN);
    drawIsoPrism(g, 0, r * 0.18, r * 0.5, r * 0.22, r * 0.35, fillN);
    g.circle(0, -r * 0.62, r * 0.22).fill(accent).stroke({ width: 1.5, color: OUTLINE });
    drawAccentGlyph(g, 'arcane_nexus', 0, -r * 0.2, r * 0.7, accent, dir);
  },
  arcane_bunker: (g, size, fill, accent) => {
    const r = size / 2;
    const fillN = parseHex(fill);
    drawIsoPrism(g, 0, r * 0.3, r * 0.88, r * 0.24, r * 0.2, fillN);
    drawIsoPrism(g, -r * 0.58, r * 0.14, r * 0.2, r * 0.1, r * 0.3, fillN);
    drawIsoPrism(g, r * 0.58, r * 0.14, r * 0.2, r * 0.1, r * 0.3, fillN);
    for (let i = -1; i <= 1; i++) {
      g.rect(i * r * 0.28 - r * 0.05, -r * 0.04, r * 0.1, r * 0.12).fill(accent);
    }
  },
  frost_spire: (g, size, fill, accent) => {
    const r = size / 2;
    const fillN = parseHex(fill);
    const accentN = parseHex(accent);
    drawIsoPlate(g, 0, r * 0.34, r * 0.58, r * 0.24, shade(fillN, 0.42));
    drawIsoPlate(g, 0, r * 0.2, r * 0.44, r * 0.18, fillN);
    drawIsoPyramid(g, -r * 0.3, r * 0.04, r * 0.14, r * 0.1, r * 0.68, fillN);
    drawIsoPyramid(g, r * 0.34, -r * 0.02, r * 0.12, r * 0.08, r * 0.55, shade(fillN, 0.88));
    drawIsoPyramid(g, 0, -r * 0.14, r * 0.16, r * 0.1, r * 0.88, accentN);
    drawIsoPyramid(g, r * 0.08, r * 0.24, r * 0.08, r * 0.05, r * 0.32, shade(accentN, 0.75));
    g.moveTo(-r * 0.4, -r * 0.04).lineTo(r * 0.4, -r * 0.04).stroke({ width: 1.5, color: accent, alpha: 0.85 });
  },
  inferno_beacon: (g, size, fill, accent) => {
    const r = size / 2;
    const fillN = parseHex(fill);
    drawIsoPrism(g, 0, r * 0.38, r * 0.52, r * 0.26, r * 0.28, fillN);
    drawIsoPrism(g, 0, -r * 0.06, r * 0.2, r * 0.1, r * 0.52, fillN);
    g.circle(0, -r * 0.78, r * 0.2).fill(accent).stroke({ width: 1.5, color: OUTLINE });
    g.arc(0, -r * 0.78, r * 0.35, -Math.PI * 0.8, Math.PI * 0.15).stroke({ width: 2, color: accent });
    g.arc(0, -r * 0.78, r * 0.46, Math.PI * 0.22, Math.PI * 0.95).stroke({ width: 1.5, color: accent, alpha: 0.7 });
  },
  storm_conductor: (g, size, fill, accent) => {
    const r = size / 2;
    const fillN = parseHex(fill);
    drawIsoPrism(g, 0, r * 0.4, r * 0.7, r * 0.28, r * 0.28, fillN);
    drawIsoPrism(g, -r * 0.3, r * 0.02, r * 0.12, r * 0.08, r * 0.75, fillN);
    drawIsoPrism(g, r * 0.3, -r * 0.04, r * 0.12, r * 0.08, r * 0.88, fillN);
    drawIsoPrism(g, 0, -r * 0.52, r * 0.52, r * 0.08, r * 0.1, fillN);
    g.moveTo(-r * 0.12, -r * 0.72).lineTo(r * 0.16, -r * 0.12).lineTo(-r * 0.04, -r * 0.12).lineTo(r * 0.22, r * 0.42).stroke({ width: 2.5, color: accent });
    g.circle(-r * 0.4, r * 0.12, r * 0.07).fill(accent);
    g.circle(r * 0.42, -r * 0.32, r * 0.07).fill(accent);
  },
  celestial_cannon: (g, size, fill, accent) => {
    const r = size / 2;
    const fillN = parseHex(fill);
    const accentN = parseHex(accent);
    drawIsoPlate(g, 0, r * 0.42, r * 0.95, r * 0.38, shade(fillN, 0.45));
    drawIsoPrism(g, 0, r * 0.28, r * 0.72, r * 0.34, r * 0.32, fillN);
    drawIsoPrism(g, 0, r * 0.02, r * 0.48, r * 0.24, r * 0.42, shade(fillN, 0.92));
    drawIsoPyramid(g, 0, -r * 0.18, r * 0.22, r * 0.12, r * 0.72, fillN);
    for (let i = 0; i < 3; i++) {
      const y = r * 0.32 - i * r * 0.18;
      g.moveTo(-r * 0.38, y).lineTo(r * 0.38, y).stroke({ width: 1.2, color: accent, alpha: 0.5 });
    }
    g.circle(0, -r * 1.02, r * 0.14).fill(accentN).stroke({ width: 1.5, color: OUTLINE });
    g.poly([0, -r * 1.22, r * 0.1, -r * 1.02, 0, -r * 0.82, -r * 0.1, -r * 1.02])
      .fill(shade(accentN, 0.85))
      .stroke({ width: 1, color: OUTLINE, alpha: 0.8 });
  },
  sanctuary_spire: (g, size, fill, accent) => {
    const r = size / 2;
    const fillN = parseHex(fill);
    drawIsoPrism(g, 0, r * 0.44, r * 0.46, r * 0.2, r * 0.28, fillN);
    drawIsoPyramid(g, 0, r * 0.08, r * 0.28, r * 0.14, r * 1.02, fillN);
    g.circle(0, -r * 0.58, r * 0.3).stroke({ width: 1.5, color: accent, alpha: 0.8 });
    g.moveTo(0, -r * 0.92).lineTo(0, -r * 0.38).stroke({ width: 2.5, color: accent });
    g.moveTo(-r * 0.26, -r * 0.58).lineTo(r * 0.26, -r * 0.58).stroke({ width: 2.5, color: accent });
  },
};

function drawShape(
  g: Graphics,
  shape: ShapeKind,
  size: number,
  fill: string,
  accent: string,
  direction = 0,
  sprite = '',
): void {
  if (sprite && ORTHO_DESIGNS[sprite]) {
    ORTHO_DESIGNS[sprite](g, size, fill, accent, direction);
    return;
  }

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

/** Oblique-view voxel-style box: ground footprint diamond centered at (0, 0). */
function drawObliqueBox(
  g: Graphics,
  shape: ShapeKind,
  size: number,
  fill: string,
  accent: string,
  direction: number,
  sprite = '',
): void {
  if (sprite && OBLIQUE_DESIGNS[sprite]) {
    OBLIQUE_DESIGNS[sprite](g, size, fill, accent, direction);
    return;
  }

  const isBuilding = shape === 'building' || (sprite && ORTHO_DESIGNS[sprite] && !isUnitSprite(sprite));
  const isWide = isBuilding || shape === 'hexagon';
  const props = sprite ? OBLIQUE_PROPS[sprite] : undefined;
  const w = size * (props?.wMul ?? (isWide ? 1.05 : 0.82));
  const boxH = size * (props?.hMul ?? (isBuilding ? 0.62 : shape === 'hexagon' ? 0.38 : 0.48));
  const hw = w * 0.46;
  const hh = w * 0.22;
  const fillN = parseHex(fill);
  const accentN = parseHex(accent);
  const wallDark = shade(fillN, 0.42);
  const wallMid = shade(fillN, 0.62);
  const topLift = -boxH;

  const gRight = { x: hw, y: 0 };
  const gBottom = { x: 0, y: hh };
  const gLeft = { x: -hw, y: 0 };

  const top = { x: 0, y: topLift - hh };
  const right = { x: hw, y: topLift };
  const bottom = { x: 0, y: topLift + hh };
  const left = { x: -hw, y: topLift };

  g.poly([gRight.x, gRight.y, gBottom.x, gBottom.y, bottom.x, bottom.y, right.x, right.y])
    .fill(wallMid)
    .stroke({ width: 1.5, color: OUTLINE });
  g.poly([gBottom.x, gBottom.y, gLeft.x, gLeft.y, left.x, left.y, bottom.x, bottom.y])
    .fill(wallDark)
    .stroke({ width: 1.5, color: OUTLINE });
  g.poly([gRight.x, gRight.y, right.x, right.y, bottom.x, bottom.y, gBottom.x, gBottom.y])
    .fill(wallMid)
    .stroke({ width: 1.5, color: OUTLINE });

  g.poly([top.x, top.y, right.x, right.y, bottom.x, bottom.y, left.x, left.y])
    .fill(fillN)
    .stroke({ width: 2, color: OUTLINE });

  if (sprite && GLYPHS[sprite]) {
    const glyphR = Math.min(hw, hh) * 1.1;
    const glyphG = new Graphics();
    GLYPHS[sprite](glyphG, glyphR, accent, direction);
    glyphG.position.set(0, topLift);
    g.addChild(glyphG);
  } else {
    const ah = hh * 0.42;
    const aw = hw * 0.42;
    g.poly([0, topLift - ah, aw, topLift, 0, topLift + ah, -aw, topLift])
      .fill(accentN)
      .stroke({ width: 1, color: OUTLINE, alpha: 0.85 });
  }

  if (!isBuilding) {
    const ah = hh * 0.42;
    const ang = (direction / 8) * Math.PI * 2 - Math.PI / 2;
    const cx = Math.cos(ang) * hw * 0.35;
    const cy = topLift + Math.sin(ang) * hh * 0.35;
    const tx = cx + Math.cos(ang) * hw * 0.28;
    const ty = cy + Math.sin(ang) * ah * 0.35;
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
    const sprite = art.sprite ?? '';
    const isBuildingDesign = sprite && ORTHO_DESIGNS[sprite] && !isUnitSprite(sprite);
    const dir = art.shape === 'building' || isBuildingDesign ? 0 : direction % 8;
    const key = `${mode}:${sprite}:${art.shape}:${art.size}:${teamColor}:${art.accent}:${dir}`;
    let tex = this.cache.get(key);
    if (!tex) {
      const g = new Graphics();
      if (mode === 'oblique') {
        drawObliqueBox(g, art.shape, art.size, teamColor, art.accent, dir, sprite);
      } else {
        drawShape(g, art.shape, art.size, teamColor, art.accent, dir, sprite);
      }
      tex = this.renderer.generateTexture({ target: g, resolution: 2 });
      g.destroy();
      this.cache.set(key, tex);
    }
    return tex;
  }

  iconTexture(art: ArtDef, teamColor: string): Texture {
    const sprite = art.sprite ?? '';
    const key = `icon:${sprite}:${art.shape}:${art.size}:${teamColor}:${art.accent}`;
    let tex = this.cache.get(key);
    if (!tex) {
      const g = new Graphics();
      drawShape(g, art.shape, art.size, teamColor, art.accent, 0, sprite);
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

  iconTexture(_art: ArtDef, _teamColor: string): Texture {
    throw new Error('AtlasSpriteProvider not implemented — use ShapeSpriteProvider until art assets exist');
  }
}
