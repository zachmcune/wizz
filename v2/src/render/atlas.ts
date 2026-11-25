// Atlas loading: fetch each atlas manifest and its WebP pages, expose frame textures.
//
// The art is baked at build time by `v2/art/build-atlas.ts` into TWO atlases:
//   • units-*.webp     — 14 units x 8 facings x 4 team colours (448 frames)
//   • buildings-*.webp — 21 buildings x 4 team colours (84 frames)
// Splitting them keeps each pack dense (units are all one size) and lets the building atlas load
// lazily if a future map has no buildings to draw.

import { Assets, Rectangle, Texture } from 'pixi.js';

export interface FrameRect {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  pivotX: number;
  pivotY: number;
  /**
   * Opaque content bounds within the frame, in frame pixels (see `art/build-atlas3.ts`).
   *
   * A unit occupies roughly 16x23 of its 128x128 frame while a building occupies 66x62, so a thumbnail that scaled the
   * FRAME drew units at about a seventh of the tile — "two tiny dots" in the playtest report. The DOM thumbnail crops to
   * this rect instead; the renderer keeps using the whole frame so battlefield pivots stay aligned.
   */
  content?: { x: number; y: number; w: number; h: number };
}
export interface AtlasManifest {
  pages: { file: string; width: number; height: number }[];
  frames: Record<string, FrameRect>;
}

export interface LoadedAtlas {
  /** Frame key -> sub-texture. */
  textures: Map<string, Texture>;
  /** Frame key -> ground-origin pivot as a fraction of the frame. */
  pivots: Map<string, { x: number; y: number }>;
  /** Frame key -> source rect, for debugging and the gallery. */
  frames: Map<string, FrameRect>;
  /**
   * Source metadata for the DOM side of the UI.
   *
   * The build sidebar shows the SAME baked sprites the battlefield draws, as CSS background crops of
   * the atlas pages (`src/ui/thumbnails.ts`). That needs the page URLs and pixel sizes, which the
   * texture map alone does not carry.
   *
   * `pageBase` is the index of this manifest's first page within `pages`, so a frame's `page` field
   * addresses `pages` directly.
   */
  pageUrls: string[];
  pageSizes: { width: number; height: number }[];
}

export function unitFrameKey(defId: string, teamId: string, facing: number): string {
  return `unit/${defId}/${teamId}/${facing}`;
}

export function buildingFrameKey(defId: string, teamId: string): string {
  return `building/${defId}/${teamId}/0`;
}

interface OneAtlas {
  textures: Map<string, Texture>;
  pivots: Map<string, { x: number; y: number }>;
  frames: Map<string, FrameRect>;
  pageUrls: string[];
  pageSizes: { width: number; height: number }[];
}

async function loadOne(baseUrl: string, name: string): Promise<OneAtlas> {
  const manifest = (await (await fetch(`${baseUrl}${name}.json`)).json()) as AtlasManifest;
  const pageTextures: Texture[] = [];
  for (const page of manifest.pages) {
    pageTextures.push((await Assets.load(`${baseUrl}${page.file}`)) as Texture);
  }
  const textures = new Map<string, Texture>();
  const pivots = new Map<string, { x: number; y: number }>();
  const frames = new Map<string, FrameRect>();
  for (const [key, r] of Object.entries(manifest.frames)) {
    // A zero/NaN dimension means the manifest is malformed (a writer bug shipped a rect without
    // `h` once, and every sprite in the game drew as an invisible zero-height slice). Fail loudly.
    if (!(r.w > 0) || !(r.h > 0)) {
      throw new Error(`atlas ${name}: frame "${key}" has invalid size ${r.w}x${r.h}`);
    }
    const base = pageTextures[r.page]!;
    textures.set(key, new Texture({ source: base.source, frame: new Rectangle(r.x, r.y, r.w, r.h) }));
    pivots.set(key, { x: r.pivotX, y: r.pivotY });
    frames.set(key, r);
  }
  return {
    textures,
    pivots,
    frames,
    pageUrls: manifest.pages.map((p) => `${baseUrl}${p.file}`),
    pageSizes: manifest.pages.map((p) => ({ width: p.width, height: p.height })),
  };
}

/**
 * Load the shipping atlas.
 *
 * The default points at `atlas-final/`, which is the only atlas deployed with the game: the first-pass
 * and pilot atlases are superseded and have been moved to `docs/proof/atlas-archive/` so they are kept
 * as review evidence without being shipped to players.
 */
export async function loadAtlas(baseUrl = '/atlas-final/'): Promise<LoadedAtlas> {
  const [units, buildings] = await Promise.all([loadOne(baseUrl, 'units'), loadOne(baseUrl, 'buildings')]);
  const textures = new Map([...units.textures, ...buildings.textures]);
  const pivots = new Map([...units.pivots, ...buildings.pivots]);
  /**
   * The buildings manifest's page indices are OFFSET by the units manifest's page count, because a
   * building frame saying `page: 0` means the first BUILDINGS page — not the first units page. Without
   * the offset every building thumbnail cropped the wrong image.
   */
  const offset = units.pageUrls.length;
  const buildingFrames = new Map<string, FrameRect>();
  for (const [key, r] of buildings.frames) buildingFrames.set(key, { ...r, page: r.page + offset });
  const frames = new Map<string, FrameRect>([...units.frames, ...buildingFrames]);
  return {
    textures,
    pivots,
    frames,
    pageUrls: [...units.pageUrls, ...buildings.pageUrls],
    pageSizes: [...units.pageSizes, ...buildings.pageSizes],
  };
}
