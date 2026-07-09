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
  overlay.debugLabels = [];

  if (settings.overlays.visionRadius || settings.overlays.attackRadius) {
    for (const e of state.entities.values()) {
      if (!isAlive(e) || e.kind === 'resource_node' || e.kind === 'projectile') continue;
      if (e.kind === 'unit') {
        const udef = registry.units.get(e.defId);
        if (settings.overlays.visionRadius && udef?.sight) {
          overlay.debugCircles!.push({ x: e.pos.x, y: e.pos.y, r: udef.sight, color: 0x4f9dff, alpha: 0.15 });
        }
        if (settings.overlays.attackRadius && udef?.weapon?.range) {
          overlay.debugCircles!.push({ x: e.pos.x, y: e.pos.y, r: udef.weapon.range, color: 0xff5d5d, alpha: 0.12 });
        }
        if (settings.overlays.unitIds) {
          overlay.debugLabels!.push({ x: e.pos.x, y: e.pos.y - e.radius - 8, text: `#${e.id}`, color: 0xffffff });
        }
        if (settings.overlays.healthBars) {
          overlay.debugLabels!.push({
            x: e.pos.x,
            y: e.pos.y - e.radius - 20,
            text: `${Math.ceil(e.hp)}/${e.maxHp}`,
            color: 0x5cff8a,
          });
        }
      } else if (e.kind === 'building') {
        const bdef = registry.buildings.get(e.defId);
        if (settings.overlays.visionRadius && bdef?.sight) {
          overlay.debugCircles!.push({ x: e.pos.x, y: e.pos.y, r: bdef.sight, color: 0x4f9dff, alpha: 0.1 });
        }
        if (settings.overlays.buildingFootprints && bdef) {
          overlay.debugCircles!.push({
            x: e.pos.x,
            y: e.pos.y,
            r: (bdef.footprint * TILE) / 2,
            color: 0xffd166,
            alpha: 0.08,
          });
        }
      }
    }
  }

  if (settings.overlays.navigationGrid) {
    const nav = services.nav;
    const map = registry.map(state.mapId);
    for (let ty = 0; ty < map.tileH; ty += 4) {
      for (let tx = 0; tx < map.tileW; tx += 4) {
        if (!nav.isBlocked(tx, ty)) continue;
        overlay.debugCircles!.push({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2, r: 6, color: 0x888888, alpha: 0.2 });
      }
    }
  }

  return overlay;
}
