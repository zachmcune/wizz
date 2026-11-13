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
}

export function unitFrameKey(defId: string, teamId: string, facing: number): string {
  return `unit/${defId}/${teamId}/${facing}`;
}

export function buildingFrameKey(defId: string, teamId: string): string {
  return `building/${defId}/${teamId}/0`;
}

async function loadOne(baseUrl: string, name: string): Promise<{ textures: Map<string, Texture>; pivots: Map<string, { x: number; y: number }>; frames: Map<string, FrameRect> }> {
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
  return { textures, pivots, frames };
}

/** Load the pilot atlas from `atlas-pilot/`, which carries its pivots in the manifest. */
export async function loadPilotAtlas(baseUrl = '/atlas-pilot/'): Promise<LoadedAtlas> {
  return loadAtlas(baseUrl);
}

export async function loadAtlas(baseUrl = '/atlas/'): Promise<LoadedAtlas> {
  const [units, buildings] = await Promise.all([loadOne(baseUrl, 'units'), loadOne(baseUrl, 'buildings')]);
  const textures = new Map([...units.textures, ...buildings.textures]);
  const pivots = new Map([...units.pivots, ...buildings.pivots]);
  const frames = new Map([...units.frames, ...buildings.frames]);
  return { textures, pivots, frames };
}
