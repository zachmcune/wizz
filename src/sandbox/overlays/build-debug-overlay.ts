import type { GameState } from '../../sim/types';
import type { SimServices } from '../../sim/context';
import type { Registry } from '../../data/registry';
import type { SandboxSettings } from '../../sim/sandbox-types';
import type { RenderOverlay } from '../../render/renderer';
import { TILE } from '../../core/constants';
import { isAlive } from '../../sim/queries';

export interface SandboxDebugOverlay extends RenderOverlay {
  debugCircles?: { x: number; y: number; r: number; color: number; alpha?: number }[];
  debugLines?: { x1: number; y1: number; x2: number; y2: number; color: number }[];
  debugLabels?: { x: number; y: number; text: string; color?: number }[];
  statsText?: string;
}

export function buildSandboxDebugOverlay(
  state: GameState,
  services: SimServices,
  registry: Registry,
  settings: SandboxSettings,
  fps: number,
  frameMs: number,
): SandboxDebugOverlay {
  const overlay: SandboxDebugOverlay = {};
  const lines: string[] = [];
  if (settings.overlays.fps) lines.push(`${fps.toFixed(0)} fps`);
  if (settings.overlays.frameTime) lines.push(`${frameMs.toFixed(1)} ms`);
  if (settings.overlays.memory && 'memory' in performance) {
    const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    if (mem) lines.push(`${(mem.usedJSHeapSize / 1048576).toFixed(1)} MB`);
  }
  lines.push(`tick ${state.tick} · entities ${state.entities.size}`);
  overlay.statsText = lines.join(' · ');

  overlay.debugCircles = [];
  overlay.debugLines = [];
  overlay.debugLabels = [];

  const o = settings.overlays;
  const needEntityPass =
    o.visionRadius ||
    o.attackRadius ||
    o.unitIds ||
    o.healthBars ||
    o.buildingFootprints ||
    o.currentTarget ||
    o.aiState ||
    o.currentPath ||
    o.collisionShapes ||
    o.cooldownTimers ||
    o.spellRadius ||
    o.pathfinding;

  if (needEntityPass) {
    for (const e of state.entities.values()) {
      if (!isAlive(e) || e.kind === 'resource_node' || e.kind === 'projectile') continue;

      if (o.collisionShapes) {
        overlay.debugCircles.push({ x: e.pos.x, y: e.pos.y, r: e.radius, color: 0xaa88ff, alpha: 0.2 });
      }

      if (e.kind === 'unit') {
        const udef = registry.units.get(e.defId);
        if (o.visionRadius && udef?.sight) {
          overlay.debugCircles.push({ x: e.pos.x, y: e.pos.y, r: udef.sight, color: 0x4f9dff, alpha: 0.15 });
        }
        if (o.attackRadius && udef?.weapon?.range) {
          overlay.debugCircles.push({ x: e.pos.x, y: e.pos.y, r: udef.weapon.range, color: 0xff5d5d, alpha: 0.12 });
        }
        if (o.unitIds) {
          overlay.debugLabels.push({ x: e.pos.x, y: e.pos.y - e.radius - 8, text: `#${e.id}`, color: 0xffffff });
        }
        if (o.healthBars) {
          overlay.debugLabels.push({
            x: e.pos.x,
            y: e.pos.y - e.radius - 20,
            text: `${Math.ceil(e.hp)}/${e.maxHp}`,
            color: 0x5cff8a,
          });
        }
        if (o.aiState) {
          const order = e.orders[0];
          const orderLabel = order ? order.type : e.state;
          overlay.debugLabels.push({
            x: e.pos.x,
            y: e.pos.y - e.radius - 32,
            text: orderLabel,
            color: 0xffd166,
          });
        }
        if (o.cooldownTimers) {
          const cds = Object.entries(e.cooldowns).filter(([, v]) => (v ?? 0) > 0);
          if (cds.length) {
            overlay.debugLabels.push({
              x: e.pos.x,
              y: e.pos.y + e.radius + 10,
              text: cds.map(([k, v]) => `${k}:${v}`).join(' '),
              color: 0xffaa66,
            });
          }
        }
        if (o.currentTarget && e.targetId !== undefined) {
          const target = state.entities.get(e.targetId);
          if (target && isAlive(target)) {
            overlay.debugLines.push({
              x1: e.pos.x,
              y1: e.pos.y,
              x2: target.pos.x,
              y2: target.pos.y,
              color: 0xff5d5d,
            });
          }
        }
        if (o.currentPath || o.pathfinding) {
          const order = e.orders[0];
          if (order && (order.type === 'move' || order.type === 'attackMove' || order.type === 'attack')) {
            const tx = 'x' in order ? order.x : undefined;
            const ty = 'y' in order ? order.y : undefined;
            if (typeof tx === 'number' && typeof ty === 'number') {
              overlay.debugLines.push({
                x1: e.pos.x,
                y1: e.pos.y,
                x2: tx,
                y2: ty,
                color: o.pathfinding ? 0x66ffcc : 0x9fdcff,
              });
            } else if (order.type === 'attack' && 'targetId' in order) {
              const target = state.entities.get(order.targetId);
              if (target) {
                overlay.debugLines.push({
                  x1: e.pos.x,
                  y1: e.pos.y,
                  x2: target.pos.x,
                  y2: target.pos.y,
                  color: 0xff8866,
                });
              }
            }
          }
        }
      } else if (e.kind === 'building') {
        const bdef = registry.buildings.get(e.defId);
        if (o.visionRadius && bdef?.sight) {
          overlay.debugCircles.push({ x: e.pos.x, y: e.pos.y, r: bdef.sight, color: 0x4f9dff, alpha: 0.1 });
        }
        if (o.buildingFootprints && bdef) {
          overlay.debugCircles.push({
            x: e.pos.x,
            y: e.pos.y,
            r: (bdef.footprint * TILE) / 2,
            color: 0xffd166,
            alpha: 0.08,
          });
        }
        if (o.unitIds) {
          overlay.debugLabels.push({ x: e.pos.x, y: e.pos.y - e.radius - 8, text: `#${e.id}`, color: 0xffffff });
        }
      }
    }
  }

  if (o.spellRadius) {
    const radii = new Set<number>();
    for (const spell of registry.spells.values()) {
      if (spell.aoeRadius > 0) radii.add(spell.aoeRadius);
    }
    const hq = [...state.entities.values()].find((e) => e.kind === 'building' && e.defId === 'sanctum' && isAlive(e));
    if (hq) {
      for (const r of radii) {
        overlay.debugCircles.push({ x: hq.pos.x, y: hq.pos.y, r, color: 0xc96ad0, alpha: 0.12 });
      }
    }
  }

  if (o.cooldownTimers) {
    for (const p of state.players) {
      const cds = Object.entries(p.spellCooldowns).filter(([, v]) => (v ?? 0) > 0);
      if (!cds.length) continue;
      const hq = [...state.entities.values()].find((e) => e.kind === 'building' && e.defId === 'sanctum' && e.owner === p.id);
      if (!hq) continue;
      overlay.debugLabels.push({
        x: hq.pos.x,
        y: hq.pos.y + 40,
        text: cds.map(([k, v]) => `${k}:${v}`).join(' '),
        color: 0xe0a0ff,
      });
    }
  }

  if (o.navigationGrid || o.collision) {
    const nav = services.nav;
    const map = registry.map(state.mapId);
    const step = o.collision ? 2 : 4;
    for (let ty = 0; ty < map.tileH; ty += step) {
      for (let tx = 0; tx < map.tileW; tx += step) {
        if (!nav.isBlocked(tx, ty)) continue;
        overlay.debugCircles.push({
          x: tx * TILE + TILE / 2,
          y: ty * TILE + TILE / 2,
          r: o.collision ? 8 : 6,
          color: o.collision ? 0xff4444 : 0x888888,
          alpha: o.collision ? 0.25 : 0.2,
        });
      }
    }
  }

  return overlay;
}
