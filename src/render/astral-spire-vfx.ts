// Astral Spire presentation — captured-star idle, sky tether, charge/fire tells.
// Reads sim state (power, spell cooldown, superweapon beams); never affects gameplay.
import type { Registry } from '../data/registry';
import type { GameState, PlayerId } from '../sim/types';
import { isVisibleTo, buildingHasPower, getPlayer, isAlive } from '../sim/views';
import type { NavGrid } from '../sim/nav-grid';
import type { GraphicsPool } from './graphics-pool';
import { detRand, lerpColor, drawFloatingMotes, drawGroundRuneCircle } from './support-aura-vfx';
import { vfxCount, vfxDecorEnabled } from './vfx-quality';

export type AstralDrawPosFn = (worldX: number, worldY: number) => { x: number; y: number };

const STARLIGHT = 0x9fdcff;
const VIOLET = 0xb8a0ff;
const GOLD = 0xffe08a;
const HOT = 0xfff4d0;
const HOT_CORE = 0xffffff;

/** Screen-space lifts matching `OBLIQUE_DESIGNS.astral_spire` at art.size 80. */
const STAR_LIFT = 109;
const RING_LIFT = 77;
const HALO_LIFT = 98;

type SpireMood = 'ready' | 'charging' | 'firing' | 'cooldown';

function drawGyroRing(
  strokePool: GraphicsPool,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  spin: number,
  color: number,
  alpha: number,
  width: number,
  segments = 22,
): void {
  const g = strokePool.acquire();
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2 + spin;
    const px = cx + Math.cos(a) * rx;
    const py = cy + Math.sin(a) * ry;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.stroke({ width, color, alpha });
}

function drawSkyTether(
  strokePool: GraphicsPool,
  fillPool: GraphicsPool,
  cx: number,
  cy: number,
  intensity: number,
  phase: number,
): void {
  const top = cy - 160 - intensity * 80;
  const width = 1.6 + intensity * 7;
  const color = lerpColor(STARLIGHT, HOT_CORE, intensity);
  strokePool.acquire().moveTo(cx, cy).lineTo(cx, top).stroke({
    width: width * 1.8,
    color: STARLIGHT,
    alpha: 0.12 + intensity * 0.28,
  });
  strokePool.acquire().moveTo(cx, cy).lineTo(cx, top).stroke({
    width,
    color,
    alpha: 0.22 + intensity * 0.55,
  });
  strokePool.acquire().moveTo(cx, cy).lineTo(cx, top).stroke({
    width: width * 0.28,
    color: HOT_CORE,
    alpha: 0.35 + intensity * 0.5,
  });

  const vortexY = top + 18;
  const vortexR = 10 + intensity * 14;
  const vortex = strokePool.acquire();
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * Math.PI * 2 + phase * 0.7;
    const rad = vortexR * (0.62 + Math.sin(a * 3 + phase) * 0.14);
    const vx = cx + Math.cos(a) * rad;
    const vy = vortexY + Math.sin(a) * rad * 0.32;
    if (i === 0) vortex.moveTo(vx, vy);
    else vortex.lineTo(vx, vy);
  }
  vortex.stroke({ width: 1.4, color: VIOLET, alpha: 0.16 + intensity * 0.4 });
  fillPool.acquire().circle(cx, vortexY, vortexR * 0.35).fill({
    color: STARLIGHT,
    alpha: 0.06 + intensity * 0.14,
  });
}

function drawCapturedStar(
  fillPool: GraphicsPool,
  strokePool: GraphicsPool,
  cx: number,
  cy: number,
  glow: number,
  phase: number,
): void {
  const bob = Math.sin(phase * 0.55) * 1.6;
  const sy = cy + bob;
  const pulse = 0.65 + Math.sin(phase * 1.8) * 0.35;
  const coreR = 5.5 + glow * 5;
  const color = lerpColor(STARLIGHT, HOT, glow);
  fillPool.acquire().circle(cx, sy, coreR * 2.1).fill({ color, alpha: (0.12 + glow * 0.28) * pulse });
  fillPool.acquire().circle(cx, sy, coreR).fill({
    color: lerpColor(color, HOT_CORE, 0.45 + glow * 0.4),
    alpha: 0.7 + glow * 0.28,
  });
  const spike = strokePool.acquire();
  const outer = 11 + glow * 6;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2 + phase * 0.08;
    const inner = outer * 0.32;
    spike
      .moveTo(cx + Math.cos(a) * inner, sy + Math.sin(a) * inner)
      .lineTo(cx + Math.cos(a) * outer, sy + Math.sin(a) * outer);
  }
  spike.stroke({ width: 1.3, color: HOT_CORE, alpha: 0.45 + glow * 0.45 });
  fillPool.acquire().circle(cx, sy, 2.4 + glow).fill({ color: HOT_CORE, alpha: 0.95 });
}

function moodFor(
  state: GameState,
  owner: PlayerId,
  spellId: string,
  chargeTicks: number,
  cooldownTicks: number,
): { mood: SpireMood; intensity: number; spin: number } {
  const beam = state.beams.find((b) => b.owner === owner && b.spellId === spellId);
  if (beam?.state === 'firing') {
    return { mood: 'firing', intensity: 1, spin: 3.2 };
  }
  if (beam?.state === 'charging') {
    const remaining = Math.max(0, beam.fireTick - state.tick);
    const t = 1 - remaining / Math.max(1, chargeTicks);
    return { mood: 'charging', intensity: 0.35 + t * 0.65, spin: 0.7 + t * 2.4 };
  }
  const player = getPlayer(state, owner);
  const cd = player?.spellCooldowns[spellId] ?? 0;
  if (cd > 0) {
    const recovered = 1 - cd / Math.max(1, cooldownTicks);
    return { mood: 'cooldown', intensity: 0.08 + recovered * 0.12, spin: 0.18 + recovered * 0.22 };
  }
  return { mood: 'ready', intensity: 0.28, spin: 0.55 };
}

export function renderAstralSpires(
  state: GameState,
  registry: Registry,
  viewerId: PlayerId,
  nav: NavGrid | null,
  revealAll: boolean,
  drawPos: AstralDrawPosFn,
  fillPool: GraphicsPool,
  strokePool: GraphicsPool,
  animPhase: number,
): void {
  const phase = animPhase;

  for (const e of state.entities.values()) {
    if (e.kind !== 'building' || e.defId !== 'astral_spire') continue;
    if (!isAlive(e) || e.buildProgress !== undefined) continue;
    if (!buildingHasPower(state, registry, e)) continue;
    if (!revealAll && nav && !isVisibleTo(state, viewerId, e, nav)) continue;

    const def = registry.buildings.get(e.defId);
    const spellId = def?.unlocksSpells?.[0];
    if (!spellId) continue;
    const spell = registry.spells.get(spellId);
    const chargeTicks = spell?.effect.kind === 'beam' ? spell.effect.chargeTicks : 100;
    const cooldownTicks = spell?.cooldownTicks ?? 4800;
    const { mood, intensity, spin } = moodFor(state, e.owner, spellId, chargeTicks, cooldownTicks);

    const p = drawPos(e.pos.x, e.pos.y);
    const starX = p.x;
    const starY = p.y - STAR_LIFT;
    const seed = e.id * 0.31;

    const runeAlpha = mood === 'firing' ? 0.85 : mood === 'charging' ? 0.45 + intensity * 0.4 : 0.22 + intensity * 0.35;
    drawGroundRuneCircle(
      strokePool,
      fillPool,
      p.x,
      p.y,
      e.radius * 0.72,
      phase * (mood === 'firing' || mood === 'charging' ? 0.45 : 0.12),
      mood === 'firing' ? GOLD : STARLIGHT,
      runeAlpha,
      8,
    );

    if (vfxDecorEnabled()) {
      drawGyroRing(
        strokePool,
        starX,
        p.y - RING_LIFT,
        18 + intensity * 4,
        6,
        phase * spin,
        lerpColor(STARLIGHT, HOT, intensity),
        0.4 + intensity * 0.4,
        1.4,
      );
      drawGyroRing(
        strokePool,
        starX,
        p.y - HALO_LIFT,
        13 + intensity * 3,
        4.5,
        -phase * spin * 0.72,
        lerpColor(VIOLET, HOT_CORE, intensity),
        0.32 + intensity * 0.4,
        1.2,
      );
      for (let i = 0; i < vfxCount(4); i++) {
        const t = detRand(seed + i * 2.7);
        const ang = phase * spin * 1.15 + t * Math.PI * 2;
        const dist = 10 + detRand(seed + i) * 8;
        const fx = starX + Math.cos(ang) * dist;
        const fy = starY + 16 + Math.sin(ang) * dist * 0.28;
        fillPool.acquire().poly([fx, fy - 2.4, fx + 1.8, fy, fx, fy + 2.4, fx - 1.8, fy]).fill({
          color: lerpColor(VIOLET, HOT, intensity),
          alpha: 0.45 + intensity * 0.4,
        });
      }
      drawFloatingMotes(
        fillPool,
        p.x,
        p.y - 24,
        22,
        vfxCount(mood === 'firing' ? 8 : 5),
        phase,
        seed,
        lerpColor(STARLIGHT, GOLD, intensity * 0.5),
        0.35 + intensity * 0.35,
      );
    }

    drawSkyTether(strokePool, fillPool, starX, starY, intensity, phase);
    drawCapturedStar(fillPool, strokePool, starX, starY, intensity, phase);

    if (mood === 'ready') {
      const flicker = 0.5 + Math.sin(phase * 3.2) * 0.5;
      if (flicker > 0.88) {
        fillPool.acquire().circle(starX, starY, 9).fill({ color: HOT_CORE, alpha: 0.18 });
      }
    }
  }
}
