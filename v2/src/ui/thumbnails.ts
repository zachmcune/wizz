// ATLAS THUMBNAILS — real sprite frames as DOM images, for build/production tiles.
//
// A Command & Conquer build sidebar is a grid of PICTURES of the thing you are buying. v2's atlas is a
// set of PixiJS textures cut from WebP pages plus a manifest of frame rects, which an `<img>` cannot
// address directly. This module turns a frame key into a CSS `background-image` + `background-position`
// pair over the page image, so a sidebar tile shows the SAME baked sprite the battlefield draws — no
// second art pipeline, no invented icons, no image generation.
//
// Everything here is derived from the loaded atlas manifest, so a tile can never show a frame that does
// not exist: `applyThumb` returns false and the caller falls back to the code-drawn icon set. That
// fallback path is covered by the roster test for every def in the content set.

import type { LoadedAtlas } from '../render/atlas';

/** Candidate team tints for a thumbnail, in preference order: the viewer's own tint first. */
const TEAM_ORDER = ['blue', 'red', 'green', 'gold'] as const;

export interface ThumbStyle {
  /** CSS `background-image` value pointing at the atlas page. */
  image: string;
  /** CSS `background-position` for the frame. */
  position: string;
  /** CSS `background-size` that renders the frame at the requested box size. */
  size: string;
  /** Natural frame size in atlas pixels, for aspect-ratio decisions. */
  frameW: number;
  frameH: number;
}

/**
 * A background-position/size pair that shows ONE frame scaled into a `boxW` x `boxH` box.
 *
 * `background-size` is set to the whole page scaled so the frame is exactly as large as it should be,
 * then a negative position lines the frame's top-left up with the box. Everything is computed in
 * pixels from the page's declared size, so the crop is exact at any device pixel ratio.
 */
export function thumbStyle(atlas: LoadedAtlas, key: string, boxW: number, boxH: number): ThumbStyle | null {
  const f = atlas.frames.get(key);
  if (!f) return null;
  const page = atlas.pageUrls[f.page];
  const ps = atlas.pageSizes[f.page];
  if (!page || !ps) return null;
  // Fit the frame inside the box, preserving aspect (contain).
  const scale = Math.min(boxW / f.w, boxH / f.h);
  const drawW = f.w * scale;
  const drawH = f.h * scale;
  const pageW = ps.width * scale;
  const pageH = ps.height * scale;
  const offsetX = -(f.x * scale) + (boxW - drawW) / 2;
  const offsetY = -(f.y * scale) + (boxH - drawH) / 2;
  return {
    image: `url("${page}")`,
    position: `${offsetX.toFixed(2)}px ${offsetY.toFixed(2)}px`,
    size: `${pageW.toFixed(2)}px ${pageH.toFixed(2)}px`,
    frameW: f.w,
    frameH: f.h,
  };
}

/**
 * The frame key for a def's thumbnail, trying each team tint in order.
 *
 * Buildings have one frame per tint; units have eight facings per tint, and the thumbnail uses facing
 * 0 (east) because that is the most legible single silhouette.
 */
export function thumbKeyFor(atlas: LoadedAtlas, kind: 'building' | 'unit', defId: string, preferTeam?: string): string | null {
  const order = preferTeam ? [preferTeam, ...TEAM_ORDER.filter((t) => t !== preferTeam)] : TEAM_ORDER;
  for (const team of order) {
    const key = kind === 'building' ? `building/${defId}/${team}/0` : `unit/${defId}/${team}/0`;
    if (atlas.frames.has(key)) return key;
  }
  return null;
}

/**
 * Apply a thumbnail to an element as its background.
 *
 * Returns false when no frame exists, so the caller can fall back to an icon rather than render an
 * empty square. The element is tagged with `data-thumb` holding the resolved frame key, which the proof
 * harness reads to assert a production tile is showing a real atlas frame rather than a placeholder.
 */
export function applyThumb(
  el: HTMLElement,
  atlas: LoadedAtlas,
  kind: 'building' | 'unit',
  defId: string,
  boxW: number,
  boxH: number,
  preferTeam?: string,
): boolean {
  const key = thumbKeyFor(atlas, kind, defId, preferTeam);
  if (!key) return false;
  const style = thumbStyle(atlas, key, boxW, boxH);
  if (!style) return false;
  el.style.backgroundImage = style.image;
  el.style.backgroundPosition = style.position;
  el.style.backgroundSize = style.size;
  el.style.backgroundRepeat = 'no-repeat';
  el.dataset.thumb = key;
  return true;
}

/** Team tint name for a sim colour, mirroring the renderer's own mapping. */
export function teamTintFor(hex: string): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const ref: [string, [number, number, number]][] = [
    ['blue', [79, 157, 255]],
    ['red', [255, 93, 93]],
    ['green', [92, 255, 138]],
    ['gold', [255, 209, 102]],
  ];
  let best = 'blue';
  let bestD = Infinity;
  for (const [id, c] of ref) {
    const d = (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2;
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
}
