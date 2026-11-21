// Dev-only preview: renders one sprite to a PNG so art can be reviewed while iterating.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { rasterise } from './raster';
import { assemblyBounds } from './mesh';
import { UNIT_ART } from './units';
import { BUILDING_ART } from './buildings';

const here = dirname(fileURLToPath(import.meta.url));

/** Minimal PNG encoder (RGBA, no external deps). */
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

const name = process.argv[2] ?? 'stone_golem';
const assembly = UNIT_ART[name] ?? BUILDING_ART[name];
if (!assembly) throw new Error(`no art for ${name}`);

const SIZE = 320;
// Auto-fit: scale so the sprite fills ~82% of the frame.
const b = assemblyBounds(assembly);
const spanX = b.maxX - b.minX;
const spanY = b.maxY - b.minY;
const spanZ = b.maxZ;
const extent = Math.max(spanX, spanY) * 0.78 + spanZ * 0.72;
const scale = (SIZE * 0.82) / extent;
const img = rasterise(assembly, {
  width: SIZE, height: SIZE, yaw: 0.6, pitch: 0.52, scale,
  teamColor: [79, 157, 255], detail: 1, exposure: 1.05, shadow: true, ss: 3, outline: true,
});

const outDir = join(here, 'preview-out');
mkdirSync(outDir, { recursive: true });
const path = join(outDir, `${name}.png`);
writeFileSync(path, encodePng(img.rgba, img.width, img.height));
console.log('wrote', path);
