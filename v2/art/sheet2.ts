// PILOT REVIEW SHEET — one row per asset, with three size columns and four team colours.
//
// This is the tool used to JUDGE the art, so its layout must be correct. An earlier version drew all
// three sizes at the same x, overlapping them into an unreadable pile; that silently hid whether
// sprites worked at 22 px. The layout is now explicit: fixed columns, no overlap, and a caption.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { rasterise } from './raster2';
import { buildTris, type Assembly } from './mesh2';
import { PILOT_UNITS, PILOT_BUILDINGS } from './pilot';
import { TEAM_RAMP } from './palette';

function png(rgba: Uint8ClampedArray, w: number, h: number): Buffer {
  const t = (() => {
    const a = new Int32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; a[n] = c; }
    return a;
  })();
  const crc = (b: Buffer) => { let c = -1; for (let i = 0; i < b.length; i++) c = t[(c ^ b[i]!) & 0xff]! ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const ch = (ty: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(ty, 'ascii'), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; for (let x = 0; x < w; x++) { const s = (y * w + x) * 4, d = y * (w * 4 + 1) + 1 + x * 4; raw[d] = rgba[s]!; raw[d + 1] = rgba[s + 1]!; raw[d + 2] = rgba[s + 2]!; raw[d + 3] = rgba[s + 3]!; } }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]), ch('IHDR', ih), ch('IDAT', deflateSync(raw, { level: 9 })), ch('IEND', Buffer.alloc(0))]);
}

interface Tile { data: Uint8ClampedArray; w: number }

/** Render one asset at one pixel size for one team. `framing` keeps proportions consistent. */
function render(asm: Assembly, size: number, yaw: number, team: [number, number, number], ss: number): Tile {
  const tris = buildTris(asm);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const pitch = 0.5;
  const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  for (const t of tris) for (const p of [t.a, t.b, t.c]) {
    const x = p.x * cyw - p.y * syw;
    const y = p.x * syw + p.y * cyw;
    const sx = x, sy = y * cp - p.z * sp;
    minX = Math.min(minX, sx); maxX = Math.max(maxX, sx);
    minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
  }
  const extent = Math.max(maxX - minX, maxY - minY);
  const scale = (size * 0.92) / Math.max(1, extent);
  const img = rasterise(asm, {
    width: size, height: size, yaw, pitch, scale,
    offsetX: -(((minX + maxX) / 2) * scale),
    offsetY: -(((minY + maxY) / 2) * scale),
    teamColor: team, exposure: 1.0, ss, outline: true, shadow: true,
  });
  return { data: img.rgba, w: size };
}

const BG = 0x3a5434; // grass tone
const SIZES = [120, 56, 22];
const LABEL_W = 190;
const CELL_PAD = 10;
const COLS = 4; // one per team
const sizeCell = (s: number) => s + CELL_PAD;

// Layout: label | [size1 x 4 teams] | [size2 x 4] | [size3 x 4]
const groupW = (s: number) => COLS * sizeCell(s) + CELL_PAD * 2;
const W = LABEL_W + SIZES.reduce((a, s) => a + groupW(s), 0) + 20;
const ROW_H = 150;
const entries: [string, Assembly][] = [...Object.entries(PILOT_UNITS), ...Object.entries(PILOT_BUILDINGS)];
const H = ROW_H * entries.length + 70;

const sheet = new Uint8ClampedArray(W * H * 4);
for (let i = 0; i < W * H; i++) { sheet[i*4]=18; sheet[i*4+1]=17; sheet[i*4+2]=26; sheet[i*4+3]=255; }

// Simple 5x7 bitmap font for labels (no canvas dependency at build time).
const GLYPHS: Record<string, string[]> = {
  A:['01110','10001','10001','11111','10001','10001','10001'], B:['11110','10001','11110','10001','10001','10001','11110'],
  C:['01110','10001','10000','10000','10000','10001','01110'], D:['11110','10001','10001','10001','10001','10001','11110'],
  E:['11111','10000','11110','10000','10000','10000','11111'], F:['11111','10000','11110','10000','10000','10000','10000'],
  G:['01110','10001','10000','10111','10001','10001','01111'], H:['10001','10001','11111','10001','10001','10001','10001'],
  I:['11111','00100','00100','00100','00100','00100','11111'], J:['00111','00010','00010','00010','10010','10010','01100'],
  K:['10001','10010','11100','10100','10010','10001','10001'], L:['10000','10000','10000','10000','10000','10000','11111'],
  M:['10001','11011','10101','10001','10001','10001','10001'], N:['10001','11001','10101','10011','10001','10001','10001'],
  O:['01110','10001','10001','10001','10001','10001','01110'], P:['11110','10001','10001','11110','10000','10000','10000'],
  Q:['01110','10001','10001','10001','10101','10010','01101'], R:['11110','10001','10001','11110','10100','10010','10001'],
  S:['01111','10000','10000','01110','00001','00001','11110'], T:['11111','00100','00100','00100','00100','00100','00100'],
  U:['10001','10001','10001','10001','10001','10001','01110'], V:['10001','10001','10001','10001','10001','01010','00100'],
  W:['10001','10001','10001','10101','10101','11011','10001'], X:['10001','10001','01010','00100','01010','10001','10001'],
  Y:['10001','10001','01010','00100','00100','00100','00100'], Z:['11111','00001','00010','00100','01000','10000','11111'],
  '0':['01110','10001','10011','10101','11001','10001','01110'], '1':['00100','01100','00100','00100','00100','00100','01110'],
  '2':['01110','10001','00001','00110','01000','10000','11111'], '3':['11110','00001','00001','01110','00001','00001','11110'],
  '4':['00010','00110','01010','10010','11111','00010','00010'], '5':['11111','10000','11110','00001','00001','10001','01110'],
  '6':['00110','01000','10000','11110','10001','10001','01110'], '7':['11111','00001','00010','00100','01000','01000','01000'],
  '8':['01110','10001','10001','01110','10001','10001','01110'], '9':['01110','10001','10001','01111','00001','00010','01100'],
  '-':['00000','00000','00000','11111','00000','00000','00000'], '_':['00000','00000','00000','00000','00000','00000','11111'],
  '.':['00000','00000','00000','00000','00000','01100','01100'], ' ':['00000','00000','00000','00000','00000','00000','00000'],
  ':':['00000','01100','01100','00000','01100','01100','00000'], '/':['00001','00010','00010','00100','01000','01000','10000'],
};
function drawText(text: string, x0: number, y0: number, scale: number, rgb: [number, number, number]): void {
  let cx = x0;
  for (const chRaw of text.toUpperCase()) {
    const g = GLYPHS[chRaw] ?? GLYPHS[' ']!;
    for (let ry = 0; ry < 7; ry++) {
      for (let rx = 0; rx < 5; rx++) {
        if (g[ry]![rx] !== '1') continue;
        for (let py = 0; py < scale; py++) {
          for (let px = 0; px < scale; px++) {
            const dx = cx + rx * scale + px, dy = y0 + ry * scale + py;
            if (dx < 0 || dy < 0 || dx >= W || dy >= H) continue;
            const di = (dy * W + dx) * 4;
            sheet[di] = rgb[0]; sheet[di+1] = rgb[1]; sheet[di+2] = rgb[2]; sheet[di+3] = 255;
          }
        }
      }
    }
    cx += 6 * scale;
  }
}

function blit(t: Tile, x0: number, y0: number): void {
  for (let py = 0; py < t.w; py++) {
    for (let px = 0; px < t.w; px++) {
      const si = (py * t.w + px) * 4;
      const a = t.data[si + 3]! / 255;
      if (a <= 0.002) continue;
      const dx = x0 + px, dy = y0 + py;
      if (dx < 0 || dy < 0 || dx >= W || dy >= H) continue;
      const di = (dy * W + dx) * 4;
      const bgR = (BG >> 16) & 255, bgG = (BG >> 8) & 255, bgB = BG & 255;
      sheet[di] = t.data[si]! * a + bgR * (1 - a);
      sheet[di+1] = t.data[si+1]! * a + bgG * (1 - a);
      sheet[di+2] = t.data[si+2]! * a + bgB * (1 - a);
    }
  }
}

drawText('PILOT ART - 3 SIZES X 4 TEAMS', 14, 16, 2, [220, 214, 255]);
let colX = LABEL_W;
for (const s of SIZES) {
  drawText(`${s}PX`, colX + 6, 44, 2, [150, 200, 255]);
  colX += groupW(s);
}

entries.forEach(([name, asm], row) => {
  const y0 = 70 + row * ROW_H;
  drawText(name.replace(/_/g, ' '), 14, y0 + 54, 2, [235, 230, 255]);
  let x = LABEL_W;
  for (const size of SIZES) {
    // A subtle group background so the three size bands are visually separated.
    for (let yy = y0; yy < y0 + ROW_H - 10; yy++) {
      for (let xx = x; xx < x + groupW(size) - 4; xx++) {
        if (yy < 0 || xx < 0 || yy >= H || xx >= W) continue;
        const di = (yy * W + xx) * 4;
        sheet[di] = Math.min(255, sheet[di]! + 6);
        sheet[di+1] = Math.min(255, sheet[di+1]! + 6);
        sheet[di+2] = Math.min(255, sheet[di+2]! + 10);
      }
    }
    TEAM_RAMP.forEach((team, ti) => {
      const tile = render(asm, size, 0.62, team.color, size >= 56 ? 4 : 3);
      blit(tile, x + CELL_PAD + ti * sizeCell(size), y0 + 14);
    });
    x += groupW(size);
  }
});

mkdirSync('preview-out2', { recursive: true });
writeFileSync('preview-out2/sheet.png', png(sheet, W, H));
console.log('wrote preview-out2/sheet.png', W + 'x' + H, entries.length, 'assets');
