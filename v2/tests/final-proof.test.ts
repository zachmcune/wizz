// GUARDS ON THE PHASE 3 FINAL PROOF PACK.
//
// The pilot's proof bug is the reason these exist: five images shipped byte-identical because the crop
// tool scrolled a page then clipped at document coordinates, so every capture grabbed the same corner.
// Nothing in CI caught it; a human did. Every rule below corresponds to a way a proof can be wrong
// while still looking like a file:
//
//   * two files identical           -> md5 uniqueness
//   * a file showing another entity -> the atlas key must name its own entity
//   * a file showing nothing        -> a blank/extent check on the pixels
//   * a file that is a stale copy   -> the index md5 must match the bytes on disk
//   * a missing asset               -> the index must cover the whole roster
//
// It also guards the DELIVERABLES, so "the proof pack exists" is not an unchecked claim: the gallery
// screenshot, four in-match viewports, the terrain patch and the recording must all be present, and
// the recording must be a real video rather than an empty file.
import { closeSync, existsSync, openSync, readSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { ROSTER_UNITS, ROSTER_BUILDINGS } from '../art/roster';

const ROOT = join(__dirname, '..');
const PROOF = join(ROOT, 'docs/proof/phase-3-final');
const ATLAS = join(ROOT, 'public/atlas-final');

const md5 = (b: Buffer) => createHash('md5').update(b).digest('hex');

/** The hash that shipped as five identical broken proofs. It must never appear again. */
const KNOWN_BAD = '297ca11317ed2539377f9317d55ea2de';

const index = JSON.parse(readFileSync(join(PROOF, 'proof-index.json'), 'utf8')) as {
  images: { file: string; name: string; atlasKey: string; atlas: string; md5: string; bytes: number }[];
};

const unitsManifest = JSON.parse(readFileSync(join(ATLAS, 'units.json'), 'utf8'));
const buildingsManifest = JSON.parse(readFileSync(join(ATLAS, 'buildings.json'), 'utf8'));
const allFrames = { ...unitsManifest.frames, ...buildingsManifest.frames } as Record<
  string,
  { page: number; x: number; y: number; w: number; h: number }
>;

describe('phase 3 final proof pack: coverage', () => {
  it('has one proof sheet per asset in the roster', () => {
    const expected = Object.keys(ROSTER_UNITS).length + Object.keys(ROSTER_BUILDINGS).length;
    expect(expected).toBe(36); // 14 units + 21 buildings + the mana node resource
    expect(index.images.length).toBe(expected);
  });

  it('covers every unit and every building by name', () => {
    const proven = new Set(index.images.map((i) => i.name));
    for (const name of [...Object.keys(ROSTER_UNITS), ...Object.keys(ROSTER_BUILDINGS)]) {
      expect(proven.has(name), `no proof sheet for ${name}`).toBe(true);
    }
  });
});

describe('phase 3 final proof pack: every image is unique and shows its own entity', () => {
  it('every proof image is byte-unique', () => {
    const hashes = index.images.map((i) => md5(readFileSync(i.file)));
    const dupes = hashes.filter((h, i) => hashes.indexOf(h) !== i);
    expect(dupes, `duplicate proof images: ${[...new Set(dupes)].join(', ')}`).toEqual([]);
    expect(new Set(hashes).size).toBe(index.images.length);
  });

  it('no proof image reproduces the known-bad hash', () => {
    for (const img of index.images) {
      expect(md5(readFileSync(img.file)), `${img.file} reproduced the broken duplicate`).not.toBe(KNOWN_BAD);
    }
  });

  it('the index md5 matches the bytes on disk', () => {
    for (const img of index.images) {
      expect(md5(readFileSync(img.file)), `${img.file} md5 drifted from the index`).toBe(img.md5);
    }
  });

  it('every proof names a real atlas frame belonging to its own entity', () => {
    for (const img of index.images) {
      const frame = allFrames[img.atlasKey];
      expect(frame, `${img.name}: atlas key "${img.atlasKey}" resolves to nothing`).toBeDefined();
      // The atlas key is unit/<name>/<team>/<facing> or building/<name>/<team>/0.
      expect(img.atlasKey.split('/')[1], `${img.name} proof shows a different entity`).toBe(img.name);
    }
  });

  it('every referenced frame has a positive size', () => {
    for (const [key, f] of Object.entries(allFrames)) {
      expect(f.w, `${key} width`).toBeGreaterThan(0);
      expect(f.h, `${key} height`).toBeGreaterThan(0);
    }
  });

  it('every proof image actually contains a drawn sprite', async () => {
    for (const img of index.images) {
      const { data, info } = await sharp(img.file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      let opaque = 0;
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < info.width * info.height; i++) {
        if (data[i * 4 + 3]! > 40) {
          opaque++;
          const x = i % info.width;
          const y = (i / info.width) | 0;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
      const frac = opaque / (info.width * info.height);
      expect(frac, `${img.name} is essentially blank`).toBeGreaterThan(0.02);
      expect(maxX - minX, `${img.name} has no horizontal extent`).toBeGreaterThan(20);
      expect(maxY - minY, `${img.name} has no vertical extent`).toBeGreaterThan(20);
    }
  });
});

describe('phase 3 final proof pack: deliverables exist and are real', () => {
  it('has the full gallery screenshot and its report', () => {
    const shot = join(PROOF, 'gallery/gallery-full.png');
    expect(existsSync(shot), 'gallery screenshot missing').toBe(true);
    expect(statSync(shot).size, 'gallery screenshot suspiciously small').toBeGreaterThan(200_000);
    const report = JSON.parse(readFileSync(join(PROOF, 'gallery/gallery-report.json'), 'utf8')) as {
      units: number;
      buildings: number;
      frames: number;
      errors: string[];
    };
    expect(report.units).toBe(14);
    expect(report.buildings).toBe(21);
    expect(report.frames).toBeGreaterThan(400);
    expect(report.errors, 'gallery rendered with page errors').toEqual([]);
  });

  it('has an in-match screenshot at all four viewports', () => {
    const dir = join(PROOF, 'match');
    const report = JSON.parse(readFileSync(join(dir, 'match-report.json'), 'utf8')) as {
      shots: { viewport: string; zoom: number; aliveUnits: number; nondTerrainPixelFraction: number }[];
    };
    const wanted = ['phone-667x375', 'phone-844x390', 'chromebook-1366x768', 'desktop-1920x1080'];
    for (const vp of wanted) {
      const file = join(dir, `${vp}.png`);
      expect(existsSync(file), `missing in-match shot for ${vp}`).toBe(true);
      expect(statSync(file).size, `${vp} shot is too small to contain a scene`).toBeGreaterThan(40_000);
      const shot = report.shots.find((s) => s.viewport === vp);
      expect(shot, `${vp} missing from the report`).toBeDefined();
      // The shot must be at DEFAULT zoom and must actually contain units on screen.
      expect(shot!.zoom, `${vp} was not captured at default zoom`).toBe(1);
      expect(shot!.aliveUnits, `${vp} had no units alive`).toBeGreaterThan(10);
      expect(shot!.nondTerrainPixelFraction, `${vp} shows only empty terrain`).toBeGreaterThan(0.02);
    }
  });

  it('has a gameplay recording that is a real video', () => {
    const video = join(PROOF, 'phase3-final-gameplay.webm');
    expect(existsSync(video), 'gameplay recording missing').toBe(true);
    const size = statSync(video).size;
    expect(size, 'recording is too small to be real footage').toBeGreaterThan(200_000);
    // WebM/Matroska magic bytes, so this is a video container rather than a renamed file.
    const fd = openSync(video, 'r');
    const head = Buffer.alloc(4);
    readSync(fd, head, 0, 4, 0);
    closeSync(fd);
    expect(head[0]).toBe(0x1a);
    expect(head[1]).toBe(0x45);
    expect(head[2]).toBe(0xdf);
    expect(head[3]).toBe(0xa3);
  });

  it('has a terrain patch proof with rock, path and grass all present', () => {
    const dir = join(PROOF, 'terrain');
    const file = join(dir, 'terrain-cliff-and-ramp.png');
    expect(existsSync(file), 'terrain proof missing').toBe(true);
    const report = JSON.parse(readFileSync(join(dir, 'terrain-report.json'), 'utf8')) as {
      materialPixels: { grassPct: number; rockPct: number; dirtPct: number };
      errors: string[];
    };
    expect(report.materialPixels.rockPct, 'terrain proof has no cliff face').toBeGreaterThan(4);
    expect(report.materialPixels.grassPct, 'terrain proof has no grass').toBeGreaterThan(1);
    expect(report.errors).toEqual([]);
  });
});

describe('phase 3 final proof pack: atlas is complete for the roster', () => {
  it('has every unit frame for 8 facings and 4 teams', () => {
    const missing: string[] = [];
    for (const name of Object.keys(ROSTER_UNITS)) {
      for (const team of ['blue', 'red', 'green', 'gold']) {
        for (let f = 0; f < 8; f++) {
          if (!allFrames[`unit/${name}/${team}/${f}`]) missing.push(`unit/${name}/${team}/${f}`);
        }
      }
    }
    expect(missing, `missing atlas frames: ${missing.slice(0, 6).join(', ')}`).toEqual([]);
  });

  it('has every building frame for 4 teams', () => {
    const missing: string[] = [];
    for (const name of Object.keys(ROSTER_BUILDINGS)) {
      for (const team of ['blue', 'red', 'green', 'gold']) {
        if (!allFrames[`building/${name}/${team}/0`]) missing.push(`building/${name}/${team}/0`);
      }
    }
    expect(missing, `missing atlas frames: ${missing.slice(0, 6).join(', ')}`).toEqual([]);
  });

  it('stays inside the art budget the plan set: <= 2 MB and <= 3 pages', () => {
    const webpBytes = readdirSync(ATLAS)
      .filter((f) => f.endsWith('.webp'))
      .reduce((sum, f) => sum + statSync(join(ATLAS, f)).size, 0);
    const pages = unitsManifest.pages.length + buildingsManifest.pages.length;
    expect(webpBytes / 1048576, `art is ${(webpBytes / 1048576).toFixed(2)} MB`).toBeLessThanOrEqual(2);
    expect(pages, `art spans ${pages} pages`).toBeLessThanOrEqual(3);
  });
});
