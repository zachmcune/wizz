// Dev preview: renders one roster asset to a PNG at a chosen facing.
//   npx esbuild art/preview3.ts --bundle --platform=node --format=esm --outfile=.pv3.mjs
//   node .pv3.mjs stone_golem 420 2
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { rasterise } from './raster2';
import { buildTris, boundsOf } from './mesh2';
import { ROSTER_UNITS, ROSTER_BUILDINGS } from './roster';


function png(rgba: Uint8ClampedArray, w: number, h: number): Buffer {
  const t = (() => { const a = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; a[n] = c; } return a; })();
  const crc = (b: Buffer) => { let c = -1; for (let i = 0; i < b.length; i++) c = t[(c ^ b[i]!) & 0xff]! ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const ch = (ty: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(ty, 'ascii'), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; for (let x = 0; x < w; x++) { const s = (y * w + x) * 4, d = y * (w * 4 + 1) + 1 + x * 4; raw[d] = rgba[s]!; raw[d + 1] = rgba[s + 1]!; raw[d + 2] = rgba[s + 2]!; raw[d + 3] = rgba[s + 3]!; } }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]), ch('IHDR', ih), ch('IDAT', deflateSync(raw, { level: 9 })), ch('IEND', Buffer.alloc(0))]);
}

const name = process.argv[2] ?? 'wisp';
const asm = ROSTER_UNITS[name] ?? ROSTER_BUILDINGS[name];
if (!asm) throw new Error(`no art for ${name}; known: ${[...Object.keys(ROSTER_UNITS), ...Object.keys(ROSTER_BUILDINGS)].join(', ')}`);
const SIZE = Number(process.argv[3] ?? 380);
const yaw = ((Number(process.argv[4] ?? 0) % 8) / 8) * Math.PI * 2;
const pitch = 0.42;

const tris = buildTris(asm);
boundsOf(tris);
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
mkdirSync('preview-out3', { recursive: true });
const out = `preview-out3/${name}-f${process.argv[4] ?? 0}.png`;
writeFileSync(out, png(img.rgba, SIZE, SIZE));
console.log('wrote', out, 'tris', tris.length);
