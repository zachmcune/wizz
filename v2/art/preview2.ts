// Dev preview for the production mesh system: renders one pilot asset to a PNG.
//   npx esbuild art/preview2.ts --bundle --platform=node --format=esm --outfile=.pv2.mjs
//   node .pv2.mjs wisp
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { rasterise } from './raster2';
import { buildTris, boundsOf } from './mesh2';
import { PILOT_UNITS, PILOT_BUILDINGS } from './pilot';

function png(rgba: Uint8ClampedArray, w: number, h: number): Buffer {
  const t = (() => {
    const a = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      a[n] = c;
    }
    return a;
  })();
  const crc = (b: Buffer) => {
    let c = -1;
    for (let i = 0; i < b.length; i++) c = t[(c ^ b[i]!) & 0xff]! ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
  const ch = (ty: string, d: Buffer) => {
    const l = Buffer.alloc(4);
    l.writeUInt32BE(d.length);
    const td = Buffer.concat([Buffer.from(ty, 'ascii'), d]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([l, td, c]);
  };
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4;
      const d = y * (w * 4 + 1) + 1 + x * 4;
      raw[d] = rgba[s]!;
      raw[d + 1] = rgba[s + 1]!;
      raw[d + 2] = rgba[s + 2]!;
      raw[d + 3] = rgba[s + 3]!;
    }
  }
  const ih = Buffer.alloc(13);
  ih.writeUInt32BE(w, 0);
  ih.writeUInt32BE(h, 4);
  ih[8] = 8;
  ih[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ch('IHDR', ih),
    ch('IDAT', deflateSync(raw, { level: 9 })),
    ch('IEND', Buffer.alloc(0)),
  ]);
}

const name = process.argv[2] ?? 'wisp';
const asm = PILOT_UNITS[name] ?? PILOT_BUILDINGS[name];
if (!asm) throw new Error(`no pilot art for ${name}`);
const SIZE = Number(process.argv[3] ?? 380);

const tris = buildTris(asm);
const b = boundsOf(tris);
// Hero angle for reviews: a 3/4 view looking DOWN at the model (positive pitch tilts the top of the
// model toward the viewer). An earlier preview used pitch 0.5 with an offset that framed the bbox
// centre including the ground shadow, so tall buildings were cropped at the base and read as if the
// camera were under the floor. Frame the model's own bounds, not the shadow.
const yaw = Number(process.argv[4] ?? 0.62);
const pitch = 0.42;
// Project to find framing.
let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
for (const t of tris) for (const p of [t.a, t.b, t.c]) {
  const x = p.x * cyw - p.y * syw;
  const y = p.x * syw + p.y * cyw;
  const sx = x, sy = y * cp - p.z * sp;
  minX = Math.min(minX, sx); maxX = Math.max(maxX, sx);
  minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
}
const extent = Math.max(maxX - minX, maxY - minY);
const scale = (SIZE * 0.88) / Math.max(1, extent);
const img = rasterise(asm, {
  width: SIZE, height: SIZE, yaw, pitch, scale,
  offsetX: -(((minX + maxX) / 2) * scale),
  offsetY: -(((minY + maxY) / 2) * scale),
  teamColor: [79, 157, 255], exposure: 0.98, ss: 3, outline: true, shadow: true,
});
mkdirSync('preview-out2', { recursive: true });
const out = `preview-out2/${name}.png`;
writeFileSync(out, png(img.rgba, SIZE, SIZE));
console.log('wrote', out, 'tris', tris.length, 'bbox', JSON.stringify(b));
