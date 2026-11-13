// Map linting: proves a map is actually playable before it can ship.
//
// Schema validation only checks that a map is *well-formed*. These checks are about whether a
// player can win on it, and every one of them corresponds to a way v1 could ship a broken map:
//
//   1. REACHABILITY — every start location can reach every other on foot. A cliff ring with no
//      ramp, or a wall with no gap, silently makes a map unwinnable.
//   2. NODE PROXIMITY — every start has a mana node within a sane haul. A start with no node is
//      a guaranteed loss, and v1's schema would have accepted it.
//   3. BUILD SPACE — there is room for the opening buildings near each start. A start wedged
//      between cliffs cannot place a refinery and therefore cannot earn.
//   4. NODE ACCESS — each node is reachable on foot from at least one start (a node inside a
//      sealed pocket is decoration, not a resource).
//   5. FOOTPRINT LEGALITY — the largest footprint (3x3) fits on a single height level somewhere
//      near each start, which is what every construction-yard-sized building needs.
//
// The flood fill here intentionally mirrors the sim's step rule (equal height anywhere, +/-1 only
// via a ramp) so the linter cannot pass a map the pathfinder would fail on.

import { TILE, TILE_BLOCKED, TILE_RAMP } from './core/constants';
import type { MapData } from './data/defs';

export interface MapIssue {
  mapId: string;
  check: string;
  message: string;
}

/** Flood fill over walkable ground honouring the height-step rule. Returns reachable tile flags. */
export function reachableFrom(map: MapData, startTx: number, startTy: number): Uint8Array {
  const n = map.tileW * map.tileH;
  const seen = new Uint8Array(n);
  if (startTx < 0 || startTy < 0 || startTx >= map.tileW || startTy >= map.tileH) return seen;

  const canStep = (fx: number, fy: number, tx: number, ty: number): boolean => {
    if (tx < 0 || ty < 0 || tx >= map.tileW || ty >= map.tileH) return false;
    const fi = fy * map.tileW + fx;
    const ti = ty * map.tileW + tx;
    if (map.tiles[ti] === TILE_BLOCKED) return false;
    const hf = map.heights[fi] ?? 0;
    const ht = map.heights[ti] ?? 0;
    if (hf === ht) return true;
    const rampHere = map.tiles[fi] === TILE_RAMP;
    const rampThere = map.tiles[ti] === TILE_RAMP;
    return Math.abs(hf - ht) === 1 && (rampHere || rampThere);
  };

  const startIdx = startTy * map.tileW + startTx;
  if (map.tiles[startIdx] === TILE_BLOCKED) return seen;

  const queue: number[] = [startIdx];
  seen[startIdx] = 1;
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head]!;
    const cx = cur % map.tileW;
    const cy = (cur - cx) / map.tileW;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (!canStep(cx, cy, nx, ny)) continue;
        // No corner cutting: a diagonal move needs both orthogonal neighbours passable.
        if (dx !== 0 && dy !== 0) {
          if (!canStep(cx, cy, cx + dx, cy)) continue;
          if (!canStep(cx, cy, cx, cy + dy)) continue;
        }
        const ni = ny * map.tileW + nx;
        if (seen[ni]) continue;
        seen[ni] = 1;
        queue.push(ni);
      }
    }
  }
  return seen;
}

function tileOf(worldX: number, worldY: number): { tx: number; ty: number } {
  return { tx: Math.floor(worldX / TILE), ty: Math.floor(worldY / TILE) };
}

/** True if a `footprint`-square building anchored at (tx,ty) sits on one height level. */
function footprintFlat(map: MapData, tx: number, ty: number, footprint: number): boolean {
  let h: number | null = null;
  for (let dy = 0; dy < footprint; dy++) {
    for (let dx = 0; dx < footprint; dx++) {
      const x = tx + dx;
      const y = ty + dy;
      if (x >= map.tileW || y >= map.tileH) return false;
      const i = y * map.tileW + x;
      if (map.tiles[i] === TILE_BLOCKED) return false;
      const hh = map.heights[i] ?? 0;
      if (h === null) h = hh;
      else if (hh !== h) return false;
    }
  }
  return h !== null;
}

/** Is there any legal flat spot for a building of this footprint within `radius` tiles of a point? */
function hasBuildSpace(map: MapData, cx: number, cy: number, footprint: number, radius: number): boolean {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const tx = cx + dx;
      const ty = cy + dy;
      if (tx < 0 || ty < 0) continue;
      if (footprintFlat(map, tx, ty, footprint)) return true;
    }
  }
  return false;
}

const MAX_NODE_HAUL_TILES = 26;
const MIN_BUILD_RADIUS = 6;

export function lintMap(map: MapData): MapIssue[] {
  const issues: MapIssue[] = [];
  const push = (check: string, message: string) => issues.push({ mapId: map.id, check, message });

  const starts = map.startLocations.map((s) => tileOf(s.x, s.y));

  // 1. Every start reaches every other start.
  if (starts.length >= 2) {
    const reach = reachableFrom(map, starts[0]!.tx, starts[0]!.ty);
    for (let i = 1; i < starts.length; i++) {
      const s = starts[i]!;
      if (!reach[s.ty * map.tileW + s.tx]) {
        push(
          'reachability',
          `start ${i} at tile (${s.tx},${s.ty}) is NOT reachable on foot from start 0 at (${starts[0]!.tx},${starts[0]!.ty})`,
        );
      }
    }
  }

  // 2 + 3. Node proximity and build space per start.
  for (const [i, s] of starts.entries()) {
    const nearest = Math.min(
      ...map.manaNodes.map((n) => Math.hypot(n.x - (s.tx * TILE + TILE / 2), n.y - (s.ty * TILE + TILE / 2))),
    );
    if (!Number.isFinite(nearest) || nearest > MAX_NODE_HAUL_TILES * TILE) {
      push(
        'node-proximity',
        `start ${i} has no mana node within ${MAX_NODE_HAUL_TILES} tiles (nearest ${(nearest / TILE).toFixed(1)})`,
      );
    }
    if (!hasBuildSpace(map, s.tx, s.ty, 3, MIN_BUILD_RADIUS)) {
      push('build-space', `start ${i} has no legal 3x3 building spot within ${MIN_BUILD_RADIUS} tiles`);
    }
  }

  // 4. Every node is reachable from at least one start.
  if (starts.length >= 1) {
    const unions = starts.map((s) => reachableFrom(map, s.tx, s.ty));
    for (const [i, node] of map.manaNodes.entries()) {
      const t = tileOf(node.x, node.y);
      const idx = t.ty * map.tileW + t.tx;
      const ok = unions.some((r) => r[idx] === 1);
      if (!ok) push('node-access', `manaNodes[${i}] at tile (${t.tx},${t.ty}) is not reachable from any start`);
    }
  }

  return issues;
}

export function lintMaps(maps: Iterable<MapData>): MapIssue[] {
  const out: MapIssue[] = [];
  for (const m of maps) out.push(...lintMap(m));
  return out;
}
