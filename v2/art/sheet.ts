// Dev-only contact sheet: renders every sprite into one PNG grid for review.
//
//   node .sheet.mjs [--units] [--buildings] [--yaw 0.6] [--size 200]

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { rasterise } from './raster';
import { projectedBounds } from './mesh';
import { UNIT_ART } from './units';
import { BUILDING_ART } from './buildings';

const here = dirname(fileURLToPath(import.meta.url));

function encodePng(rgba: Uint8ClampedArray, w: number, h: number): Buffer {
  const crcTable = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })();
  const crc = (buf: Buffer): number => {
    let c = -1;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const si = (y * w + x) * 4;
      const di = y * (w * 4 + 1) + 1 + x * 4;
      raw[di] = rgba[si]!;
      raw[di + 1] = rgba[si + 1]!;
      raw[di + 2] = rgba[si + 2]!;
      raw[di + 3] = rgba[si + 3]!;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const argv = process.argv.slice(2);
const opt = (name: string, dflt: string): string => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1]! : dflt;
};
const onlyUnits = argv.includes('--units');
const onlyBuildings = argv.includes('--buildings');
const yaw = Number(opt('yaw', '0.6'));
const CELL = Number(opt('size', '150'));

const entries: [string, typeof UNIT_ART[string]][] = [];
if (!onlyBuildings) entries.push(...Object.entries(UNIT_ART));
if (!onlyUnits) entries.push(...Object.entries(BUILDING_ART));

const COLS = 7;
const rows = Math.ceil(entries.length / COLS);
const W = COLS * CELL;
const H = rows * CELL;
const sheet = new Uint8ClampedArray(W * H * 4);

entries.forEach(([name, asm], i) => {
  const cx = (i % COLS) * CELL;
  const cy = Math.floor(i / COLS) * CELL;
  const pitch = 0.52;
  const b = projectedBounds(asm, yaw, pitch);
  const spanX = b.maxX - b.minX;
  const spanY = b.maxY - b.minY;
  const extent = Math.max(spanX, spanY);
  const scale = (CELL * 0.86) / Math.max(1, extent);
  // Centre the sprite's projected bounding box in the cell.
  const midX = ((b.minX + b.maxX) / 2) * scale;
  const midY = ((b.minY + b.maxY) / 2) * scale;
  const img = rasterise(asm, {
    width: CELL,
    height: CELL,
    yaw,
    pitch,
    scale,
    offsetX: -midX,
    offsetY: -midY,
    teamColor: [79, 157, 255],
    detail: 1,
    exposure: 1.05,
    shadow: true,
    ss: 3,
    outline: true,
  });
  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      const si = (y * CELL + x) * 4;
      const di = ((cy + y) * W + (cx + x)) * 4;
      const a = img.rgba[si + 3]! / 255;
      // Slight checker so transparent areas are visible.
      const bg = ((x >> 3) + (y >> 3)) % 2 === 0 ? 26 : 30;
      sheet[di] = img.rgba[si]! * a + bg * (1 - a);
      sheet[di + 1] = img.rgba[si + 1]! * a + (bg + 2) * (1 - a);
      sheet[di + 2] = img.rgba[si + 2]! * a + (bg + 10) * (1 - a);
      sheet[di + 3] = 255;
    }
  }
  void name;
});

mkdirSync(join(here, 'preview-out'), { recursive: true });
const path = join(here, 'preview-out', 'sheet.png');
writeFileSync(path, encodePng(sheet, W, H));
console.log('wrote', path, W + 'x' + H, entries.length + ' sprites');
