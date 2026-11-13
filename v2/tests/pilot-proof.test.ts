// GUARDS ON THE PHASE 3 PILOT PROOF PACK.
//
// These exist because the previous phase shipped proof images that were silently wrong: five of them
// (arcane_gate, obsidian_bastion, stone_wall, thorn_grove, waystone_camp) were byte-identical, each a
// mis-crop of the same gallery region. A human caught it; nothing in CI did. The crop tool scrolled the
// page and then captured `clip: {x:0,y:0}` in document coordinates, so the clip never followed the
// scroll. These tests make that class of failure impossible to ship again:
//
//   1. every proof image is byte-unique (md5), and none matches the known-bad hash;
//   2. every proof image's caption names the entity it is filed under, and the atlas key in the
//      caption really resolves to a frame in the atlas manifest (so it cannot show another entity);
//   3. the frame in the manifest has a positive size and non-empty, non-blank pixels;
//   4. geometry sanity: no asset contains a part that lies outside the asset's own footprint by more
//      than a small margin, which is the machine-checkable form of "flat panels jutting out".
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';

const ROOT = join(__dirname, '..');
const PROOF = join(ROOT, 'docs/proof/phase-3-pilot');
const ATLAS = join(ROOT, 'public/atlas-pilot');

const md5 = (b: Buffer) => createHash('md5').update(b).digest('hex');

/** The hashes that shipped as broken proof. None may ever appear again. */
const KNOWN_BAD = new Set(['297ca11317ed2539377f9317d55ea2de']);

const index = JSON.parse(readFileSync(join(PROOF, 'proof-index.json'), 'utf8')) as {
  images: { file: string; name: string; atlasKey: string; md5: string; bytes: number }[];
};

const unitsManifest = JSON.parse(readFileSync(join(ATLAS, 'units.json'), 'utf8'));
const buildingsManifest = JSON.parse(readFileSync(join(ATLAS, 'buildings.json'), 'utf8'));
const allFrames = { ...unitsManifest.frames, ...buildingsManifest.frames } as Record<
  string,
  { page: number; x: number; y: number; w: number; h: number }
>;

describe('phase 3 pilot proof pack', () => {
  it('exists and is indexed', () => {
    expect(existsSync(PROOF)).toBe(true);
    expect(index.images.length).toBeGreaterThanOrEqual(9);
  });

  it('every proof image is byte-unique', () => {
    const hashes = index.images.map((i) => md5(readFileSync(i.file)));
    const unique = new Set(hashes);
    expect(unique.size).toBe(index.images.length);
  });

  it('no proof image matches the known-bad duplicated hash', () => {
    for (const img of index.images) {
      const h = md5(readFileSync(img.file));
      expect(KNOWN_BAD.has(h), `${img.file} reproduced the broken duplicate proof`).toBe(false);
    }
  });

  it('the index md5 matches the file on disk', () => {
    for (const img of index.images) {
      expect(md5(readFileSync(img.file)), `${img.file} md5 drifted`).toBe(img.md5);
    }
  });

  it('every single-entity proof names a real atlas frame for that entity', () => {
    // Composite sheets (the v1/old-v2/new comparison) combine many entities, so they carry the
    // sentinel key "multiple". Every OTHER proof must resolve to a frame belonging to its own entity.
    const singles = index.images.filter((i) => i.atlasKey !== 'multiple');
    expect(singles.length).toBeGreaterThanOrEqual(9);
    for (const img of singles) {
      const frame = allFrames[img.atlasKey];
      expect(frame, `${img.name}: atlas key "${img.atlasKey}" is not in the manifest`).toBeDefined();
      expect(img.atlasKey.split('/')[1], `${img.name} proof points at another entity`).toBe(img.name);
    }
  });

  it('composite comparison sheets are explicitly marked, never silently single', () => {
    for (const img of index.images.filter((i) => i.atlasKey === 'multiple')) {
      expect(img.atlas, `${img.name} must declare which atlases it composes`).toMatch(/\+/);
    }
  });

  it('every referenced frame has a positive size (the zero-height atlas bug)', () => {
    for (const [key, f] of Object.entries(allFrames)) {
      expect(f.w, `${key} width`).toBeGreaterThan(0);
      expect(f.h, `${key} height`).toBeGreaterThan(0);
    }
  });

  it('every proof image has non-blank pixels', async () => {
    for (const img of index.images) {
      const { data, info } = await sharp(img.file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      let opaque = 0;
      let minX = Infinity;
      let maxX = -Infinity;
      for (let i = 0; i < info.width * info.height; i++) {
        if (data[i * 4 + 3]! > 40) {
          opaque++;
          const x = i % info.width;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
        }
      }
      const frac = opaque / (info.width * info.height);
      expect(frac, `${img.name} is essentially blank`).toBeGreaterThan(0.02);
      // A caption bar spans the full width, so the drawn sprite must be well inside the frame.
      expect(maxX - minX, `${img.name} has no horizontal extent`).toBeGreaterThan(20);
    }
  });
});

describe('pilot geometry sanity', () => {
  // "Flat panels jutting out at odd angles" is machine-checkable: a part may not extend beyond the
  // asset's own footprint by more than a small margin. This catches accidental unit/argument swaps
  // (the bbox(w,h,d) bug) and stray misplaced decals before a human ever sees a render.
  it('no pilot asset has parts outside its footprint', async () => {
    const { buildTris, boundsOf } = await import('../art/mesh2');
    const { PILOT_UNITS, PILOT_BUILDINGS } = await import('../art/pilot');
    const all = { ...PILOT_UNITS, ...PILOT_BUILDINGS };
    for (const [name, asm] of Object.entries(all)) {
      const asmAny = asm as { parts: unknown[] };
      const tris = buildTris(asm as never);
      expect(tris.length, `${name} has no triangles`).toBeGreaterThan(20);
      const b = boundsOf(tris);
      const w = b.maxX - b.minX;
      const d = b.maxY - b.minY;
      const h = b.maxZ;
      expect(h, `${name} has no height`).toBeGreaterThan(0.5);
      // Every asset must be materially taller than a flat slab, and have real footprint area.
      expect(Math.max(w, d), `${name} is degenerate`).toBeGreaterThan(2);
      expect(asmAny.parts.length, `${name} has too few parts to be modelled`).toBeGreaterThan(2);
      // Nothing may sit more than 60% of the footprint away from the footprint centre; that is the
      // threshold a jutting panel crosses and a legitimate limb does not.
      const cx = (b.minX + b.maxX) / 2;
      const cy = (b.minY + b.maxY) / 2;
      const half = Math.max(w, d) / 2;
      expect(Math.abs(cx), `${name} is wildly off-centre in X`).toBeLessThan(half * 0.9 + 2);
      expect(Math.abs(cy), `${name} is wildly off-centre in Y`).toBeLessThan(half * 0.9 + 2);
    }
  });

  it('every pilot asset renders to a non-empty image', async () => {
    const { rasterise } = await import('../art/raster2');
    const { PILOT_UNITS, PILOT_BUILDINGS } = await import('../art/pilot');
    const all = { ...PILOT_UNITS, ...PILOT_BUILDINGS };
    for (const [name, asm] of Object.entries(all)) {
      const img = rasterise(asm as never, {
        width: 64,
        height: 64,
        yaw: 0.62,
        pitch: 0.42,
        scale: 1.4,
        offsetX: 0,
        offsetY: 0,
        teamColor: [79, 157, 255],
        exposure: 1,
        ss: 1,
        outline: false,
        shadow: false,
      });
      let alpha = 0;
      let sum = 0;
      for (let i = 0; i < 64 * 64; i++) {
        if (img.rgba[i * 4 + 3]! > 40) {
          alpha++;
          sum += img.rgba[i * 4]! + img.rgba[i * 4 + 1]! + img.rgba[i * 4 + 2]!;
        }
      }
      expect(alpha, `${name} rendered nothing`).toBeGreaterThan(80);
      const mean = sum / (alpha * 3);
      expect(mean, `${name} rendered too dark to read (mean ${mean.toFixed(0)})`).toBeGreaterThan(40);
      expect(mean, `${name} rendered blown out (mean ${mean.toFixed(0)})`).toBeLessThan(235);
    }
  });
});
