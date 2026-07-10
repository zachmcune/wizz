// Continuous tower beam visuals — magical flame stream and freezing energy (not laser-like).
import type { Registry } from '../data/registry';
import type { GameState, PlayerId } from '../sim/types';
import { isVisibleTo } from '../sim/views';
import { getBeamWeapon } from '../sim/capabilities';
import type { NavGrid } from '../sim/nav-grid';
import type { GraphicsPool } from './graphics-pool';

export type BeamDrawPosFn = (worldX: number, worldY: number) => { x: number; y: number };

/** Visual-only scale — gameplay hit cones use raw beam widths from data. */
const BEAM_VISUAL_SCALE = 0.72;

function detRand(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function beamEndpoint(
  sx: number,
  sy: number,
  facing: number,
  range: number,
  wobble: number,
): { ex: number; ey: number } {
  const wobbleAmt = Math.sin(wobble * 2.1) * 3 + Math.sin(wobble * 5.3) * 1.5;
  const angle = facing + wobbleAmt * 0.012;
  return { ex: sx + Math.cos(angle) * range, ey: sy + Math.sin(angle) * range };
}

function drawFlameBeam(
  strokePool: GraphicsPool,
  fillPool: GraphicsPool,
  sx: number,
  sy: number,
  ex: number,
  ey: number,
  startW: number,
  endW: number,
  phase: number,
  seed: number,
): void {
  const dx = ex - sx;
  const dy = ey - sy;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;

  const segments = 10;
  for (let layer = 0; layer < 4; layer++) {
    const g = strokePool.acquire();
    const colors = [0xfff4e8, 0xffc04a, 0xff6a1a, 0xc42a10];
    const widths = [startW * 0.22, startW * 0.55, startW * 0.85, endW * 0.95];
    const alpha = [0.95, 0.82, 0.65, 0.45][layer]!;
    const width = widths[layer]! * (0.92 + Math.sin(phase * 4 + layer) * 0.08);
    g.moveTo(sx, sy);
    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      const flicker = Math.sin(phase * 7 + i * 1.3 + seed) * (4 + layer * 2) * BEAM_VISUAL_SCALE;
      const px = sx + dx * t + nx * flicker * (0.15 + layer * 0.08);
      const py = sy + dy * t + ny * flicker * (0.15 + layer * 0.08);
      const half = width * (0.35 + t * 0.65) * 0.5;
      if (i === 1) g.lineTo(px + nx * half, py + ny * half);
      else g.lineTo(px + nx * half, py + ny * half);
    }
    for (let i = segments; i >= 0; i--) {
      const t = i / segments;
      const flicker = Math.sin(phase * 7 + i * 1.3 + seed + 2) * (4 + layer * 2) * BEAM_VISUAL_SCALE;
      const px = sx + dx * t + nx * flicker * (0.15 + layer * 0.08);
      const py = sy + dy * t + ny * flicker * (0.15 + layer * 0.08);
      const half = width * (0.35 + t * 0.65) * 0.5;
      g.lineTo(px - nx * half, py - ny * half);
    }
    g.closePath().fill({ color: colors[layer]!, alpha });
  }

  // White-hot core ribbon
  const core = strokePool.acquire();
  core.moveTo(sx, sy);
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const flicker = Math.sin(phase * 9 + i * 2.1 + seed) * 2.5 * BEAM_VISUAL_SCALE;
    core.lineTo(sx + dx * t + nx * flicker * 0.06, sy + dy * t + ny * flicker * 0.06);
  }
  core.stroke({ width: Math.max(1.5, startW * 0.18), color: 0xffffff, alpha: 0.92 });

  // Embers along the stream
  for (let i = 0; i < 5; i++) {
    const t = detRand(seed + i * 3.7) * 0.85 + 0.05;
    const drift = Math.sin(phase * 3 + i * 1.7) * 6 * BEAM_VISUAL_SCALE;
    const px = sx + dx * t + nx * drift;
    const py = sy + dy * t + ny * drift;
    const r = (1.2 + detRand(seed + i) * 2.2) * BEAM_VISUAL_SCALE;
    fillPool.acquire().circle(px, py, r).fill({ color: i % 2 === 0 ? 0xffe8a0 : 0xff6a20, alpha: 0.55 + detRand(seed + i * 2) * 0.35 });
  }

  // Impact glow + smoke
  const impact = fillPool.acquire();
  const pulse = 0.85 + Math.sin(phase * 6) * 0.15;
  impact.circle(ex, ey, endW * 0.35 * pulse).fill({ color: 0xfff0d0, alpha: 0.55 });
  impact.circle(ex, ey, endW * 0.55 * pulse).fill({ color: 0xff7a30, alpha: 0.28 });
  for (let i = 0; i < 3; i++) {
    const ang = detRand(seed + i * 5.1) * Math.PI * 2 + phase * 0.4;
    const dist = endW * (0.2 + detRand(seed + i * 1.9) * 0.35);
    const smx = ex + Math.cos(ang) * dist;
    const smy = ey + Math.sin(ang) * dist - Math.abs(Math.sin(phase + i)) * 8 * BEAM_VISUAL_SCALE;
    fillPool.acquire().circle(smx, smy, (3 + detRand(seed + i) * 5) * BEAM_VISUAL_SCALE).fill({ color: 0x6a5a4a, alpha: 0.18 + detRand(seed + i * 3) * 0.12 });
  }
}

function drawFrostBeam(
  strokePool: GraphicsPool,
  fillPool: GraphicsPool,
  sx: number,
  sy: number,
  ex: number,
  ey: number,
  startW: number,
  endW: number,
  phase: number,
  seed: number,
): void {
  const dx = ex - sx;
  const dy = ey - sy;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const segments = 12;

  const mist = strokePool.acquire();
  mist.moveTo(sx, sy);
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const swirl = Math.sin(phase * 2.5 + t * 8 + seed) * (8 + t * 10) * BEAM_VISUAL_SCALE;
    mist.lineTo(sx + dx * t + nx * swirl * 0.12, sy + dy * t + ny * swirl * 0.12);
  }
  mist.stroke({ width: endW * 0.7, color: 0xc8f0ff, alpha: 0.22 });

  const stream = strokePool.acquire();
  stream.moveTo(sx, sy);
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const wobble = Math.sin(phase * 4 + i * 1.1 + seed) * 3 * BEAM_VISUAL_SCALE;
    stream.lineTo(sx + dx * t + nx * wobble * 0.08, sy + dy * t + ny * wobble * 0.08);
  }
  stream.stroke({ width: Math.max(1.5, startW * 0.45), color: 0xe8fcff, alpha: 0.9 });

  const outer = strokePool.acquire();
  outer.moveTo(sx, sy);
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const wobble = Math.sin(phase * 3.2 + i * 0.9 + seed + 1) * 5 * BEAM_VISUAL_SCALE;
    outer.lineTo(sx + dx * t + nx * wobble * 0.14, sy + dy * t + ny * wobble * 0.14);
  }
  outer.stroke({ width: endW * 0.55, color: 0x6ec8ff, alpha: 0.35 });

  // Drifting snow particles
  for (let i = 0; i < 6; i++) {
    const t = detRand(seed + i * 2.3) * 0.9 + 0.05;
    const drift = Math.sin(phase * 1.8 + i) * 10 * BEAM_VISUAL_SCALE;
    const px = sx + dx * t + nx * drift;
    const py = sy + dy * t + ny * drift + Math.sin(phase * 2 + i) * 4 * BEAM_VISUAL_SCALE;
    const r = (1 + detRand(seed + i) * 1.5) * BEAM_VISUAL_SCALE;
    fillPool.acquire().circle(px, py, r).fill({ color: 0xffffff, alpha: 0.5 + detRand(seed + i * 4) * 0.4 });
  }

  // Rotating ice crystals near the beam tip
  for (let i = 0; i < 3; i++) {
    const ang = phase * 1.2 + i * (Math.PI / 2);
    const dist = endW * (0.25 + detRand(seed + i) * 0.2);
    const cx = ex + Math.cos(ang) * dist;
    const cy = ey + Math.sin(ang) * dist;
    const crystal = strokePool.acquire();
    const s = (3 + detRand(seed + i * 7) * 3) * BEAM_VISUAL_SCALE;
    crystal.moveTo(cx, cy - s).lineTo(cx + s * 0.6, cy).lineTo(cx, cy + s).lineTo(cx - s * 0.6, cy).closePath().stroke({ width: 1.2, color: 0xd8f8ff, alpha: 0.75 });
  }

  // Icy vapor at impact
  const vapor = fillPool.acquire();
  vapor.circle(ex, ey, endW * 0.4).fill({ color: 0xb8ecff, alpha: 0.25 });
  for (let i = 0; i < 4; i++) {
    const ang = detRand(seed + i * 4.2) * Math.PI * 2;
    const dist = endW * (0.15 + detRand(seed + i * 2.8) * 0.35);
    fillPool.acquire().circle(ex + Math.cos(ang) * dist, ey + Math.sin(ang) * dist, (2 + detRand(seed + i) * 4) * BEAM_VISUAL_SCALE).fill({ color: 0xe8fcff, alpha: 0.15 });
  }

  // Sparkling frost particles
  for (let i = 0; i < 4; i++) {
    const t = detRand(seed + i * 6.1);
    const px = sx + dx * t;
    const py = sy + dy * t;
    if (Math.sin(phase * 10 + i * 3 + seed) > 0.2) {
      fillPool.acquire().circle(px + nx * detRand(seed + i) * 6 * BEAM_VISUAL_SCALE, py + ny * detRand(seed + i + 1) * 6 * BEAM_VISUAL_SCALE, 1.2 * BEAM_VISUAL_SCALE).fill({ color: 0xffffff, alpha: 0.9 });
    }
  }
}

export function renderTowerBeams(
  state: GameState,
  registry: Registry,
  viewerId: PlayerId,
  nav: NavGrid | null,
  revealAll: boolean,
  drawPos: BeamDrawPosFn,
  fillPool: GraphicsPool,
  strokePool: GraphicsPool,
  animPhase: number,
): void {
  for (const e of state.entities.values()) {
    const beamState = getBeamWeapon(e);
    if (e.kind !== 'building' || !beamState) continue;
    if (!revealAll && nav && !isVisibleTo(state, viewerId, e, nav)) continue;

    const def = registry.buildings.get(e.defId);
    const w = def?.weapon;
    const beam = w?.beam;
    if (!w || !beam) continue;

    const src = drawPos(e.pos.x, e.pos.y);
    const end = beamEndpoint(e.pos.x, e.pos.y, beamState.facing, w.range, beamState.wobblePhase + animPhase * 0.05);
    const dst = drawPos(end.ex, end.ey);
    const phase = beamState.wobblePhase + animPhase * 0.08;
    const seed = e.id * 0.17 + state.tick * 0.03;

    const visStart = beam.startWidth * BEAM_VISUAL_SCALE;
    const visEnd = beam.endWidth * BEAM_VISUAL_SCALE;
    if (beam.kind === 'flame') {
      drawFlameBeam(strokePool, fillPool, src.x, src.y, dst.x, dst.y, visStart, visEnd, phase, seed);
    } else {
      drawFrostBeam(strokePool, fillPool, src.x, src.y, dst.x, dst.y, visStart, visEnd, phase, seed);
    }
  }
}

/** Icy tint for units/buildings accumulating frost beam exposure. */
export function frostExposureTint(exposure: number | undefined): number {
  if (!exposure || exposure <= 0) return 0xffffff;
  const t = Math.min(exposure, 20) / 20;
  const r = Math.round(255 * (1 - t) + 168 * t);
  const g = Math.round(255 * (1 - t) + 232 * t);
  const b = Math.round(255 * (1 - t) + 255 * t);
  return (r << 16) | (g << 8) | b;
}
